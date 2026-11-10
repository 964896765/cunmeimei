'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {manifest,compareMigrations,checkMigrations,applyMigrations} = require('../src/schema-migrations');
function fakePool() {
  let applied = [], exists = false, failing = '';
  const c = {release(){}, async query(sql,values=[]) {
    if(sql.startsWith('SELECT pg_advisory_')) return {rows:[{}]};
    if(sql.startsWith('SELECT to_regclass')) return {rows:[{table_name:exists?'schema_migrations':null}]};
    if(sql.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) {exists=true;return {rows:[]};}
    if(sql.startsWith('SELECT name,checksum')) return {rows:applied.map(x=>({...x}))};
    if(sql==='BEGIN'){this.snapshot=applied.map(x=>({...x}));return {rows:[]};}
    if(sql==='ROLLBACK'){applied=this.snapshot;return {rows:[]};}
    if(sql==='COMMIT')return {rows:[]};
    if(sql.startsWith('INSERT INTO schema_migrations')){applied.push({name:values[0],checksum:values[1]});return {rows:[]};}
    if(failing && sql.includes(failing))throw Error('Injected SQL failure');
    return {rows:[]};
  }};
  return {connect:async()=>c,get history(){return applied;},failOn:x=>{failing=x;},tamper:(name,hash)=>{applied.find(x=>x.name===name).checksum=hash;}};
}
test('migration manifest is ordered, deterministic and has checksums',()=>{
 const files=manifest();assert.deepEqual(files.slice(0,5).map(x=>x.name),['001_init.sql','002_merchant_ops.sql','003_private_licenses_slots.sql','004_region_taxonomy.sql','005_publication_revision.sql']);
 assert.equal(new Set(files.map(x=>x.name)).size,files.length);
 for(const x of files)assert.match(x.checksum,/^[a-f0-9]{64}$/);
 const diff=compareMigrations(files,[{name:files[0].name,checksum:files[0].checksum},{name:'999_unknown.sql',checksum:'0'}]);
 assert.deepEqual(diff.missing,files.slice(1).map(x=>x.name));assert.deepEqual(diff.unexpected,['999_unknown.sql']);assert.equal(diff.ok,false);
});
test('migrations apply exactly once, changes are rejected, and missing history fails checking',async()=>{
 const pool=fakePool();assert.equal((await checkMigrations(pool)).ok,false);
 const first=await applyMigrations(pool);assert.equal(first.appliedNow.length,manifest().length);assert.equal(first.status.ok,true);
 const second=await applyMigrations(pool);assert.equal(second.appliedNow.length,0);
 pool.tamper('002_merchant_ops.sql','0'.repeat(64));
 const changed=await checkMigrations(pool);assert.deepEqual(changed.altered,['002_merchant_ops.sql']);
 await assert.rejects(applyMigrations(pool),/Migration history mismatch/);
});
test('failed SQL rolls back its migration and resumes from next pending version',async()=>{
 const pool=fakePool();pool.failOn('-- V0.3: merchant');
 await assert.rejects(applyMigrations(pool),/rolled back/);
 assert.deepEqual(pool.history.map(x=>x.name),['001_init.sql']);
 pool.failOn('');const second=await applyMigrations(pool);
 assert.deepEqual(second.appliedNow,manifest().slice(1).map(x=>x.name));
 assert.equal((await checkMigrations(pool)).ok,true);
});
