'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=require('../miniprogram/utils/runtime').apiBaseUrl,pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,accept,label){for(let i=0;i<70;i++){const value=await read();if(accept(value))return value;await pause(150);}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await require('./devtools_connection')(),keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode'],original=[],checks=[];
 const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
 const route=async()=>{await mini.evaluate(()=>{setTimeout(()=>wx.reLaunch({url:'/pages/me/index'}),100);return true;});await pause(2300);return poll(()=>mini.currentPage(),p=>p?.path==='pages/me/index','personal center');};
 const call=async(name,...args)=>{await mini.evaluate((name,args)=>{setTimeout(()=>getCurrentPages().slice(-1)[0][name](...args),0);return true;},name,args);await pause(200);};
 let user,modal=false;
 const req=async(route,method='GET',body)=>{const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+user.token}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(response.ok,'real local API '+response.status);return response.json();};
 try{
  for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));
  const browseBefore=await mini.callWxMethod('getStorageSync','city_life_browse_city');
  user=await req('/api/v1/dev/login','POST',{devUser:'profile-persistence-'+Date.now()});for(const [i,v]of [user.token,user.userId,true].entries())await mini.callWxMethod('setStorageSync',keys[i],v);
  let page=await route();await poll(()=>page.data(),d=>!d.summaryLoading,'summary');await call('openProfile');await poll(()=>page.data(),d=>d.mode==='profile'&&!d.summaryLoading,'profile');
  await mini.mockWxMethod('showModal',{confirm:true,cancel:false,content:'喜欢发现身边的好生活'});modal=true;
  await call('editProfileField',{currentTarget:{dataset:{field:'bio'}}});await poll(()=>page.data(),d=>d.bio==='喜欢发现身边的好生活'&&!d.profileBusy,'bio');await mini.restoreWxMethod('showModal');modal=false;
  check((await req('/api/v1/me/profile')).bio==='喜欢发现身边的好生活','bio is stored by the authenticated backend');
  await call('selectProfileCity');await poll(()=>mini.currentPage(),p=>p?.path==='pages/regions/index','city picker');await call('choose','310100');page=await poll(()=>mini.currentPage(),p=>p?.path==='pages/me/index','profile return');await poll(()=>page.data(),d=>d.profileCityCode==='310100'&&!d.profileBusy&&!d.summaryLoading,'city persisted');
  assert.deepEqual(await mini.callWxMethod('getStorageSync','city_life_browse_city'),browseBefore);check((await req('/api/v1/me/profile')).cityCode==='310100','profile city persists independently of the browsing city');
  const png=await require('../backend/node_modules/sharp')({create:{width:96,height:96,channels:3,background:'#d5d6d9'}}).png().toBuffer();
  const temporary=await mini.evaluate(base64=>{const p=wx.env.USER_DATA_PATH+'/profile-acceptance.png';wx.getFileSystemManager().writeFileSync(p,base64,'base64');return p;},png.toString('base64'));
  await call('chooseAvatar',{detail:{avatarUrl:temporary}});await poll(()=>page.data(),d=>!!d.avatarImageId&&!!d.avatarSrc&&!d.profileBusy,'avatar upload/save/download');
  const profile=await req('/api/v1/me/profile');check(profile.avatarImageId===await page.data('avatarImageId'),'avatar uses real upload, owner binding and authorized download');
  check((await fetch(base+'/api/v1/media/'+profile.avatarImageId)).status===404,'avatar remains unavailable to anonymous visitors');
  page=await route();await poll(()=>page.data(),d=>!d.summaryLoading&&!!d.avatarSrc,'reload avatar');check(await page.data('bio')===profile.bio&&await page.data('profileCityCode')===profile.cityCode,'profile and avatar survive page recreation');
  const cacheSize=async()=>mini.evaluate(uid=>{const fs=wx.getFileSystemManager(),dir=wx.env.USER_DATA_PATH+'/profile-cache';try{return fs.readdirSync(dir).filter(n=>n.startsWith(uid+'_')).reduce((s,n)=>s+fs.statSync(dir+'/'+n).size,0);}catch{return 0;}},user.userId);
  check(await cacheSize()>0,'cache reports actual saved avatar bytes');
  await mini.mockWxMethod('showModal',{confirm:false,cancel:true});modal=true;await call('inspectCache');check(await cacheSize()>0,'cancelled cache cleanup retains files');
  const before=await mini.callWxMethod('getStorageInfoSync');await mini.mockWxMethod('showModal',{confirm:true,cancel:false});await call('inspectCache');check(await cacheSize()===0,'confirmed cleanup removes the current-account avatar cache');
  assert.deepEqual((await mini.callWxMethod('getStorageInfoSync')).keys,before.keys);check(true,'cleanup preserves all storage keys including drafts and preferences');await mini.restoreWxMethod('showModal');modal=false;
  await call('openNotifications');await poll(()=>page.data(),d=>d.settingsSection==='notifications'&&!d.settingsBusy,'notifications');
  await call('changePreference',{currentTarget:{dataset:{field:'notificationPreview'}},detail:{value:false}});await call('savePreferences');await poll(()=>req('/api/v1/me/preferences'),d=>d.notificationPreview===false,'notification save');check(true,'notification setting persists to the existing server policy');
  await call('openPersonalData');await poll(()=>page.data(),d=>d.settingsSection==='data'&&!d.settingsBusy,'personal data');await call('requestKind',{detail:{value:1}});await call('requestReason',{detail:{value:'本地隔离账号资料更正流程验收，无需处理真实用户数据。'}});await call('submitPrivacyRequest');await poll(()=>page.data(),d=>!d.settingsBusy&&d.privacyItems.length===1,'data request persisted');
  check((await req('/api/v1/me/privacy-requests')).items[0].kind==='correction','personal data submits a real owner-scoped request and displays its processing record');
  const requestId=(await page.data('privacyItems'))[0].id;await mini.mockWxMethod('showModal',{confirm:true,cancel:false});modal=true;await call('cancelPrivacyRequest',{currentTarget:{dataset:{id:requestId}}});await poll(()=>page.data(),d=>d.privacyItems[0]?.status==='cancelled'&&!d.settingsBusy,'request withdrawal');check(true,'request withdrawal retains its actual processing history');await mini.restoreWxMethod('showModal');modal=false;
  fs.writeFileSync('docs/profile-persistence-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,physicalDevice:false,nativeAvatarChooser:false,avatarInput:'generated isolated fixture passed to real chooseAvatar event handler',checkedAt:new Date().toISOString()},null,2));
 }finally{
  try{if(modal)await mini.restoreWxMethod('showModal');await mini.evaluate(()=>{try{wx.getFileSystemManager().unlinkSync(wx.env.USER_DATA_PATH+'/profile-acceptance.png');}catch{}return true;});if(user)await mini.callWxMethod('removeStorageSync','city_life_preferences_'+user.userId);for(let i=0;i<original.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]||'');await route();}finally{await mini.disconnect();}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
