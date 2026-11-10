'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const connect=require('./devtools_connection'),{resolvePalette,palettes}=require('../miniprogram/utils/palettes');
const pause=ms=>new Promise(r=>setTimeout(r,ms)),base='http://127.0.0.1:3100';
async function req(route,method='GET',body,auth={}){
 const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function poll(read,accept,label){for(let i=0;i<60;i++){const value=await read();if(accept(value))return value;await pause(150);}throw Error('Timed out: '+label);}
(async()=>{
 assert.ok(process.env.ADMIN_PASSWORD,'local environment required; credentials are never logged');
 const mini=await connect(),checks=[],errors=[],original=[],keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode'];
 const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
 const route=async url=>{await mini.evaluate(url=>{setTimeout(()=>wx.reLaunch({url}),100);return true;},url);await pause(2200);return poll(()=>mini.currentPage(),p=>p?.path===url.slice(1),'route');};
 const refresh=async()=>{await mini.evaluate(()=>{setTimeout(()=>getCurrentPages().slice(-1)[0].refresh(),0);return true;});await pause(300);return poll(()=>mini.currentPage().then(p=>p.data()),d=>!d.loading,'refresh');};
 const call=async(name,dataset)=>{await mini.evaluate((name,dataset)=>{setTimeout(()=>getCurrentPages().slice(-1)[0][name]({currentTarget:{dataset}}),0);return true;},name,dataset);await pause(300);};
 const shot=async name=>{await mini.pageScrollTo(0);await pause(250);await mini.screenshot({path:path.resolve('docs/messages-layout-'+name+'.png')});};
 let owner,preferenceKey,modalMocked=false;
 mini.on('exception',e=>errors.push(e));
 try{
  for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));
  const stamp=Date.now();owner=(await req('/api/v1/dev/login','POST',{devUser:'messages-layout-owner-'+stamp})).data;
  const adminLogin=await req('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD});assert.equal(adminLogin.status,200);const admin={cookie:adminLogin.cookie,csrf:adminLogin.data.csrf};
  const areas=(await req('/api/v1/config')).data.areas,fixtures=[];
  for(const [i,title]of ['闲置书桌咨询','上门服务沟通','门店工作咨询'].entries()){
   const created=await req('/api/v1/publications','POST',{type:'used',title:'消息布局验收 · '+title,detail:'仅用于本地消息布局和真实数据库验收，不是真实商品或服务。',district:areas[0]},owner);assert.equal(created.status,201);
   const id=created.data.publication.id;assert.equal((await req('/admin/api/review','POST',{target:'publication',id,status:'published'},admin)).status,200);
   const reader=(await req('/api/v1/dev/login','POST',{devUser:'messages-layout-reader-'+stamp+'-'+i})).data;
   const contact=await req('/api/v1/items/'+id+'/contact','POST',{message:['你好，想进一步了解这条信息。','请问明天下午方便沟通吗？','请问需要准备哪些材料？'][i]},reader);assert.equal(contact.status,201);
   fixtures.push({publicationId:id,contactId:contact.data.request.id});
  }
  for(const [i,value]of [owner.token,owner.userId,true].entries())await mini.callWxMethod('setStorageSync',keys[i],value);
  preferenceKey='city_life_preferences_'+owner.userId;
  let page=await route('/pages/messages/index');let data=await poll(()=>page.data(),d=>!d.loading&&d.contacts.length===3,'three persisted contact requests');
  const labels=[];for(const tab of await page.$$('.message-tab'))labels.push(await tab.text());
  check(labels.length===2&&labels[0]==='聊天'&&labels[1].startsWith('通知'),'chat and notification tabs rendered');
  check(data.tab==='contacts'&&data.visibleContacts.length===3&&data.pendingContacts===3,'contact list uses real PostgreSQL requests');
  check(!!await page.$('.search-action')&&!await page.$('.notification-shortcuts'),'chat toolbar shows search and no notification shortcuts');
  await shot('chat');
  await(await page.$('.search-action')).tap();const search=await poll(()=>page.$('.contact-search input'),Boolean,'search input');await search.input('书桌');
  await poll(()=>page.data(),d=>d.query==='书桌'&&d.visibleContacts.length===1,'contact search');check((await page.data('visibleContacts'))[0].title.includes('书桌'),'search filters actual contact titles');
  await(await page.$('.search-action')).tap();await poll(()=>page.data(),d=>d.visibleContacts.length===3,'clear search');
  await(await page.$('.contact-row')).tap();await poll(()=>page.$('.contact-detail'),Boolean,'expand contact');check(!!await page.$('.block-contact'),'row expansion retains reply and block controls');
  const current=(await page.data('visibleContacts'))[0];
  await mini.mockWxMethod('showModal',{confirm:true,cancel:false,content:'仅本地验收：同意进一步沟通。'});
  modalMocked=true;
  let accept;for(const button of await page.$$('.contact-detail button'))if(await button.text()==='回复并同意')accept=button;assert.ok(accept);await accept.tap();
  await poll(()=>req('/api/v1/me/contacts','GET',undefined,owner),r=>r.data.items.find(x=>x.id===current.id)?.status==='accepted','accept persisted');
  await poll(()=>page.data(),d=>!d.loading&&d.pendingContacts===2,'accepted state refreshed');check((await page.data('contacts')).find(x=>x.id===current.id).response.includes('仅本地验收'),'real contact reply persists and refreshes the list');
  await mini.restoreWxMethod('showModal');modalMocked=false;
  await(await page.$$('.message-tab'))[1].tap();await poll(()=>page.$('.notification-shortcuts'),Boolean,'notifications');
  check((await page.$$('.notice-shortcut')).length===4&&!!await page.$('.read-all'),'notifications show four categories and mark-all action');
  check((await page.data('visibleNotices')).length>=6,'real moderation and contact notices render');await shot('notices');
  await(await page.$('.notice-shortcut[data-category="review"]')).tap();data=await poll(()=>page.data(),d=>d.noticeFilter==='review','review category selection');check(data.visibleNotices.length>0&&data.visibleNotices.every(x=>x.category==='review'),'review category filters real loaded notifications');
  await(await page.$('.notice-shortcut[data-category="booking"]')).tap();await poll(()=>page.data(),d=>d.noticeFilter==='booking'&&d.visibleNotices.length===0,'booking empty state');check(!!await poll(()=>page.$('.state-panel'),Boolean,'empty state rendered'),'empty category provides a real empty state');
  await call('filterNotices',{category:'all'});
  await(await page.$('.read-all')).tap();await poll(()=>req('/api/v1/me/notifications','GET',undefined,owner),r=>r.data.unread===0,'all read persisted');
  await poll(()=>page.data(),d=>d.unread===0&&!d.loading&&!d.reading,'read state');check(await mini.evaluate(()=>getCurrentPages().slice(-1)[0].getTabBar().data.unread)===0,'mark-all persists and clears the real bottom badge');
  const prefs=(await req('/api/v1/me/preferences','GET',undefined,owner)).data;
  assert.equal((await req('/api/v1/me/preferences','PUT',{...prefs,notificationPreview:false},owner)).status,200);data=await refresh();
  check(data.items.every(x=>x.title==='你有一条新的站内通知'&&x.body.includes('摘要已隐藏')),'new layout preserves server-side hidden notification summaries');
  let saved=(await req('/api/v1/me/preferences','GET',undefined,owner)).data;assert.equal((await req('/api/v1/me/preferences','PUT',{...saved,notificationPreview:true},owner)).status,200);
  for(const theme of Object.keys(palettes)){
   saved=(await req('/api/v1/me/preferences','GET',undefined,owner)).data;
   assert.equal((await req('/api/v1/me/preferences','PUT',{...saved,theme,largeText:theme==='clear'},owner)).status,200);
   await mini.callWxMethod('setStorageSync',preferenceKey,{...saved,theme,largeText:theme==='clear'});page=await route('/pages/messages/index');await poll(()=>page.data(),d=>!d.loading,'theme loaded');await call('tab',{tab:'notices'});data=await page.data();
   const expected=resolvePalette(theme,'pages/messages/index');check(data.themeStyle.includes('--brand:'+expected.brand)&&data.themeStyle.includes('--background:'+expected.background),'message page retains '+theme+' frozen colors');
   const readAll=await page.$('.read-all');assert.equal(await readAll.style('background-color'),'rgba(0, 0, 0, 0)','disabled mark-all retains transparent toolbar surface');
   assert.equal(await readAll.style('color'),'rgb('+expected.muted.slice(1).match(/../g).map(x=>parseInt(x,16)).join(', ')+')','disabled mark-all retains the existing secondary text color');
   if(theme==='clear')check(data.themeClass.includes('large-text'),'larger text layout renders with high contrast');
   await shot(theme);
  }
  await mini.callWxMethod('removeStorageSync',keys[0]);await mini.callWxMethod('removeStorageSync',keys[1]);page=await route('/pages/messages/index');data=await page.data();
  check(!data.hasSession&&data.contacts.length===0&&data.items.length===0&&!!await page.$('.state-panel .btn'),'guest state clears previous identity and retains login');
  check(errors.length===0,'no captured application runtime exceptions');
  fs.writeFileSync('docs/messages-layout-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,fixtures,physicalDevice:false,modalInput:'WeChat SDK showModal confirmed for local acceptance reply; physical keyboard and finger tapping pending',dataSource:'real local API/PostgreSQL; isolated labeled development accounts and publications',checkedAt:new Date().toISOString()},null,2));
 }finally{
  try{
   if(modalMocked)await mini.restoreWxMethod('showModal');if(preferenceKey)await mini.callWxMethod('removeStorageSync',preferenceKey);
   for(let i=0;i<original.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]||'');
   await route('/pages/messages/index');await poll(()=>mini.currentPage().then(p=>p.data()),d=>!d.loading,'restored original messages');await route('/pages/home/index');
  }finally{await mini.disconnect();}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
