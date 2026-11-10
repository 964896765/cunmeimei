'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Pool}=require('../backend/node_modules/pg');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,accept,label){for(let i=0;i<100;i++){const value=await read();if(accept(value))return value;await pause(100);}throw Error('Timed out: '+label);}
(async()=>{
 const dsn=process.env.PG_TEST_DATABASE_URL;require('../backend/src/test-database-guard').assertIsolatedDatabase(dsn);
 const out=path.resolve(__dirname,'../docs/product-polish');fs.mkdirSync(out,{recursive:true});
 const schema='polish_ui_'+crypto.randomBytes(6).toString('hex'),control=new Pool({connectionString:dsn});
 const checks=[],exceptions=[],screenshots=[],screenshotFailures=[];let pool,repo,server,browser,mini,session,cleanup,stage='setup',complete=false;
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label);};
 const reportFile=path.join(out,'ui-result.json');fs.writeFileSync(reportFile,JSON.stringify({status:'running',checkedAt:new Date().toISOString()}));
 try{
  await control.query('CREATE SCHEMA "'+schema+'"');const options='-c search_path='+schema;pool=new Pool({connectionString:dsn,options});await require('../backend/src/schema-migrations').applyMigrations(pool);
  repo=require('../backend/src/pg-repository').createPgRepository(dsn,{options});await repo.seedRegions(['中心街道']);
  const uid=await repo.upsertIdentity('dev_local','native-polish-owner'),other=await repo.upsertIdentity('dev_local','native-polish-reader');await repo.updateProfile(uid,{displayName:'本机验收账号'});
  const image=await require('../backend/node_modules/sharp')({create:{width:960,height:540,channels:3,background:'#e8e4ed'}}).jpeg().toBuffer();const imageId=(await repo.uploadContentImage(uid,image)).id;
  const publication=(await pool.query("INSERT INTO publications(user_id,type,title,description,district,price,status,attributes,image_ids) VALUES($1,'used','本机验收闲置信息（非真实商品）','仅用于检查发现页、收藏和广告落地。不是实际交易供给。','中心街道','80','published',$2,$3) RETURNING id",[uid,{cityCode:'441900',condition:'几乎全新'},[imageId]])).rows[0].id;
  const service=(await pool.query("INSERT INTO service_catalog(title,description,district,price,status) VALUES('本机预约验收服务','仅用于页面加载验收','中心街道','100','published') RETURNING id")).rows[0].id;
  const contact=(await pool.query("INSERT INTO contact_requests(publication_id,requester_id,owner_id,message,response,status) VALUES($1,$2,$3,'本机验收联系申请','本机验收已同意','accepted') RETURNING id",[publication,other,uid])).rows[0].id;
  await pool.query('INSERT INTO saved_items(user_id,target_id) VALUES($1,$2)',[uid,publication]);
  const advertiser=await repo.createAdvertiser(uid,{name:'本机验收广告主（非真实商家）',reference:'fixture:AD-UI-001'});await repo.verifyAdvertiser(advertiser.id,{revision:1,status:'verified',validUntil:new Date(Date.now()+86400000).toISOString(),manuallyVerified:true,reason:'本机隔离夹具，不代表真实主体核验'},'fixture');
  const fields={cityCode:'441900',startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),priority:80};
  const news=await repo.saveHomeContent(null,{...fields,kind:'news',title:'本机验收资讯：邻里生活信息',summary:'这是一条带明确来源的隔离测试资讯。',body:'第一段：验证正文、来源、字体和换行。\n\n第二段：本内容仅用于本机验收，不是真实本地资讯。',sourceName:'本机验收来源',sourceUrl:'https://example.org/local-source'},'fixture');
  const ad=await repo.saveHomeContent(null,{...fields,kind:'ad',title:'本机验收广告（非真实商家）',summary:'人工审核与到期展示检查',targetId:publication,imageId,advertiserId:advertiser.id},'fixture');
  const review={status:'published',revision:1,textReviewed:true,imagesReviewed:true,sourceReviewed:true,advertisingReviewed:true,reason:'本机隔离夹具已核对，非真实内容发布'};await repo.reviewHomeContent(news.id,review,'fixture');await repo.reviewHomeContent(ad.id,review,'fixture');
  const ledger=await repo.postPoints(uid,{kind:'earn',amount:3,key:'native_polish_points_0001',source:'fixture:UI-POINTS',reason:'本机隔离验收积分通知，不是真实奖励',actor:'fixture'});
  const token='LOCAL_MEMORY_ONLY_FIXTURE_TOKEN_01234567890123456789';await repo.newSession(uid,crypto.createHash('sha256').update(token).digest('hex'),new Date(Date.now()+3600000).toISOString());
  server=require('../backend/src/server').createApp({repo,areas:['中心街道'],allowDevLogin:true,adminPassword:'polish-ui-operator-password',verificationAdminPassword:'polish-ui-verifier-password'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  stage='browser';browser=await require('./headless_browser')();await browser.navigate(base+'/admin');
  await poll(()=>browser.evaluate('!!document.querySelector("#login-form")'),Boolean,'admin login');
  await browser.evaluate('document.querySelector("#password").value="polish-ui-operator-password";document.querySelector("#login-form").requestSubmit();true');
  await poll(()=>browser.evaluate('!document.querySelector("#dashboard").hidden&&!!document.querySelector("#home-editor form")'),Boolean,'admin home editor');
  await browser.evaluate('document.querySelector("#home-console").open=true;true');
  check(await browser.evaluate('document.querySelectorAll("#home-content-list .item").length>=2'),'real browser authenticates and renders home content from PostgreSQL');
  const editorTitle='浏览器创建的隔离验收资讯';
  await browser.evaluate(`(()=>{const f=document.querySelector('#home-editor form'),v=${JSON.stringify({title:editorTitle,summary:'浏览器真实表单保存的测试摘要',body:'本机验收正文\n<script>window.__fixtureUnsafe=true</script>',sourceName:'本机表单来源',sourceUrl:'https://example.org/browser-source'})};for(const[k,x]of Object.entries(v))f.elements[k].value=x;f.requestSubmit();return true;})()`);
  let created=await poll(async()=>(await pool.query("SELECT id,revision,status FROM home_content WHERE payload->>'title'=$1",[editorTitle])).rows[0],Boolean,'browser draft');
  check(created.status==='draft'&&!await repo.publicHomeEntry(created.id),'browser saves a private draft and preserves source text as data');
  await poll(()=>browser.evaluate(`Array.from(document.querySelectorAll('#home-content-list .item')).some(e=>e.textContent.includes(${JSON.stringify(editorTitle)}))`),Boolean,'browser draft card');
  await browser.evaluate(`(()=>{window.prompt=()=>'本机浏览器验收：已核对来源和文字';window.confirm=()=>true;const c=Array.from(document.querySelectorAll('#home-content-list .item')).find(e=>e.textContent.includes(${JSON.stringify(editorTitle)}));for(const i of c.querySelectorAll('input[type=checkbox]'))i.checked=true;Array.from(c.querySelectorAll('button')).find(b=>b.textContent==='核查后发布').click();return true;})()`);
  await poll(async()=>await repo.publicHomeEntry(created.id),Boolean,'browser reviewed article');
  check(!await browser.evaluate('!!window.__fixtureUnsafe'),'browser publishes through reviewed controls without evaluating stored HTML-like text');
  await browser.evaluate('document.querySelector("#home-console").scrollIntoView();true');await browser.screenshot(path.join(out,'admin-home-content.png'));screenshots.push('admin-home-content.png');
  await browser.evaluate(`(()=>{const c=Array.from(document.querySelectorAll('#home-content-list .item')).find(e=>e.textContent.includes(${JSON.stringify(editorTitle)}));Array.from(c.querySelectorAll('button')).find(b=>b.textContent==='编辑草稿').click();return true;})()`);
  await poll(()=>browser.evaluate(`document.querySelector('#home-editor form').elements.title.value===${JSON.stringify(editorTitle)}`),Boolean,'editor restore');
  await browser.evaluate('document.querySelector("#home-editor form").elements.title.value="浏览器修订后须重新审核";document.querySelector("#home-editor form").requestSubmit();true');
  await poll(async()=>(await pool.query('SELECT status FROM home_content WHERE id=$1',[created.id])).rows[0].status,s=>s==='draft','edited draft');check(!await repo.publicHomeEntry(created.id),'editing published content removes it from the public feed immediately');
  await poll(()=>browser.evaluate('document.querySelector("#home-editor form").elements.title.value===""'),Boolean,'editor reset');
  await browser.evaluate('(()=>{const f=document.querySelector("#home-editor form");f.elements.kind.value="ad";f.elements.cityCode.value="441900";f.elements.kind.dispatchEvent(new Event("change"));return true;})()');
  await poll(()=>browser.evaluate(`Array.from(document.querySelector('#home-editor form').elements.targetChoice.options).some(o=>o.value===${JSON.stringify(publication)})`),Boolean,'advertisement target selector');
  await browser.evaluate(`(()=>{const f=document.querySelector('#home-editor form');f.elements.targetChoice.value=${JSON.stringify(publication)};f.elements.targetChoice.dispatchEvent(new Event('change'));f.elements.title.value='浏览器选择素材的广告草稿';return true;})()`);
  check(await browser.evaluate(`(()=>{const f=document.querySelector('#home-editor form');return f.elements.targetId.value===${JSON.stringify(publication)}&&f.elements.imageId.value===${JSON.stringify(imageId)}&&f.elements.advertiserId.value===${JSON.stringify(advertiser.id)};})()`),'browser selects approved information, its own image and matching verified advertiser without typing IDs');
  await browser.screenshot(path.join(out,'admin-ad-picker.png'));screenshots.push('admin-ad-picker.png');
  await browser.evaluate('document.querySelector("#home-editor form").requestSubmit();true');
  const selectedAd=await poll(async()=>(await pool.query("SELECT id,status FROM home_content WHERE payload->>'title'='浏览器选择素材的广告草稿'")).rows[0],Boolean,'selected advertisement draft');
  check(selectedAd.status==='draft'&&!await repo.publicHomeEntry(selectedAd.id),'selecting ad materials still requires an explicit review before public display');
  await browser.evaluate('document.querySelector("#logout").click();true');await poll(()=>browser.evaluate('!document.querySelector("#login").hidden'),Boolean,'browser logout');
  await browser.close();browser=null;
  stage='wechat';mini=await require('./devtools_connection')();mini.on('exception',e=>exceptions.push(String(e.message||e.description||'runtime exception')));
  session=await require('./devtools_fixture_session')(mini,{origin:base,uid,globalKey:'__projectPolishAudit',bindRuntimeOrigin:true});
  await mini.callWxMethod('setStorageSync','city_life_browse_city',{cityCode:'441900',districtCode:'',source:'manual'});
  const routes=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../miniprogram/app.json'),'utf8')).pages;
  for(const route of routes){
   const query=route==='pages/detail/index'?'?id='+publication:route==='pages/booking/index'?'?id='+service:route==='pages/chat/index'?'?id='+contact:route==='pages/publish-form/index'?'?categoryId=C04G01S01':route==='pages/information/index'?'?id='+news.id:'';
   const page=await mini.reLaunch('/'+route+query);await pause(200);check(page.path===route&&(await page.$$('view')).length>0,'WeChat renders '+route);
  }
  let page=await mini.reLaunch('/pages/home/index');await poll(()=>page.data(),d=>!d.loading&&d.banners.length===1&&d.news.length>0,'actual home content');
  check((await page.data()).banners[0].label==='广告','home displays a real reviewed placement with an explicit ad label');
  const bannerImage=await mini.callWxMethod('getImageInfo',{src:(await page.data()).banners[0].cover});check(bannerImage.width===960&&bannerImage.height===540,'home banner image downloads from the actual isolated media endpoint');
  await (await page.$('.news-entry')).tap();page=await poll(()=>mini.currentPage(),p=>p.path==='pages/information/index','news route');await poll(()=>page.data(),d=>!!d.item&&!d.loading,'news detail');check((await page.data()).item.sourceName==='本机验收来源','home news opens actual sourced article content');
  page=await mini.reLaunch('/pages/discover/index');await poll(()=>page.data(),d=>!d.loading&&d.filtered.some(x=>x.id===publication&&x.favoriteKnown),'discovery saved state');
  check((await page.data()).filtered.find(x=>x.id===publication).isSaved===true,'discovery starts with the real saved state instead of showing a false unselected button');
  const discoveryImage=await mini.callWxMethod('getImageInfo',{src:(await page.data()).filtered.find(x=>x.id===publication).cover});check(discoveryImage.width>0&&discoveryImage.height>0,'discovery thumbnail downloads from the actual isolated media endpoint');
  page=await mini.reLaunch('/pages/messages/index');await poll(()=>page.data(),d=>!d.loading&&d.items.some(x=>x.targetKind==='points-ledger'),'points notification');
  await mini.evaluate(()=>{const p=getCurrentPages().slice(-1)[0];p.tab({currentTarget:{dataset:{tab:'notices'}}});p.filterNotices({currentTarget:{dataset:{category:'points'}}});return true;});
  await poll(()=>page.data(),d=>d.visibleNotices.length>0,'points category');check(!(await page.$$('.planned')).length,'points notification category is active and has no obsolete planned badge');
  try{await (await page.$('.notice-row')).tap();}catch(error){if(!/timeout/i.test(error.message)||(await mini.currentPage()).path!=='pages/me/index')throw error;console.log('NOTE tap response timed out after the expected points navigation completed');}
  page=await poll(()=>mini.currentPage(),p=>p.path==='pages/me/index','points workspace');await poll(()=>page.data(),d=>d.mode==='points'&&!d.pointsBusy&&d.pointsFocusId===ledger.id,'points focus');
  check((await page.data()).pointsRows.some(x=>x.id===ledger.id),'points notification opens its matching owned ledger entry');
  for(const theme of ['prism','dark','clear','quiet','warm','gentle']){
   await mini.callWxMethod('setStorageSync','city_life_preferences_'+uid,{theme,largeText:false,reduceMotion:true,notificationPreview:true,allowContacts:true,revision:1});page=await mini.reLaunch('/pages/discover/index');await poll(()=>page.data(),d=>!d.loading&&d.displayPreferences.theme===theme,'theme '+theme);
   // Automator does not support :not(); it otherwise silently returns the first tab.
   const component=await page.$('#business-channels'),selected=await component.$('#channel-all'),normal=await component.$('#channel-housing');
   const selectedColor=await selected.style('color'),normalColor=await normal.style('color'),weight=await selected.style('font-weight');
   check(selectedColor!==normalColor&&weight==='600','selected and normal channel states remain distinct in '+theme);
  }
  await mini.callWxMethod('setStorageSync','city_life_preferences_'+uid,{theme:'prism',largeText:true,reduceMotion:true,notificationPreview:true,allowContacts:true,revision:1});page=await mini.reLaunch('/pages/discover/index');await poll(()=>page.data(),d=>!d.loading&&d.displayPreferences.largeText,'large text');const component=await page.$('#business-channels'),selected=await component.$('.is-selected');check(parseFloat(await selected.style('font-size'))>=16,'large-text channel controls preserve readable text');
  for(const route of ['home','discover','publish','messages','me']){
   page=await mini.reLaunch('/pages/'+route+'/index');await pause(600);
   try{await mini.screenshot({path:path.join(out,'native-'+route+'.png')});screenshots.push('native-'+route+'.png');}catch{screenshotFailures.push(route);console.log('NOTE screenshot unavailable for '+route);}
  }
  check(exceptions.length===0,'no captured WeChat runtime exceptions');
  cleanup=await session.restore();session=null;await mini.reLaunch('/pages/home/index');check(cleanup.authStorageUnchanged&&cleanup.runtimeOverlayRemoved,'original authentication storage is unchanged and runtime overlay removed');complete=true;
  fs.writeFileSync(reportFile,JSON.stringify({status:'pass',checks,passed:checks.length,exceptions,screenshots,screenshotFailures,cleanup,realBackend:true,isolatedPostgres:true,headlessBrowser:true,physicalDevice:false,modalCallbacks:'browser prompts simulated; no real messages or customers',checkedAt:new Date().toISOString()},null,2));
 }catch(error){fs.writeFileSync(reportFile,JSON.stringify({status:'fail',stage,checks,passed:checks.length,failed:1,reason:error.message,screenshots,screenshotFailures,checkedAt:new Date().toISOString()},null,2));throw error;}
 finally{
  if(browser)await browser.close();if(session){cleanup=await session.restore();if(mini)await mini.reLaunch('/pages/home/index');}if(mini)await mini.disconnect();
  if(cleanup)fs.writeFileSync(path.join(out,'cleanup.json'),JSON.stringify({...cleanup,runCompleted:complete,checkedAt:new Date().toISOString()},null,2));
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(repo)await repo.close();if(pool)await pool.end();try{await control.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}finally{await control.end();}
 }
})().catch(error=>{console.error('Product UI acceptance failed: '+error.message);process.exitCode=1;});
