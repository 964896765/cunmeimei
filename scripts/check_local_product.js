'use strict';
// Read-only acceptance of the actual persistent local service. Never prints user rows.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const target=require('./local_database').resolveLocalDatabase(),{Pool}=require('../backend/node_modules/pg'),pool=new Pool({connectionString:target.dsn,max:1});
 const base='http://127.0.0.1:3101',checks=[];
 async function get(route,status=200){const response=await fetch(base+route,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,status,route);return response.json();}
 try{
  assert.equal((await get('/api/v1/health')).ok,true);checks.push('local API health');
  assert.equal((await get('/api/v1/ready')).ready,true);checks.push('all migration checks ready');
  const schema=await require('../backend/src/schema-migrations').checkMigrations(pool);assert.equal(schema.ok,true);
  const home=await get('/api/v1/home?cityCode=441900');assert.equal(home.supported,true);assert.ok(Array.isArray(home.news)&&Array.isArray(home.banners));checks.push('persistent home content API');
  const rules=(await get('/api/v1/points/rules')).items;assert.equal(rules.length,5);assert.ok(rules.every(rule=>!rule.enabled));checks.push('five contribution rules remain disabled');
  for(const route of ['/admin/api/home-content','/api/v1/points/account','/api/v1/me/saved-state?ids=11111111-1111-4111-8111-111111111111'])await get(route,401);checks.push('admin and owned data require authentication');
  if(process.argv.includes('--workflows')){const config=await get('/api/v1/config');assert.equal(config.features.industryWorkflows,true);assert.equal(config.features.benefitRedemption,true);assert.equal(config.features.selfPromotion,true);assert.ok(Array.isArray((await get('/api/v1/benefits')).items));await get('/api/v1/industry/me/credentials',401);await get('/api/v1/promotions/context',401);checks.push('industry, redemption and self-promotion routes connected');}
  if(process.argv.includes('--login')){const legal=await get('/api/v1/legal');assert.equal(legal.brand,'青方睐村美美');assert.equal(typeof legal.configured,'boolean');await get('/api/v1/me/trust',401);checks.push('public legal documents and authenticated trust route');}
  const report={status:'pass',checkedAt:new Date().toISOString(),scope:'persistent loopback development service only',port:3101,migrations:require('../backend/src/schema-migrations').manifest().length,checks,homeNewsCount:home.news.length,homeBannerCount:home.banners.length,seededLiveContent:false};
  fs.writeFileSync(path.resolve(__dirname,process.argv.includes('--login')?'../docs/login-v1/local-service.json':process.argv.includes('--workflows')?'../docs/business-workflows/local-service.json':'../docs/product-polish/local-service.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await pool.end();}
})().catch(()=>{console.error('Local product acceptance failed; user data and connection details withheld.');process.exitCode=1;});
