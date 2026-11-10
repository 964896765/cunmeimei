'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const connect=require('./devtools_connection'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,accept,label){for(let n=0;n<60;n++){const v=await read();if(accept(v))return v;await pause(100);}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await connect(),checks=[],backups=[],errors=[];
 const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
 const route=async url=>{await mini.evaluate(url=>{setTimeout(()=>wx.reLaunch({url}),100);return true;},url);await pause(3000);return poll(()=>mini.currentPage(),p=>p.path===url.split('?')[0].slice(1),'route '+url);};
 const call=async(name,dataset)=>{await mini.evaluate((name,dataset)=>{const p=getCurrentPages().slice(-1)[0];setTimeout(()=>p[name]({currentTarget:{dataset}}),0);return true;},name,dataset);await pause(250);};
 const shot=name=>mini.screenshot({path:'docs/search-filters-'+name+'.png'});
 const settled=p=>poll(()=>p.data(),d=>!d.loading&&!d.landingLoading,'search settled');
 let gpsMocked=false,probe=false;
 mini.on('exception',e=>errors.push(e));
 try{
  const uid=await mini.callWxMethod('getStorageSync','city_life_user_id'),prefs='city_life_preferences_'+(uid||'guest');
  for(const key of ['city_life_browse_city','city_life_city_history','city_life_v06_selected_area',prefs])backups.push([key,await mini.callWxMethod('getStorageSync',key)]);
  await mini.callWxMethod('setStorageSync','city_life_browse_city',{cityCode:'310100',districtCode:'',source:'manual'});
  let page=await route('/pages/search/index?q='+encodeURIComponent('保洁')+'&type=service');await settled(page);
  check((await(await page.$('.city-filter')).text()).includes('上海市')&&!await page.$('.location-mark'),'result filters label the browsing city without a location icon');
  const types=await page.data('types');check(types.length===8&&new Set(types.slice(1).map(x=>x.id)).size===7,'All categories menu contains exactly the seven business templates plus All');
  check(JSON.stringify(types.slice(1).map(x=>x.id))===JSON.stringify(require('../miniprogram/utils/classification').channels.slice(1).map(x=>x.id)),'search and discovery use the same template definitions');await shot('main');
  await(await page.$('.city-filter')).tap();page=await poll(()=>mini.currentPage(),p=>p.path==='pages/regions/index','open region chooser');check(page.path==='pages/regions/index','region label opens the existing city and district chooser');await pause(600);
  await call('chooseCity',{code:'310100'});page=await poll(()=>mini.currentPage(),p=>p.path==='pages/search/index','return to search');check(page.path==='pages/search/index','city selection returns to search rather than the homepage');await settled(page);await pause(600);
  await mini.evaluate(()=>{const probe={original:wx.request,urls:[]};getApp().globalData.searchFilterProbe=probe;wx.request=options=>{if(options.url.includes('/api/v1/feed?'))probe.urls.push(options.url);return probe.original.call(wx,options);};return true;});probe=true;
  await(await page.$('.advanced-button')).tap();await poll(()=>page.data('advancedOpen'),Boolean,'filter panel');
  check((await page.data('dateOptions')).some(x=>x.value===7)&&(await page.data('radiusOptions')).some(x=>x.value===50),'advanced filters include seven days and 50km');
  await(await page.$('.filter-options button[data-value="7"]')).tap();
  const scroll=await page.$('.advanced-scroll');await scroll.scrollTo(0,await scroll.scrollHeight());await pause(300);
  const radius=await page.$('.filter-options button[data-value="50"]');await radius.tap();
  await poll(()=>page.data(),d=>d.draftDays===7&&d.draftRadius===50,'draft filters');
  check((await page.data('days'))===0&&(await mini.evaluate(()=>getApp().globalData.searchFilterProbe.urls)).length===0,'draft choices do not trigger a search until Apply');await shot('panel-distance');await scroll.scrollTo(0,0);await pause(250);await shot('panel');
  await mini.mockWxMethod('getLocation',{latitude:31.23,longitude:121.47,accuracy:10});gpsMocked=true;
  await call('applyAdvanced');await settled(page);
  check((await page.data('days'))===7&&(await page.data('radiusKm'))===50&&!(await page.data('advancedOpen')),'Apply commits the selected time and radius');
  const urls=await mini.evaluate(()=>getApp().globalData.searchFilterProbe.urls),query=new URL(urls.at(-1)).searchParams;
  check(query.get('days')==='7'&&query.get('radiusKm')==='50'&&query.get('cityCode')==='310100'&&query.has('latitude'),'actual local API receives combined city, date and radius parameters');
  check((await page.data('filterSummary')).includes('50km')&&!(await page.data('error')),'same-page results show active filter context without an API error');await shot('applied');
  check((await mini.callWxMethod('getStorageSync','city_life_browse_city')).cityCode==='310100','distance origin never overwrites browsing city');
  await call('toggleAdvanced');await call('chooseDate',{value:30});await call('closeAdvanced');check((await page.data('days'))===7,'Cancel preserves the applied filter');
  const goods=types.findIndex(x=>x.id==='used');await(await page.$('.query-filters picker')).trigger('change',{value:goods});await poll(()=>page.data(),d=>d.type==='used'&&!d.loading,'goods category applied');
  check((await page.data('radiusKm'))===0&&(await page.data('days'))===7,'switching to goods clears unsupported precise-distance filters but retains time');
  await call('toggleAdvanced');check(!await page.$('.filter-options button[data-value="50"]'),'irrelevant distance controls are hidden for a private-location category');await shot('private-category');await call('closeAdvanced');
  const priorPrefs=backups.find(x=>x[0]===prefs)[1]||{};
  for(const theme of ['prism','dark','clear','quiet','warm','gentle']){
   await mini.callWxMethod('setStorageSync',prefs,{...priorPrefs,theme,largeText:theme==='clear'});page=await route('/pages/search/index?q='+encodeURIComponent('保洁')+'&type=service');await settled(page);await call('toggleAdvanced');await call('chooseDate',{value:7});await call('chooseRadius',{value:50});
   check(!!await page.$('.advanced-sheet')&&(await page.data('themeClass')).includes('theme-'+theme),'advanced filter panel renders '+theme+(theme==='clear'?' with large text':''));await shot(theme);await call('closeAdvanced');
  }
  check(errors.length===0,'no captured mini-program runtime exceptions');
  fs.writeFileSync('docs/search-filters-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,dataSource:'real local API and persistent PostgreSQL',locationInput:'SDK mocked Shanghai coordinates; physical GPS and permission flow pending device verification',query:{days:query.get('days'),radiusKm:query.get('radiusKm'),cityCode:query.get('cityCode')},errors},null,2)+'\n');
 }finally{
  try{
   if(probe)await mini.evaluate(()=>{const p=getApp().globalData.searchFilterProbe;if(p){wx.request=p.original;delete getApp().globalData.searchFilterProbe;}return true;});
   if(gpsMocked)await mini.restoreWxMethod('getLocation');
   for(const [key,value]of backups){if(value!==''&&value!==undefined&&value!==null)await mini.callWxMethod('setStorageSync',key,value);else await mini.callWxMethod('removeStorageSync',key);}
   await route('/pages/search/index');
  }finally{await mini.disconnect();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
