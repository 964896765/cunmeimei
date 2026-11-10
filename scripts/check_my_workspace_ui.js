'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms)),base=require('../miniprogram/utils/runtime').apiBaseUrl;
async function poll(read,accept,label){for(let i=0;i<70;i++){const value=await read();if(accept(value))return value;await pause(150);}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await require('./devtools_connection')(),keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode'],original=[],checks=[],errors=[];let user;
 const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
 const request=async(route,method='GET',body)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(user?{Authorization:'Bearer '+user.token}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,route+' '+r.status);return r.json();};
 const call=async(name,...args)=>{await mini.evaluate((name,args)=>{setTimeout(()=>getCurrentPages().slice(-1)[0][name](...args),0);return true;},name,args);await pause(200);};
 const current=route=>poll(()=>mini.currentPage(),p=>p.path===route,route);
 const returned=async()=>{const p=await current('pages/me/index');await poll(()=>p.data(),d=>d.mode==='main'&&!d.summaryLoading,'personal center');return p;};
 const back=async()=>{await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].selectComponent('#navigation-header').goBack();return true;});await returned();};
 const header=async(title)=>{const h=await mini.evaluate(()=>{const c=getCurrentPages().slice(-1)[0].selectComponent('#navigation-header');return new Promise(resolve=>c.createSelectorQuery().selectAll('.nav-back').boundingClientRect().select('.nav-title').boundingClientRect().exec(r=>resolve({title:c.properties.title,backs:r[0],rect:r[1]})));});check(h.title===title&&h.backs.length===1&&h.backs[0].left<h.rect.left,title+' retains one top-left return to personal center');await back();};
 mini.on('exception',e=>errors.push(e));
 try{
  for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));user=await request('/api/v1/dev/login','POST',{devUser:'three-workspaces-'+Date.now()});for(const [i,v]of [user.token,user.userId,true].entries())await mini.callWxMethod('setStorageSync',keys[i],v);
  const legacy={kind:'used',title:'保留的历史草稿',detail:'此历史草稿用于检查个人中心简化不会清除已有数据。',price:'',district:'',attributes:{},photos:[],clientKey:'preserved_legacy_'+Date.now()};await mini.callWxMethod('setStorageSync','city_life_draft_'+user.userId,legacy);
  await mini.evaluate(()=>{setTimeout(()=>wx.reLaunch({url:'/pages/me/index'}),100);return true;});await pause(2400);let page=await returned();
  const labels=await Promise.all((await page.$$('.workspace-label')).map(x=>x.text()));check(labels.join('|')==='我的发布|我的收藏|我的预约','personal center has only the three requested workspace entries');check((await page.$$('.drafts-entry')).length===0&&await page.data('draftCount')===undefined,'draft entry and draft count have been removed');await mini.screenshot({path:path.resolve('docs/publish-final-personal-center.png')});
  await call('goPosts');await current('pages/my-posts/index');await header('管理我的发布');await call('goBookings');await current('pages/my-bookings/index');await header('管理我的预约');await call('showFavorites');page=await current('pages/me/index');await poll(()=>page.data(),d=>d.mode==='saved'&&!d.loading,'favorites');await header('管理我的收藏');
  check((await mini.callWxMethod('getStorageSync','city_life_draft_'+user.userId)).title===legacy.title,'removing personal-center access does not delete legacy draft data');
  await mini.evaluate(()=>{setTimeout(()=>wx.switchTab({url:'/pages/publish/index'}),100);return true;});await pause(1500);page=await current('pages/publish/index');await call('openDrafts');page=await current('pages/drafts/index');await poll(()=>page.data(),d=>!d.loading&&d.items.length===1,'legacy in draft box');check((await page.data('items'))[0].clientKey===legacy.clientKey,'legacy draft remains accessible exclusively through publishing');
  check(errors.length===0,'no captured WeChat runtime exceptions');fs.writeFileSync('docs/my-workspace-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,physicalDevice:false,checkedAt:new Date().toISOString()},null,2));
 }finally{try{for(let i=0;i<original.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]||'');await mini.evaluate(()=>{getApp().globalData.openPersonalCenter=true;setTimeout(()=>wx.switchTab({url:'/pages/me/index'}),100);return true;});await pause(900);}finally{await mini.disconnect();}}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
