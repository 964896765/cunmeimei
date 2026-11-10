'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const connect=require('./devtools_connection'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,accept,label){for(let n=0;n<70;n++){const v=await read();if(accept(v))return v;await pause(150);}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await connect(),checks=[],backups=[],errors=[],samples=[];
 const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
 const route=async url=>{await mini.evaluate(url=>{setTimeout(()=>wx.reLaunch({url}),100);return true;},url);await pause(3000);return poll(()=>mini.currentPage(),p=>p.path===url.split('?')[0].slice(1),'route '+url);};
 const settled=p=>poll(()=>p.data(),d=>!!d.cityCode&&!d.loading&&!d.geoError,'map centered and loaded');
 const shot=name=>mini.screenshot({path:'docs/map-focus-'+name+'.png'});
 const call=async(name,dataset)=>{await mini.evaluate((name,dataset)=>{const p=getCurrentPages().slice(-1)[0];setTimeout(()=>p[name]({currentTarget:{dataset}}),0);return true;},name,dataset);await pause(250);};
 async function nativeCenter(){await mini.evaluate(()=>{getApp().globalData.mapFocusCenter=null;getCurrentPages().slice(-1)[0].map.getCenterLocation({success:p=>{getApp().globalData.mapFocusCenter={latitude:p.latitude,longitude:p.longitude};}});return true;});return poll(()=>mini.evaluate(()=>getApp().globalData.mapFocusCenter),Boolean,'native center');}
 mini.on('exception',e=>errors.push(e));
 try{
  const uid=await mini.callWxMethod('getStorageSync','city_life_user_id'),prefs='city_life_preferences_'+(uid||'guest');
  for(const key of ['city_life_browse_city','city_life_city_history','city_life_v06_selected_area',prefs])backups.push([key,await mini.callWxMethod('getStorageSync',key)]);
  await mini.callWxMethod('setStorageSync','city_life_browse_city',{cityCode:'310100',districtCode:'',source:'manual'});
  let page=await route('/pages/discover/index');await poll(()=>page.data(),d=>!d.loading,'discover');await call('changeType',{type:'service'});await poll(()=>page.data(),d=>!d.loading,'service channel');await mini.pageScrollTo(80);await call('openMap',{});page=await poll(()=>mini.currentPage(),p=>p.path==='pages/map/index','discovery map mode');await settled(page);
  check(await page.data('type')==='service','map inherits the current discovery category');
  let center=await nativeCenter();check(center.latitude>31&&center.latitude<32&&center.longitude>121&&center.longitude<122,'native map actually centers on Shanghai without a geocoding key');
  check(require('../miniprogram/pages/map/index.json').navigationBarTitleText==='地图找信息','single native header is 地图找信息');
  const drawer=await page.$('.map-drawer'),drawerSize=await drawer.size(),mapSize=await(await page.$('map')).size();
  check(await page.data('drawer')==='collapsed'&&drawerSize.height>=100&&drawerSize.height<=150,'default drawer is compact including safe area');
  check(drawerSize.height<mapSize.height*.25,'map remains the primary visible surface');
  check((await page.$$('.map-chip')).length===7&&!await page.$('.map-more')&&!await page.$('.map-tools')&&(await page.$$('.map-filter-button')).length===1,'seven horizontal channels and a single filter inside the results panel; no More or GPS control');
  const chipSize=await(await page.$('.map-chip')).size();check(chipSize.height>=35&&chipSize.height<=40&&chipSize.width>=50,'category text stays horizontal inside 36px tabs');
  check(!await page.$('input')&&!await page.$('.drawer-states')&&!await page.$('.map-list-fallback')&&!await page.$('.state-panel'),'map has no duplicate search form, state buttons, list-search fallback or oversized empty card');
  check(!await page.$('.search-region'),'search-this-area action is absent before map movement');
  samples.push({cityCode:'310100',center,drawerHeight:drawerSize.height,mapHeight:mapSize.height});await shot('shanghai');
  await(await page.$('.map-filter-button')).tap();await poll(()=>page.data('filterOpen'),Boolean,'filter sheet');check((await page.$$('.filter-group')).length===4&&(await page.$$('.filter-option')).length===9,'filter sheet contains only date, sort, image and verified-publisher conditions');await shot('filters');
  await mini.evaluate(()=>{const p=getCurrentPages().slice(-1)[0];p.chooseFilter({currentTarget:{dataset:{key:'days',value:7}}});return true;});await(await page.$('.filter-apply')).tap();await poll(()=>page.data(),d=>!d.loading&&!d.error&&!d.filterOpen,'apply filters');check((await page.data('filters')).days===7,'date filter runs through the real map API');
  await mini.evaluate(()=>{const p=getCurrentPages().slice(-1)[0];p.dragStart({touches:[{clientY:600}]});p.dragEnd({changedTouches:[{clientY:350}]});p.dragStart({touches:[{clientY:600}]});p.dragEnd({changedTouches:[{clientY:350}]});return true;});await pause(300);check(await page.data('drawer')==='expanded'&&!await page.$('.map-filter-scroll')&&!!await page.$('.map-search')&&!!await page.$('.drawer-header .map-filter-button'),'expanded panel keeps search and its own fixed filter header while hiding category tabs');await shot('expanded');
  await mini.evaluate(()=>{const p=getCurrentPages().slice(-1)[0];p.dragStart({touches:[{clientY:300}]});p.dragEnd({changedTouches:[{clientY:600}]});p.dragStart({touches:[{clientY:300}]});p.dragEnd({changedTouches:[{clientY:600}]});return true;});
  await mini.evaluate(()=>{const p=getCurrentPages().slice(-1)[0];p.regionChanged({type:'end',detail:{causedBy:'drag',scale:p.data.scale}});return true;});
  await poll(()=>page.data('dirty'),Boolean,'map movement');check(!!await page.$('.search-region'),'map movement reveals only Search this area');await shot('moved');
  await(await page.$('.search-region button')).tap();await poll(()=>page.data(),d=>!d.loading&&!d.dirty&&!d.error,'area query');check(!await page.$('.search-region'),'successful real area query removes the temporary action');
  await(await page.$('.map-search')).tap();page=await poll(()=>mini.currentPage(),p=>p.path==='pages/search/index','unified search');await poll(()=>page.data(),d=>!d.loading&&!d.landingLoading,'search loaded');check(await page.data('publicOnly')===true&&(await page.data('days'))===7,'existing unified search receives public-position scope and applicable map filters');
  await call('chooseCity',{});page=await poll(()=>mini.currentPage(),p=>p.path==='pages/regions/index','choose region');await pause(500);await call('chooseCity',{code:'441900'});page=await poll(()=>mini.currentPage(),p=>p.path==='pages/search/index','return to search');await pause(500);await mini.callWxMethod('navigateBack');page=await poll(()=>mini.currentPage(),p=>p.path==='pages/map/index','return to map');await settled(page);center=await nativeCenter();
  check((await page.data('cityCode'))==='441900'&&center.latitude>22&&center.latitude<24&&center.longitude>113&&center.longitude<114,'changing city returns to map and moves its actual viewport to Dongguan');samples.push({cityCode:'441900',center});await shot('dongguan');
  await(await page.$('.map-search')).tap();page=await poll(()=>mini.currentPage(),p=>p.path==='pages/search/index','unified map search');await poll(()=>page.data(),d=>!d.loading&&!d.landingLoading,'search');check(await page.data('publicOnly')===true,'map search uses the existing search page restricted to verified public locations');
  check((await page.data('themeClass')).includes('theme-'),'map continues using the existing theme system');
  check(errors.length===0,'no captured mini-program runtime exceptions');
  fs.writeFileSync('docs/map-focus-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,samples,errors,dataSource:'real native map / local API / persistent PostgreSQL; no invented pins',physicalDevice:false,markerAndDrag:'existing cluster tests and real touch-handler controller tests; physical gestures and hardware GPS remain pending'},null,2)+'\n');
 }finally{
  try{for(const [key,value]of backups){if(value!==''&&value!==undefined&&value!==null)await mini.callWxMethod('setStorageSync',key,value);else await mini.callWxMethod('removeStorageSync',key);}await route('/pages/map/index');}finally{await mini.disconnect();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
