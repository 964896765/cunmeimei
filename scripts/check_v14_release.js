'use strict';
// Strict release-readiness report. A pass here is not itself a WeChat certification.
// Never print secrets, test DB URLs, tokens, or source environment variables.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
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
const wx=checkWxRelease(project,runtime);
add('wechat_release_configuration',wx.ok,wx.ok?'basic configuration validated':wx.errors);
const migrationFiles=manifest();
add('migration_manifest',migrationFiles.length>=5&&new Set(migrationFiles.map(x=>x.checksum)).size===migrationFiles.length,
  migrationFiles.map(x=>x.name));
let pgValid=false;
if(process.env.PG_TEST_DATABASE_URL){
 try{require('../backend/src/test-database-guard').assertIsolatedDatabase(process.env.PG_TEST_DATABASE_URL);pgValid=true;}
 catch{pgValid=false;}
}
add('isolated_pg_test_database',pgValid,pgValid?'isolated test URI validated':'PG_TEST_DATABASE_URL absent or unsafe; no real PostgreSQL integration result');
if(pgValid){
 const result=spawnSync(process.execPath,['--test','tests/postgres.test.js'],{cwd:path.join(root,'backend'),encoding:'utf8',env:process.env,timeout:180000});
 add('real_postgresql_tests',result.status===0&&!/\bSKIP\b/.test(result.stdout||''),
  result.status===0?'test suite executed (review console output for counts)':'real PostgreSQL suite not passing');
}else add('real_postgresql_tests',false,'not executed');
// These require an actual devtools/device and compliance review; cannot be inferred from source tests.
add('wechat_devtools_and_device',false,'manual WeChat Developer Tools compilation and device sign-off are not recorded');
add('merchant_private_evidence',false,'production document workflow intentionally disabled pending security review');
add('business_compliance',false,'actual service categories, operator entity, filing and relevant approvals not verified');
const report={version:'0.14.0',ready:false,checks};
console.log(JSON.stringify(report,null,2));
process.exitCode=1;
