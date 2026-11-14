'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('../backend/node_modules/pg');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'docs/remediation/reference-system-2026-11-13');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,accept,label){
 for(let attempt=0;attempt<80;attempt++){
  const value=await read();
  if(accept(value))return value;
  await pause(200);
 }
 throw Error('Timed out '+label);
}
function handlers(route){
 const folder=path.join(root,'miniprogram',path.dirname(route));
 const sources=fs.readdirSync(folder).filter(name=>name.endsWith('.wxml')).map(name=>fs.readFileSync(path.join(folder,name),'utf8')).join('\n');
 return [...new Set([...sources.matchAll(/(?:bind|catch):?[a-zA-Z]+="([a-zA-Z_$][\w$]*)"/g)].map(match=>match[1]))];
}

async function main(){
 const dsn=process.env.PG_TEST_DATABASE_URL;
 require('../backend/src/test-database-guard').assertIsolatedDatabase(dsn);
 fs.mkdirSync(out,{recursive:true});
 const control=new Pool({connectionString:dsn});
 const schema='reference_ui_'+crypto.randomBytes(6).toString('hex');
 const checks=[],routes=[],exceptions=[];
 let pool,repo,server,mini,session,browser,cleanup,complete=false;
 const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);console.log('PASS '+label);};
 try{
  await control.query('CREATE SCHEMA "'+schema+'"');
  const options='-c search_path='+schema;
  pool=new Pool({connectionString:dsn,options});
  await require('../backend/src/schema-migrations').applyMigrations(pool);
  repo=require('../backend/src/pg-repository').createPgRepository(dsn,{options});
  await repo.seedRegions(['中心街道']);
  const uid=await repo.upsertIdentity('dev_local','reference-owner');
  const other=await repo.upsertIdentity('dev_local','reference-reader');
  await repo.updateProfile(uid,{displayName:'隔离验收账号'});
  const publication=await repo.createPublication(uid,{publicationConsent:require('../backend/tests/helpers/publication-confirmation').acceptedConsent(),type:'used',title:'隔离验收 · 二手信息',description:'本记录仅用于页面和入口检查，属于隔离测试内容。',district:'中心街道',price:'80',attributes:{categoryId:'C04G01S01',condition:'几乎全新',cityCode:'441900',districtCode:'441900003'}});
  await repo.reviewPublication(publication.id,'published','隔离测试信息');
  const application=await repo.createMerchant(uid,{name:'隔离验收商家',category:'维修',district:'中心街道'});
  await repo.submitMerchantEvidence(uid,application.id,{registrationCode:'ISOLATED-REFERENCE-001',licenseHolder:'隔离验收主体',evidenceReference:'仅用于本机读取测试'});
  const merchant=await repo.approveMerchantApplication(application.id,'隔离读取夹具，不是真实资质',true);
  const service=await repo.createMerchantService(uid,merchant.id,{publicationConsent:require('../backend/tests/helpers/publication-confirmation').acceptedConsent(),title:'隔离验收服务',description:'本记录仅用于预约及商家页面检查，不代表真实供给。',price:'100'});
  await repo.reviewService(service.id,'published');
  await repo.setPublicLocation(service.id,{kind:'service',cityCode:'441900',districtCode:'441900003',latitude:23.02,longitude:113.75,precision:'approximate',approved:true,categoryId:'C03',verificationNote:'隔离测试坐标'});
  const contact=(await pool.query("INSERT INTO contact_requests(publication_id,requester_id,owner_id,message,response,status) VALUES($1,$2,$3,'隔离联系申请','隔离已接受记录','accepted') RETURNING id",[publication.id,other,uid])).rows[0].id;
  const news=await repo.saveHomeContent(null,{kind:'news',title:'隔离验收资讯',summary:'仅用于来源与正文显示检查',body:'本条资讯仅用于隔离页面检查。',sourceName:'隔离测试来源',sourceUrl:'https://example.org/isolated-source',cityCode:'441900',startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),priority:1},'fixture');
  await repo.reviewHomeContent(news.id,{status:'published',revision:1,textReviewed:true,imagesReviewed:true,sourceReviewed:true,advertisingReviewed:true,reason:'隔离读取验收内容核对'},'fixture');
  const token='LOCAL_MEMORY_ONLY_FIXTURE_TOKEN_01234567890123456789';
  await repo.newSession(uid,crypto.createHash('sha256').update(token).digest('hex'),new Date(Date.now()+3600000).toISOString());
  server=require('../backend/src/server').createApp({repo,areas:['中心街道'],adminPassword:'isolated-reference-operator',wechatAppId:'wx1234567890abcdef',wechatSecret:'isolated-ui-provider-fixture',legalConfig:{contactEmail:'privacy@example.test'}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  mini=await require('./devtools_connection')();
  mini.on('exception',error=>exceptions.push(String(error.message||error.description||error)));
  session=await require('./devtools_fixture_session')(mini,{origin,uid,globalKey:'__referenceSystemAudit',bindRuntimeOrigin:true});
  await mini.evaluate(()=>{require('utils/geo-context.js').select('441900','');return true;});
  const go=async(route,query='')=>{
   await mini.reLaunch('/'+route+query);
   const page=await poll(()=>mini.currentPage(),page=>page.path===route,'route '+route);
   await pause(400);
   await poll(()=>page.data(),data=>!data.loading&&!data.summaryLoading&&!data.loadingItem&&!data.loadingSlots&&!data.configLoading,'settled '+route);
   return page;
  };
  const screenshot=async(name)=>{await pause(300);await mini.screenshot({path:path.join(out,name+'.png')});};
  for(const route of require('../miniprogram/app.json').pages){
   const name=route.split('/')[1];
   const queries={detail:'?id='+publication.id,booking:'?id='+service.id,chat:'?id='+contact,'publish-form':'?categoryId=C04G01S01',information:'?id='+news.id,'merchant-services':'?merchantId='+merchant.id,'merchant-bookings':'?merchantId='+merchant.id,'merchant-team':'?merchantId='+merchant.id,industry:'?projectId=C02G01S01',legal:'?kind=privacy'};
   const page=await go(route,queries[name]||'');
   const bound=handlers(route);
   const missing=await mini.evaluate(names=>names.filter(name=>typeof getCurrentPages().slice(-1)[0][name]!=='function'),bound);
   check(missing.length===0,'all '+bound.length+' page handlers resolve '+name+' '+missing.join(','));
   const header=await mini.evaluate(()=>{
    const component=getCurrentPages().slice(-1)[0].selectComponent('#navigation-header');
    return component?{height:component.data.headerHeight,capsule:wx.getMenuButtonBoundingClientRect().bottom}:null;
   });
   check(!!header&&header.height>=header.capsule,'capsule safety '+name);
   check((await page.data('themeClass')).includes('theme-prism'),'shared visual theme '+name);
   await screenshot('page-'+name);
   await mini.pageScrollTo(99999);await pause(200);await screenshot('page-'+name+'-bottom');await mini.pageScrollTo(0);
   routes.push({route,handlers:bound,missingHandlers:missing,header,screenshot:'page-'+name+'.png',bottomScreenshot:'page-'+name+'-bottom.png'});
  }
  // User-facing reference captures use a guest context and actual empty city queries.
  await mini.evaluate(()=>{
   require('utils/auth-intent.js').cancel();
   for(const key of ['city_life_user_id','city_life_v2_auth_token','city_life_session_expires_at'])wx.removeStorageSync(key);
   wx.setStorageSync('city_life_preferences_guest',{theme:'prism',largeText:false,reduceMotion:true,revision:1});
   require('utils/geo-context.js').select('310100','');
   return true;
  });
  for(const name of ['home','discover','publish','messages','me','login']){
   const page=await go('pages/'+name+'/index');
   if(name==='publish'){
    const choice=await page.$('.industry-choice[data-id="C04"]');
    await choice.tap();
    await poll(()=>page.data('selectedCategory'),value=>value==='C04','used directory');
   }
   if(name==='login'){
    const panel=await page.$('#login-panel');
    check((await panel.data('agreed'))===false,'login consent initially unchecked');
    check(!await panel.$('.phone-login'),'phone login deferred as requested');
    const icons=await panel.$$('.benefit-icon');
    const sizes=await Promise.all(icons.map(icon=>icon.size()));
    check(sizes.length===3&&sizes.every(size=>size.width===sizes[0].width&&size.height===sizes[0].height),'login icons have equal frames');
    check(!await panel.$('feedback-state'),'login avoids a nested status card');
    await screenshot('reference-login-unchecked');
    await (await panel.$('checkbox-group')).trigger('change',{value:['consent']});
    await poll(()=>panel.data('agreed'),Boolean,'explicit checkbox callback');
   }
   await screenshot('reference-'+name);
  }
  let page=await go('pages/legal/index','?kind=terms');
  check((await page.data('blocks')).some(block=>block.text==='第十四条 联系我们'),'all user-agreement chapters load');
  await screenshot('legal-terms');
  page=await go('pages/legal/index','?kind=privacy');
  check((await page.data('blocks')).some(block=>block.text==='第十三条 联系我们'),'all privacy chapters load');
  await screenshot('legal-privacy');
  browser=await require('./headless_browser')();
  await browser.navigate(origin+'/admin');
  await poll(()=>browser.evaluate('!!document.querySelector("#login-form")'),Boolean,'admin login form');
  await browser.evaluate('document.querySelector("#password").value="isolated-reference-operator";document.querySelector("#login-form").requestSubmit();true');
  await poll(()=>browser.evaluate('!document.querySelector("#dashboard").hidden'),Boolean,'admin authenticated');
  check(await browser.evaluate('document.querySelectorAll(".card").length>0'),'admin dashboard authenticates with real isolated API');
  await browser.screenshot(path.join(out,'admin-dashboard.png'));
  check(exceptions.length===0,'no captured application exceptions');
  complete=true;
 }finally{
  let restoreError;
  try{
   if(session)cleanup=await session.restore();
   if(mini){
    const local=await mini.reLaunch('/pages/login/index');
    await poll(()=>local.data(),data=>!!data.docs||!!data.error,'actual local login status');
    await pause(300);await mini.screenshot({path:path.join(out,'login-local-status.png')});
    await mini.reLaunch('/pages/home/index');
   }
  }catch(error){restoreError=error.message;}
  if(mini)await mini.disconnect();
  if(browser)await browser.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(repo)await repo.close();if(pool)await pool.end();
  await control.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await control.end();
  fs.writeFileSync(path.join(out,'ui-result.json'),JSON.stringify({status:complete&&!restoreError?'pass':'incomplete',checks,passed:checks.length,routes,exceptions,cleanup,restoreError,physicalDevice:false,realBackend:true,isolatedPostgres:true,referenceCaptures:'guest UI with empty Shanghai queries; login provider configuration and agreement callback are fixtures; no real WeChat authorization performed',checkedAt:new Date().toISOString()},null,2));
  if(restoreError)throw Error(restoreError);
 }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
