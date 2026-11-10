'use strict';
// Credentials travel only in environment variables, never in command arguments or logs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
function pgEnvironment(dsn){
 const u=new URL(dsn);if(!['postgres:','postgresql:'].includes(u.protocol))throw Error('PostgreSQL URI required');
 return {...process.env,PGHOST:u.hostname.replace(/^\[|\]$/g,''),PGPORT:u.port||'5432',PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:u.searchParams.get('sslmode')||'prefer'};
}
function run(tool,args,dsn,{container='',input,output}={}){
 const env=pgEnvironment(dsn),stdio=['pipe','pipe','pipe'];let command=tool,argv=args;
 if(container){
  if(!/^[A-Za-z0-9_.-]+$/.test(container))throw Error('Invalid PostgreSQL tool container');
  command='docker';argv=['exec','-i',...['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE'].flatMap(k=>['-e',k]),container,tool,...args];
 }
 let inputFd,outputFd;
 try{
  if(input){inputFd=fs.openSync(input,'r');stdio[0]=inputFd;}
  if(output){outputFd=fs.openSync(output,'wx',0o600);stdio[1]=outputFd;}
  const result=spawnSync(command,argv,{env,stdio,timeout:300000,maxBuffer:4*1024*1024,windowsHide:true});
  if(result.status!==0||result.error||result.signal)throw Error(tool+' failed; inspect database availability and tool version (diagnostics withheld to protect credentials)');
  return result.stdout?.toString('utf8')||'';
 }finally{if(inputFd!==undefined)fs.closeSync(inputFd);if(outputFd!==undefined)fs.closeSync(outputFd);}
}
function checksum(file){
 const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024);
 try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));return hash.digest('hex');}finally{fs.closeSync(fd);}
}
function backup(dsn,file,options={}){
 if(!path.isAbsolute(file))throw Error('Backup path must be absolute');
 run('pg_dump',['--format=custom','--no-owner','--no-acl'],dsn,{...options,output:file});
 const digest=checksum(file);
 fs.writeFileSync(file+'.sha256',digest+'\n',{flag:'wx',mode:0o600});return {file,sha256:digest};
}
function restoreDrill(dsn,file,options={}){
 const env=pgEnvironment(dsn);
 if(!/^restore_drill_[a-z0-9_]+$/i.test(env.PGDATABASE))throw Error('Restore target must be a new, empty restore_drill_* database');
 const expected=fs.readFileSync(file+'.sha256','utf8').trim(),actual=checksum(file);
 if(expected!==actual)throw Error('Backup checksum mismatch');
 const existing=run('psql',['--no-psqlrc','--tuples-only','--no-align','--command',"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')"],dsn,options).trim();
 if(existing!=='0')throw Error('Restore target must be empty');
 // No --clean: restoring over existing objects fails and cannot destroy a database.
 run('pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-acl','--dbname='+env.PGDATABASE],dsn,{...options,input:file});
 return {restored:true,database:env.PGDATABASE};
}
if(require.main===module){
 try{const [operation,file]=process.argv.slice(2),dsn=process.env.RECOVERY_DATABASE_URL;if(!dsn||!file||!['backup','drill'].includes(operation))throw Error('Usage: RECOVERY_DATABASE_URL + database-recovery.js backup|drill ABSOLUTE_FILE');const options={container:process.env.PG_TOOL_CONTAINER||''};console.log(JSON.stringify(operation==='backup'?backup(dsn,file,options):restoreDrill(dsn,file,options)));}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={backup,restoreDrill,pgEnvironment};
