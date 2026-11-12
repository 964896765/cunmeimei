'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const connect=require('./devtools_connection'),{palettes,resolvePalette}=require('../miniprogram/utils/palettes');
const base=require('../miniprogram/utils/runtime').apiBaseUrl,pause=ms=>new Promise(r=>setTimeout(r,ms));
async function req(route,method='GET',body,user={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(user.token?{Authorization:'Bearer '+user.token}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,'local API '+method+' '+route.split('?')[0]+' HTTP '+r.status);return r.json();}
async function poll(read,accept,label){for(let i=0;i<60;i++){const value=await read();if(accept(value))return value;await pause(150);}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await connect(),checks=[],errors=[],keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode'],original=[];
 const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
 const route=async url=>{await mini.evaluate(url=>{setTimeout(()=>wx.reLaunch({url}),100);return true;},url);await pause(2600);return poll(()=>mini.currentPage(),p=>p?.path===url.split('?')[0].slice(1),'route '+url);};
 const home=async()=>{const p=await route('/pages/me/index');await poll(()=>p.data(),d=>!d.summaryLoading,'personal summary');return p;};
 const shot=async name=>{await mini.pageScrollTo(0);await pause(200);await mini.screenshot({path:path.resolve('docs/profile-settings-'+name+'.png')});};
 const call=async(name,...args)=>{await mini.evaluate((name,args)=>{setTimeout(()=>getCurrentPages().slice(-1)[0][name](...args),0);return true;},name,args);await pause(250);};
 let user,prefKey,modalMocked=false;
 mini.on('exception',e=>errors.push(e));
 try{
  for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));
  user=await req('/api/v1/dev/login','POST',{devUser:'me-layout-'+Date.now()});prefKey='city_life_preferences_'+user.userId;
  for(const [i,value]of [user.token,user.userId,true].entries())await mini.callWxMethod('setStorageSync',keys[i],value);
  const fixture=JSON.parse(fs.readFileSync('docs/local-business-result.json','utf8'));
  await req('/api/v1/items/'+fixture.publicationId+'/saved','PUT',{},user);
  let page=await home(),data=await page.data(),summary=await req('/api/v1/me/summary','GET',undefined,user);
  check(data.postCount===summary.publications&&data.favCount===summary.saved&&data.bookingCount===summary.bookings&&data.favCount===1,'workspace counts match real PostgreSQL summary including zero');
  const labels=[];for(const item of await page.$$('.workspace-label'))labels.push(await item.text());check(labels.join('、')==='我的发布、我的草稿、我的收藏、我的预约','four workspaces render once in the reference order');
  check(!!await page.$('.profile-entry')&&!!await page.$('.points-entry')&&!!await page.$('.merchant-entry')&&(await page.$$('.center-menu>button')).length===8,'profile, planned points, merchant and eight grouped settings rows render');await shot('main');
  await(await page.$('.saved-entry')).tap();await poll(()=>page.data(),d=>d.mode==='saved'&&!d.loading,'saved');check((await page.data('items')).some(x=>x.id===fixture.publicationId),'favorites entry reads actual saved information');
  await call('back');await poll(()=>page.data(),d=>d.mode==='main','main');
  await route('/pages/detail/index?id='+fixture.publicationId);page=await home();await(await page.$('.history-entry')).tap();await poll(()=>page.data(),d=>d.mode==='history'&&!d.loading,'history');check((await page.data('items')).some(x=>x.id===fixture.publicationId),'history entry revalidates the real viewed item');
  // Native route transitions can invalidate the SDK's element context mid-tap.
  // Invoke the real, rendered entry's handler asynchronously; finger taps remain device acceptance.
  console.log('STAGE real business destinations');
  page=await home();await call('goPosts');await pause(1800);await poll(()=>mini.currentPage(),p=>p.path==='pages/my-posts/index','my posts');check(true,'My posts retains the actual management route');
  page=await home();await call('goDrafts');await pause(1800);let next=await poll(()=>mini.currentPage(),p=>p.path==='pages/publish/index','draft route');await poll(()=>next.data(),d=>d.showDrafts,'draft management');check(true,'draft shortcut opens existing local/account draft management');
  page=await home();await call('goBookings');await pause(1800);await poll(()=>mini.currentPage(),p=>p.path==='pages/my-bookings/index','booking route');check(true,'My bookings retains the actual business route');
  page=await home();await call('goMerchant');await pause(1800);next=await poll(()=>mini.currentPage(),p=>p.path==='pages/merchant/index','merchant route');await poll(()=>next.data(),d=>d.online,'merchant data');check(await next.data('mode')==='apply','merchant entry retains application rather than granting merchant privileges');
  page=await home();await(await page.$('.profile-entry')).tap();await poll(()=>page.data(),d=>d.mode==='profile'&&!d.summaryLoading,'profile');check((await page.$$('.profile-field')).length===3&&!!await page.$('.avatar-editor'),'profile arrow opens three fields and a single avatar editor');await shot('profile');
  await mini.mockWxMethod('showModal',{confirm:true,cancel:false,content:'个人中心本地验收'});modalMocked=true;
  await call('editProfileField',{currentTarget:{dataset:{field:'displayName'}}});await poll(()=>req('/api/v1/me/profile','GET',undefined,user),r=>r.displayName==='个人中心本地验收','name persisted');await poll(()=>page.data(),d=>d.displayName==='个人中心本地验收'&&!d.summaryLoading,'profile refresh');check(true,'display-name editing still persists through existing API');
  await mini.restoreWxMethod('showModal');modalMocked=false;await shot('profile-edited');await call('openAccount');check(!!await page.$('.account-panel')&&!(await page.$('.profile-fields')),'account security excludes profile editing');await shot('account');
  await call('back');await poll(()=>page.data(),d=>d.mode==='main','main');await(await page.$('.help-entry')).tap();await poll(()=>page.data(),d=>d.mode==='help','help');check(!!await page.$('.about-action'),'help retains usage guidance and clearly labels unavailable independent appeals');
  await call('back');await poll(()=>page.data(),d=>d.mode==='main','main');await(await page.$('.privacy-entry')).tap();await poll(()=>page.data(),d=>d.mode==='privacy'&&!d.settingsBusy,'privacy');check((await page.$$('switch')).length===2&&!(await page.$('textarea')),'privacy keeps display, accessibility and blacklist without notifications or data forms');await shot('privacy');await call('openNotifications');await poll(()=>page.data(),d=>d.settingsSection==='notifications'&&!d.settingsBusy,'notification settings');check((await page.$$('switch')).length===2&&!(await page.$('textarea')),'notification settings have contact and summary controls');await shot('notifications');await call('openPersonalData');await poll(()=>page.data(),d=>d.settingsSection==='data'&&!d.settingsBusy,'personal data');check(!!await page.$('textarea')&&(await page.$$('switch')).length===0,'personal data isolates request form and records');await shot('data');
  page=await home();
  await mini.evaluate(()=>{const probe={original:wx.request,fail:true};getApp().globalData.meLayoutProbe=probe;wx.request=options=>{if(probe.fail&&options.url.endsWith('/api/v1/me/summary')){setTimeout(()=>options.fail?.({errMsg:'request:fail acceptance-only'}),0);return {abort(){}};}return probe.original.call(wx,options);};return true;});
  await call('refresh');await poll(()=>page.data(),d=>!!d.summaryError&&!d.summaryLoading,'summary failure');check(!!await page.$('.summary-error')&&await page.data('favCount')===1,'failed summary shows retry and keeps last successful counts');
  await mini.evaluate(()=>{getApp().globalData.meLayoutProbe.fail=false;return true;});await(await page.$('.summary-error .center-link')).tap();await poll(()=>page.data(),d=>!d.summaryError&&!d.summaryLoading,'retry recovery');check(true,'summary retry recovers against real local backend');
  await mini.evaluate(()=>{const p=getApp().globalData.meLayoutProbe;wx.request=p.original;delete getApp().globalData.meLayoutProbe;return true;});
  for(const theme of Object.keys(palettes)){
   const prefs=await req('/api/v1/me/preferences','GET',undefined,user),updated=await req('/api/v1/me/preferences','PUT',{...prefs,theme,largeText:theme==='clear'},user);await mini.callWxMethod('setStorageSync',prefKey,updated);
   page=await home();data=await page.data();const expected=resolvePalette(theme,'pages/me/index');
   check(data.themeStyle.includes('--brand:'+expected.brand)&&data.themeStyle.includes('--background:'+expected.background),'personal center retains '+theme+' frozen palette');
   const merchant=await page.$('.merchant-entry'),grid=await page.$('.workspace-grid');assert.equal(await grid.style('grid-template-columns')?.then(x=>x.split(' ').length),4,'four workspace columns');
   assert.equal(await merchant.style('background-color'),'rgb('+expected.surface.slice(1).match(/../g).map(x=>parseInt(x,16)).join(', ')+')','merchant uses existing solid surface');
   const points=await page.$('.points-entry'),arrow=await page.$('.points-entry>.center-chevron'),copy=await page.$('.points-entry .center-entry-copy');
   assert.equal(await points.style('background-color'),await merchant.style('background-color'),'points frame uses the unchanged merchant surface');
   assert.equal(await points.style('border-top-color'),await merchant.style('border-top-color'),'points frame uses the same existing border color');
   assert.ok(parseFloat(await points.style('border-top-width'))>0,'points entry has a real visible border');
   assert.equal(await points.style('border-top-left-radius'),await merchant.style('border-top-left-radius'),'points and merchant frames share corner radius');
   const arrowOffset=await arrow.offset(),copyOffset=await copy.offset(),copySize=await copy.size();
   assert.ok(Number(arrowOffset.left)>=Number(copyOffset.left)+Number(copySize.width)-1,'arrow stays to the right of copy, including large text');
   if(theme==='clear')check(data.themeClass.includes('large-text'),'larger text keeps all four workspace entries');await shot(theme);await call('openProfile');await poll(()=>page.data(),d=>d.mode==='profile'&&!d.summaryLoading,'profile '+theme);check((await page.$$('.profile-field')).length===3,'three profile rows render in '+theme);await shot(theme+'-profile');
  }
  for(const key of keys.slice(0,2))await mini.callWxMethod('removeStorageSync',key);page=await home();data=await page.data();check(!data.hasSession&&data.postCount===null&&!!await page.$('.guest-signin'),'guest center clears identity and shows login without fabricated counts');
  check(errors.length===0,'no captured application runtime exceptions');
  fs.writeFileSync('docs/profile-settings-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,physicalDevice:false,interaction:'actual rendered in-page controls; business navigation handlers invoked asynchronously through SDK to avoid stale element contexts; finger taps pending device acceptance',modalInput:'WeChat SDK confirmation for isolated test-account name editing',networkFault:'one summary request deliberately failed, then restored to real API',dataSource:'real local API/PostgreSQL and owner-scoped local history',checkedAt:new Date().toISOString()},null,2));
 }finally{
  try{
   await mini.evaluate(()=>{const p=getApp().globalData.meLayoutProbe;if(p){wx.request=p.original;delete getApp().globalData.meLayoutProbe}return true;});
   if(modalMocked)await mini.restoreWxMethod('showModal');if(prefKey)await mini.callWxMethod('removeStorageSync',prefKey);
   for(let i=0;i<original.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]||'');await route('/pages/messages/index');await poll(()=>mini.currentPage().then(p=>p.data()),d=>!d.loading,'restored badge');await home();
  }finally{await mini.disconnect();}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
