'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {evaluateIntegrationRun,verify}=require('../src/verify-postgres-integration');
function tap(tests,pass,fail,skipped,cancelled=0){return `TAP version 13\n1..${tests}\n# tests ${tests}\n# suites 0\n# pass ${pass}\n# fail ${fail}\n# cancelled ${cancelled}\n# skipped ${skipped}\n# todo 0\n`}
test('V0.15 strict PG check rejects skipped, empty and falsely green test runs',()=>{
 assert.equal(evaluateIntegrationRun({status:0,stdout:tap(1,0,0,1)}).reason,'DATABASE_TEST_SKIPPED');
 assert.equal(evaluateIntegrationRun({status:0,stdout:tap(0,0,0,0)}).ok,false);
 assert.equal(evaluateIntegrationRun({status:0,stdout:'test runner did nothing'}).reason,'MISSING_TAP_SUMMARY');
 assert.equal(evaluateIntegrationRun({status:1,stdout:tap(1,0,1,0)}).ok,false);
 assert.equal(evaluateIntegrationRun({status:0,stdout:tap(2,1,0,1)}).ok,false);
 assert.equal(evaluateIntegrationRun({status:0,stdout:tap(1,1,0,0),signal:'SIGTERM'}).ok,false);
});
test('V0.15 accepts only real positive TAP pass with zero skipped',()=>{
 const actual=evaluateIntegrationRun({status:0,stdout:tap(1,1,0,0)});
 assert.deepEqual(actual,{ok:true,counts:{tests:1,passed:1,failed:0,skipped:0,cancelled:0},reason:'POSTGRESQL_INTEGRATION_PASSED'});
});
test('V0.15 PG gate rejects missing or unsafe database before invoking a runner',()=>{
 let called=0;const runner=()=>{called++;return {status:0,stdout:tap(1,1,0,0)};};
 assert.equal(verify({dsn:'',runner,checkDriver:false}).reason,'PG_TEST_DATABASE_URL_REQUIRED');
 assert.equal(verify({dsn:'postgres://user:secret@production.example.com/prod_test',runner,checkDriver:false}).reason,'UNSAFE_TEST_DATABASE_URL');
 assert.equal(verify({dsn:'postgres://root:secret@127.0.0.1/prod_test',runner,checkDriver:false}).reason,'UNSAFE_TEST_DATABASE_URL');
 assert.equal(called,0);
 const good=verify({dsn:'postgres://test_user:secret@127.0.0.1/citylife_test',runner,checkDriver:false});
 assert.equal(good.ok,true);assert.equal(called,1);
});
test('V0.15 ephemeral compose has no fixed port and PowerShell invokes strict test gate',()=>{
 const root=path.resolve(__dirname,'../..');
 const compose=fs.readFileSync(path.join(root,'infrastructure/compose.postgres-test.yml'),'utf8');
 const ps=fs.readFileSync(path.join(root,'scripts/test_pg_local.ps1'),'utf8');
 assert.match(compose,/127\.0\.0\.1::5432/);
 assert.doesNotMatch(compose,/127\.0\.0\.1:55432/);
 assert.match(ps,/compose -p \$project -f \$compose port pgtest 5432/);
 assert.match(ps,/npm run verify:pg/);
 assert.match(ps,/Remove-Item Env:PG_TEST_DATABASE_URL/);
 assert.match(ps,/docker compose -p \$project -f \$compose down/);
});
