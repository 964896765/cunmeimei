'use strict';
// Deliberately restricted to the project's existing loopback development database.
// The original dump is retained outside the source tree; only our random drill DB is dropped.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Pool}=require('../backend/node_modules/pg');
const migrations=require('../backend/src/schema-migrations'),recovery=require('../backend/src/database-recovery');
const quote=value=>'"'+value.replace(/"/g,'""')+'"';
async function layout(pool){
 const rows=(await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname='public') ORDER BY table_name,ordinal_position")).rows,result={};
 for(const row of rows)(result[row.table_name]||=[]).push(row.column_name);return result;
}
async function fingerprint(pool,columns,{ignoreHistory=false}={}){
 const result={};for(const [table,names]of Object.entries(columns)){
  if(ignoreHistory&&table==='schema_migrations')continue;
  const rows=(await pool.query('SELECT row_to_json(t)::text value FROM (SELECT '+names.map(quote).join(',')+' FROM '+quote(table)+') t ORDER BY row_to_json(t)::text')).rows;
  result[table]={count:rows.length,hash:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
 }return result;
}
(async()=>{
 if(process.argv[2]!=='--apply')throw Error('Use --apply only for the guarded local development upgrade');
 const target=require('./local_database').resolveLocalDatabase(),applicationName='citylife_guarded_upgrade_'+crypto.randomBytes(6).toString('hex'),source=new Pool({connectionString:target.dsn,application_name:applicationName,max:3,connectionTimeoutMillis:5000});
 const name='restore_drill_local_upgrade_'+crypto.randomBytes(8).toString('hex');
 const directory=path.join(os.homedir(),'.codex','backups','city-life-miniapp');fs.mkdirSync(directory,{recursive:true});
 const file=path.join(directory,'citylife_dev_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+crypto.randomBytes(4).toString('hex')+'.dump');
 const toolUrl=new URL(target.dsn);toolUrl.port='5432';const drillUrl=new URL(target.dsn);drillUrl.pathname='/'+name;const drillToolUrl=new URL(toolUrl);drillToolUrl.pathname='/'+name;
 const report={scope:'local development only',database:'citylife_dev',status:'running',checkedAt:new Date().toISOString(),backupFile:file};
 let lock,drill,created=false,transaction=false,stage='inspect';
 const reportPath=path.resolve(__dirname,process.argv.includes('--login')?'../docs/login-v1/local-upgrade.json':process.argv.includes('--workflows')?'../docs/business-workflows/local-upgrade.json':'../docs/product-polish/local-upgrade.json');fs.mkdirSync(path.dirname(reportPath),{recursive:true});
 try{
  lock=await source.connect();await lock.query("SELECT pg_advisory_lock(hashtext('citylife-local-safe-upgrade'))");
  const status=await migrations.checkMigrations(source);assert.deepEqual(status.altered,[]);assert.deepEqual(status.unexpected,[]);
  if(status.ok){report.status='pass';report.alreadyCurrent=true;delete report.backupFile;console.log('PASS local development migrations already current');return;}
  const otherSessions=(await lock.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND application_name<>$1',[applicationName])).rows[0].n;
  assert.equal(otherSessions,0,'Stop local database clients before upgrading');
  const columns=await layout(lock);await lock.query('BEGIN');transaction=true;
  await lock.query('SET LOCAL lock_timeout=\'5s\'');await lock.query('LOCK TABLE '+Object.keys(columns).map(quote).join(',')+' IN SHARE MODE');
  const before=await fingerprint(lock,columns);report.originalTables=Object.keys(before).length;report.originalRows=Object.values(before).reduce((sum,x)=>sum+x.count,0);
  stage='backup';const dump=recovery.backup(toolUrl.toString(),file,{container:target.container});report.backupSha256=dump.sha256;
  stage='restore rehearsal';await source.query('CREATE DATABASE '+quote(name));created=true;
  recovery.restoreDrill(drillToolUrl.toString(),file,{container:target.container});drill=new Pool({connectionString:drillUrl.toString(),max:2});
  assert.deepEqual(await fingerprint(drill,columns),before);report.backupContentsMatch=true;
  stage='migration rehearsal';const rehearsed=await migrations.applyMigrations(drill);assert.equal(rehearsed.status.ok,true);
  const originalData=Object.fromEntries(Object.entries(before).filter(([key])=>key!=='schema_migrations'));
  assert.deepEqual(await fingerprint(drill,columns,{ignoreHistory:true}),originalData);report.rehearsalOriginalDataUnchanged=true;
  assert.deepEqual(await fingerprint(lock,columns),before);await lock.query('COMMIT');transaction=false;
  stage='development migration';const applied=await migrations.applyMigrations(source);assert.equal(applied.status.ok,true);report.appliedNow=applied.appliedNow;
  assert.deepEqual(await fingerprint(source,columns,{ignoreHistory:true}),originalData);report.developmentOriginalDataUnchanged=true;
  report.totalMigrations=migrations.manifest().length;report.finalTables=Object.keys(await layout(source)).length;report.status='pass';
  console.log('PASS local backup, restored migration rehearsal and original-data comparison; development schema upgraded');
 }catch(error){report.status='fail';report.failedStage=stage;console.error('Local upgrade failed during '+stage+'; backup retained if created, connection details withheld.');process.exitCode=1;}
 finally{
  try{if(transaction)await lock.query('ROLLBACK');if(drill)await drill.end();if(created){assert.match(name,/^restore_drill_local_upgrade_[a-f0-9]{16}$/);await source.query('DROP DATABASE '+quote(name));report.drillDatabaseRemoved=true;}}
  finally{if(lock){await lock.query("SELECT pg_advisory_unlock(hashtext('citylife-local-safe-upgrade'))");lock.release();}await source.end();fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
 }
})().catch(()=>{console.error('Guarded local upgrade refused; connection details withheld.');process.exitCode=1;});
