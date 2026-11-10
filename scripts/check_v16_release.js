'use strict';
// V0.16 strict release-readiness report. A pass here is not itself a WeChat certification.
// Never print secrets, test DB URLs, tokens, or source environment variables.
const fs=require('node:fs');
const path=require('node:path');
const {verify}=require('../backend/src/verify-postgres-integration');
const root=path.resolve(__dirname,'..');
const envFile=path.join(root,'backend/.env');
if(fs.existsSync(envFile)&&typeof process.loadEnvFile==='function')process.loadEnvFile(envFile);
const {validateDeployment}=require('../backend/src/deployment-check');
const {checkWxRelease}=require('./check_wx_release');
const {manifest}=require('../backend/src/schema-migrations');
const checks=[];
function add(name,ok,details){checks.push({name,status:ok?'pass':'blocked',details});}
const config=validateDeployment({...process.env,NODE_ENV:'production'});
add('production_configuration',config.ok,config.ok?'required fields validated':config.errors);
const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
const runtime=require('../miniprogram/utils/runtime');
const privatePath=path.join(root,'project.private.config.json');
const wx=checkWxRelease(project,runtime,fs.existsSync(privatePath)?JSON.parse(fs.readFileSync(privatePath,'utf8')):{});
add('wechat_release_configuration',wx.ok,wx.ok?'basic configuration validated':wx.errors);
const migrationFiles=manifest();
add('migration_manifest',migrationFiles.length>=5&&new Set(migrationFiles.map(x=>x.checksum)).size===migrationFiles.length,
  migrationFiles.map(x=>x.name));
// A skipped PG test does not count as an integration sign-off.
const pgCheck=verify();
add('isolated_pg_test_database',!['PG_TEST_DATABASE_URL_REQUIRED','UNSAFE_TEST_DATABASE_URL'].includes(pgCheck.reason),
  pgCheck.reason==='PG_TEST_DATABASE_URL_REQUIRED'?'No test database configured':pgCheck.reason==='UNSAFE_TEST_DATABASE_URL'?'Unsafe test database URL':'Isolated test database URL checked');
add('real_postgresql_tests',pgCheck.ok,pgCheck.ok?'Real PostgreSQL integration executed without skips':pgCheck.reason);
// These require an actual devtools/device and compliance review; cannot be inferred from source tests.
add('wechat_devtools_and_device',false,'manual WeChat Developer Tools compilation and device sign-off are not recorded');
add('merchant_private_evidence',false,'production document workflow intentionally disabled pending security review');
add('business_compliance',false,'actual service categories, operator entity, filing and relevant approvals not verified');
const report={version:require('../backend/package.json').version,ready:false,checks};
console.log(JSON.stringify(report,null,2));
process.exitCode=1;
