'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),connect=require('./devtools_connection');
const base=require('../miniprogram/utils/runtime').apiBaseUrl,pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,accept,label){for(let n=0;n<65;n++){const value=await read();if(accept(value))return value;await pause(140);}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await connect(),checks=[],errors=[],backups=[],keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode','city_life_browse_city'];let shortcutKey,preferenceKey;
 const check=(v,label)=>{assert.ok(v,label);checks.push(label);console.log('PASS '+label);};
 const call=async(name,...args)=>{await mini.evaluate((name,args)=>{setTimeout(()=>getCurrentPages().slice(-1)[0][name](...args),0);return true;},name,args);await pause(120);};
 const current=route=>poll(()=>mini.currentPage(),p=>p.path===route,'route '+route);
 const route=async url=>{await mini.evaluate(url=>{setTimeout(()=>wx.reLaunch({url}),100);return true;},url);await pause(1600);return current(url.split('?')[0].slice(1));};
 const snap=async name=>{await pause(180);await mini.screenshot({path:path.resolve('docs/home-shortcuts-'+name+'.png')});};
 mini.on('exception',e=>errors.push(e));
 try{
  for(const key of keys)backups.push([key,await mini.callWxMethod('getStorageSync',key)]);
  const response=await fetch(base+'/api/v1/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({devUser:'home-shortcuts-ui-'+Date.now()})});assert.equal(response.status,200);const user=await response.json();
  shortcutKey='city_life_shortcuts_'+user.userId;preferenceKey='city_life_preferences_'+user.userId;
  await mini.callWxMethod('setStorageSync',keys[0],user.token);await mini.callWxMethod('setStorageSync',keys[1],user.userId);await mini.callWxMethod('setStorageSync',keys[2],false);await mini.callWxMethod('setStorageSync',keys[3],{cityCode:'310100',districtCode:'',source:'manual'});
  let page=await route('/pages/home/index');await poll(()=>page.data(),d=>!d.loading,'home');
  const initial=await page.data('quickItems');check(initial.length===8&&new Set(initial.map(x=>x.icon)).size===8&&initial[7].id==='more','homepage has seven distinct industries and More fixed in slot eight');
  const positions=await Promise.all((await page.$$('.quick-item')).map(x=>x.offset()));check(new Set(positions.map(x=>Math.round(x.top))).size===2&&new Set(positions.map(x=>Math.round(x.left))).size===4,'native homepage layout is exactly four columns and two rows');
  check(!await page.$('.section .more')&&!await page.$('.section button')&&(await(await page.$('.section')).text()).includes('暂无最新资讯'),'local news has a truthful empty state and no discovery-feed substitute or unimplemented More link');
  await snap('home');
  await(await page.$$('.quick-item')).at(-1).tap();page=await current('pages/categories/index');await pause(250);
  check((await page.data('options')).length===27&&(await page.$$('.shortcut-icon')).length===27,'editor renders all 27 choices once with dedicated icons');
  const rows=await page.data('options');check(new Set(rows.map(x=>x.id)).size===27&&rows.every(x=>typeof x.selected==='boolean'),'shortcut editor has only selected and unselected states');
  await call('toggle',{currentTarget:{dataset:{id:'C27'}}});await call('toggle',{currentTarget:{dataset:{id:'C26'}}});check((await page.data('selectedIds')).length===9,'editor accepts an eighth and ninth industry without a limit warning');
  await snap('editor');await(await page.$('.shortcut-save .btn')).tap();page=await current('pages/home/index');await poll(()=>page.data('quickPages'),x=>x.length===2,'two shortcut pages');
  let groups=await page.data('quickPages');check(groups[0].items.length===8&&groups[1].items[0].id==='C26'&&groups[1].items[7].id==='more','ninth category starts page two and More occupies slot sixteen');
  await(await page.$('.quick-pages')).swipeTo(1);await poll(()=>page.data('quickPage'),x=>x===1,'native swiper page two');check(await page.data('quickPage')===1,'native shortcut swiper changes pages horizontally');await snap('page-two');
  await call('openQuick',{currentTarget:{dataset:{id:'more'}}});page=await current('pages/categories/index');
  for(const option of await page.data('options'))if(!option.selected)await call('toggle',{currentTarget:{dataset:{id:option.id}}});check((await page.data('selectedIds')).length===27,'plus/minus can select all 27 industries');
  await(await page.$('.shortcut-save .btn')).tap();page=await current('pages/home/index');await poll(()=>page.data('quickPages'),x=>x.length===4,'four shortcut pages');groups=await page.data('quickPages');check(groups[3].items[7].id==='more'&&groups.flatMap(x=>x.items).filter(x=>x.id==='more').length===1,'all 27 industries use four pages with exactly one More in slot thirty-two');
  await(await page.$('.quick-pages')).swipeTo(3);await poll(()=>page.data('quickPage'),x=>x===3,'last shortcut page');await snap('last-page');
  await call('openQuick',{currentTarget:{dataset:{id:'C27'}}});page=await current('pages/discover/index');await poll(()=>page.data(),d=>!d.loading&&d.categoryId==='C27','selected industry feed');
  check(await page.data('categoryName')==='金融保险'&&await page.data('cityCode')==='310100','home shortcut opens discovery for the selected industry in the existing city');check((await page.data('filtered')).length===0,'unopened finance industry has no invented published content');await snap('discover-industry');
  const contracts=require('../miniprogram/utils/classification');
  for(const category of contracts.categories){await mini.evaluate(id=>{getApp().globalData.exploreTarget='all';getApp().globalData.exploreCategoryTarget={id};const p=getCurrentPages().slice(-1)[0];setTimeout(()=>p.initialize(),0);return true;},category.id);await poll(()=>page.data(),d=>!d.loading&&d.categoryId===category.id,category.name);assert.equal(await page.data('cityCode'),'310100');}
  check(true,'all 27 industry targets are accepted by the existing discovery feed in the same city');
  await mini.evaluate(()=>{getApp().globalData.exploreTarget='all';getApp().globalData.exploreCategoryTarget={id:''};setTimeout(()=>getCurrentPages().slice(-1)[0].initialize(),0);return true;});await poll(()=>page.data(),d=>!d.loading&&!d.categoryId,'recommended reset');check(await page.data('type')==='all','recommended discovery clears a previous industry selection');
  check(errors.length===0,'no captured mini-program runtime exceptions');fs.writeFileSync('docs/home-shortcuts-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,physicalDevice:false,checkedAt:new Date().toISOString(),source:'actual WeChat simulator, local API, existing PostgreSQL; no invented news or production fixtures'},null,2));
 }finally{
  try{if(shortcutKey)await mini.callWxMethod('removeStorageSync',shortcutKey);if(preferenceKey)await mini.callWxMethod('removeStorageSync',preferenceKey);for(const[key,value]of backups){if(value!==''&&value!==undefined&&value!==null)await mini.callWxMethod('setStorageSync',key,value);else await mini.callWxMethod('removeStorageSync',key);}await route('/pages/home/index');}finally{await mini.disconnect();}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
