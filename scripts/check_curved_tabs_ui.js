'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),connect=require('./devtools_connection');
const {palettes,resolvePalette}=require('../miniprogram/utils/palettes');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,accept,label){for(let i=0;i<50;i++){const value=await read();if(accept(value))return value;await pause(150);}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await connect(),checks=[],errors=[],keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode','city_life_browse_city','city_life_v06_selected_area'],original=[];let prefKey,pref;
 const check=(v,label)=>{assert.ok(v,label);checks.push(label);console.log('PASS '+label);};
 const read=()=>mini.evaluate(()=>{const page=getCurrentPages().slice(-1)[0];return {route:page.route,bar:page.getTabBar?.()?.data,immersed:page.data.immersed};});
 const go=async route=>{await mini.evaluate(route=>{setTimeout(()=>wx.reLaunch({url:'/'+route}),120);return true;},route);await pause(2200);return poll(read,r=>r.route===route&&(!route.match(/^pages\/(home|discover|publish|messages|me)\//)||r.bar?.route===route),'route '+route);};
 const select=async route=>{await mini.evaluate(route=>{const page=getCurrentPages().slice(-1)[0];setTimeout(()=>page.getTabBar().select({currentTarget:{dataset:{route}}}),120);return true;},route);await pause(1500);return poll(read,r=>r.route===route&&r.bar?.route===route,'selected tab '+route);};
 mini.on('exception',e=>errors.push(e));
 try{
  for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));
  // Guest samples avoid racing the signed-in account's server preference sync.
  await mini.callWxMethod('removeStorageSync',keys[0]);await mini.callWxMethod('removeStorageSync',keys[1]);
  prefKey='city_life_preferences_guest';pref=await mini.callWxMethod('getStorageSync',prefKey);
  await mini.callWxMethod('setStorageSync',prefKey,{...(pref||{}),theme:'prism'});
  await mini.callWxMethod('setStorageSync',keys[2],true);await mini.callWxMethod('removeStorageSync',keys[3]);await mini.callWxMethod('setStorageSync',keys[4],'全部地区');
  await go('pages/home/index');
  for(const name of ['discover','publish','messages','me','home']){
   const route='pages/'+name+'/index',state=await select(route),colors=resolvePalette('prism',route);
   check(state.bar.items.map(x=>x.label).join('、')==='首页、发现、发布、消息、我的','five original labels retained on '+name);
   check(state.bar.surface===colors.surface&&state.bar.muted===colors.muted&&state.bar.selectedColor===colors.link,'original background/text/selection colors retained on '+name);
   await mini.screenshot({path:path.resolve('docs/tab-shape-after-'+name+'.png')});
  }
  for(const theme of Object.keys(palettes).filter(x=>x!=='prism')){
   await mini.callWxMethod('setStorageSync',prefKey,{...(pref||{}),theme});const state=await go('pages/home/index');
   check(state.bar.theme===theme&&state.bar.surface===palettes[theme].surface&&state.bar.selectedColor===palettes[theme].link,'curved bar retains '+theme+' theme colors');
   await mini.screenshot({path:path.resolve('docs/tab-shape-'+theme+'.png')});
  }
  await mini.callWxMethod('setStorageSync',prefKey,{...(pref||{}),theme:'prism'});await go('pages/discover/index');
  const page=await mini.currentPage();await poll(()=>page.data(),d=>!d.loading&&d.filtered.length>0,'test discovery feed');
  await mini.pageScrollTo(100);await pause(250);await mini.pageScrollTo(500);await pause(350);check((await read()).bar.hidden&&(await read()).immersed,'upward scrolling still hides the curved bar');
  await mini.pageScrollTo(100);await pause(350);check(!(await read()).bar.hidden&&!(await read()).immersed,'downward scrolling restores the curved bar');
  await mini.evaluate(()=>{const p=getCurrentPages().slice(-1)[0];p.getTabBar().setData({unread:7});return true;});
  await mini.callWxMethod('removeStorageSync',keys[0]);await mini.callWxMethod('removeStorageSync',keys[1]);await go('pages/messages/index');check((await read()).bar.unread===0,'guest refresh clears the previous identity badge');
  await go('pages/search/index');check(!(await read()).bar,'secondary search page has no duplicate bottom navigation');
  check(errors.length===0,'no captured runtime exceptions');
  fs.writeFileSync('docs/tab-shape-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,checkedAt:new Date().toISOString(),physicalDevice:false,interaction:'actual custom-bar select handlers and native scrolling; finger tapping and screen reader pending device acceptance'},null,2));
 }finally{
  try{if(prefKey){if(pref)await mini.callWxMethod('setStorageSync',prefKey,pref);else await mini.callWxMethod('removeStorageSync',prefKey);}for(let i=0;i<original.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]||'');await go('pages/messages/index');await poll(()=>mini.currentPage().then(p=>p.data()),d=>!d.loading,'restored message badge');await go('pages/home/index');}finally{await mini.disconnect();}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
