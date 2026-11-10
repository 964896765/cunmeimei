'use strict';
// Strict manual acceptance gate for the real PostgreSQL suite.
// Unlike `npm run test:pg`, a skipped test NEVER counts as success here.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {assertIsolatedDatabase}=require('./test-database-guard');

function evaluateIntegrationRun(result){
 const output=String(result.stdout||'');
 // Node --test --test-reporter=tap always prints aggregate TAP counts.
 const count=name=>{
  const match=output.match(new RegExp('(?:^|\\n)\\s*#\\s*'+name+'\\s+(\\d+)\\s*(?:\\r?\\n|$)','m'));
  return match?Number(match[1]):null;
 };
 const counts={tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),cancelled:count('cancelled')};
 const ok=result.status===0&&!result.error&&!result.signal&&counts.tests!==null&&counts.tests>0&&counts.passed===counts.tests&&counts.failed===0&&counts.skipped===0&&counts.cancelled===0;
 return {ok,counts,reason:ok?'POSTGRESQL_INTEGRATION_PASSED':result.error||result.signal?'POSTGRESQL_TEST_PROCESS_FAILED':counts.tests===null?'MISSING_TAP_SUMMARY':counts.skipped>0?'DATABASE_TEST_SKIPPED':'POSTGRESQL_INTEGRATION_FAILED'};
}
function verify({dsn=process.env.PG_TEST_DATABASE_URL,runner=spawnSync,checkDriver=true}={}){
 if(!dsn)return {ok:false,reason:'PG_TEST_DATABASE_URL_REQUIRED'};
 try{assertIsolatedDatabase(dsn);}catch{return {ok:false,reason:'UNSAFE_TEST_DATABASE_URL'};}
 if(checkDriver){try{require.resolve('pg');}catch{return {ok:false,reason:'PG_DRIVER_MISSING_RUN_NPM_INSTALL'};}}
 const result=runner(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap','tests/p0-security.test.js','tests/postgres.test.js','tests/product-capabilities.test.js','tests/trust-safety.test.js','tests/launch-foundation.test.js','tests/lifecycle-maintenance.test.js','tests/contribution-rewards.test.js','tests/reward-appeals.test.js','tests/booking-submissions.test.js','tests/project-polish.test.js','tests/workflows-integration.test.js','tests/project-journeys-integration.test.js','tests/business-progress.test.js','tests/booking-source-lifecycle.test.js'],{
  cwd:path.resolve(__dirname,'..'),env:{...process.env,PG_TEST_DATABASE_URL:dsn},encoding:'utf8',timeout:1200000,maxBuffer:2*1024*1024
 });
 const evaluated=evaluateIntegrationRun(result);
 if(!evaluated.ok){
  let diagnostic=String(result.stdout||'')+'\n'+String(result.stderr||'');
  const password=decodeURIComponent(new URL(dsn).password);
  for(const secret of [dsn,password].filter(Boolean))diagnostic=diagnostic.split(secret).join('[REDACTED]');
  diagnostic=diagnostic.replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[REDACTED_DATABASE_URL]');
  return {...evaluated,diagnostics:diagnostic.slice(-80000)};
 }
 return evaluated;
}
if(require.main===module){
 const result=verify();
 // Do not print connection URLs or process output; it can contain sensitive details.
 process.stdout.write(JSON.stringify({verification:'isolated_postgresql',...result},null,2)+'\n');
 if(!result.ok)process.exitCode=1;
}
module.exports={evaluateIntegrationRun,verify};
