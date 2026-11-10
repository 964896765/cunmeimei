'use strict';
const connect=require('./devtools_connection');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const mini=await connect(),keys=['city_life_v2_auth_token','city_life_user_id'],original=[];
 for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));
 try{
  console.log('Checking guest display and message badge');
  const custom=!!JSON.parse(fs.readFileSync(path.resolve(__dirname,'../miniprogram/app.json'),'utf8')).tabBar.custom;
  if(custom)await mini.evaluate(()=>{const bar=getCurrentPages().slice(-1)[0].getTabBar?.();if(bar)bar.setData({unread:7});return true;});
  else await mini.evaluate(()=>{const probe={original:wx.removeTabBarBadge,removed:false};getApp().globalData.badgeProbe=probe;wx.removeTabBarBadge=options=>{if(options.index===3)probe.removed=true;return probe.original.call(wx,options)};return true});
  for(const key of keys)await mini.callWxMethod('removeStorageSync',key);
  await mini.evaluate(()=>{setTimeout(()=>wx.reLaunch({url:'/pages/me/index'}),150);return true});await pause(3500);
  const page=await mini.currentPage();assert.equal(page.path,'pages/me/index');assert.equal(await page.data('hasSession'),false);
  if(custom)assert.equal(await mini.evaluate(()=>getCurrentPages().slice(-1)[0].getTabBar().data.unread),0,'guest refresh clears previous identity badge');
  else assert.equal(await mini.evaluate(()=>getApp().globalData.badgeProbe.removed),true,'guest refresh clears previous identity badge');
  await mini.pageScrollTo(0);await mini.screenshot({path:path.resolve(__dirname,'../docs/prism4-after-guest-me.png')});
  fs.writeFileSync(path.resolve(__dirname,'../docs/prism-guest-badge-result.json'),JSON.stringify({passed:1,failed:0,physicalDevice:false,checkedAt:new Date().toISOString()},null,2));
  console.log('PASS guest display clears message badge');
 }finally{
  try{
   await mini.evaluate(()=>{const probe=getApp().globalData.badgeProbe;if(probe){wx.removeTabBarBadge=probe.original;delete getApp().globalData.badgeProbe}return true});
   for(let n=0;n<keys.length;n++)await mini.callWxMethod('setStorageSync',keys[n],original[n]||'');
   await mini.evaluate(()=>{setTimeout(()=>wx.switchTab({url:'/pages/messages/index'}),150);return true});await pause(3500);
   await mini.evaluate(()=>{setTimeout(()=>wx.switchTab({url:'/pages/home/index'}),150);return true});await pause(3500);await mini.pageScrollTo(0);
   await mini.screenshot({path:path.resolve(__dirname,'../docs/prism4-after-home.png')});
  }finally{await mini.disconnect()}
 }
})().catch(error=>{console.error(error.stack);process.exitCode=1});
