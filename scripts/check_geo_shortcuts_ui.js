'use strict';
// Real simulator/API/PG acceptance. Synthetic location applies ONLY to an already
// labeled development fixture, is checked invisible normally, and is withdrawn.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),connect=require('./devtools_connection');
const pause=ms=>new Promise(r=>setTimeout(r,ms)),base=require('../miniprogram/utils/runtime').apiBaseUrl;
async function poll(read,accept,label){for(let n=0;n<60;n++){const value=await read();if(accept(value))return value;await pause(200);}throw Error('Timed out: '+label);}
async function req(route,method='GET',body,auth={},test=true){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(test?{'X-Development-Test-Data':'true'}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{
 const mini=await connect(),checks=[],errors=[],original=[];
 const keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode','city_life_browse_city','city_life_city_history','city_life_v06_selected_area'];
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label);};
 const route=async url=>{await mini.evaluate(url=>{setTimeout(()=>wx.reLaunch({url}),120);return true;},url);await pause(3000);return poll(()=>mini.currentPage(),p=>p.path===url.slice(1).split('?')[0],url);};
 const shot=async name=>{await pause(250);await mini.screenshot({path:path.resolve('docs/geo-ui-'+name+'.png')});};
 const viewportSnapshot=()=>mini.evaluate(()=>new Promise(resolve=>{const page=getCurrentPages().slice(-1)[0],timer=setTimeout(()=>resolve({pending:true,path:page.route}),1200);wx.createSelectorQuery().in(page).selectViewport().scrollOffset(view=>{clearTimeout(timer);resolve({path:page.route,type:page.data.type,first:page.data.filtered?.[0]?.id,scroll:view?.scrollTop});}).exec();}));
 mini.on('exception',error=>errors.push(error));let pointWritten=false,admin,point;
 try{
  for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));
  const user=(await req('/api/v1/dev/login','POST',{devUser:'geo-shortcuts-ui-'+Date.now()})).data;
  await mini.callWxMethod('setStorageSync',keys[0],user.token);await mini.callWxMethod('setStorageSync',keys[1],user.userId);await mini.callWxMethod('setStorageSync',keys[2],true);await mini.callWxMethod('removeStorageSync',keys[3]);await mini.callWxMethod('removeStorageSync',keys[5]);
  let page=await route('/pages/home/index');await poll(()=>page.data(),d=>!d.loading,'home');
  check(!await page.$('.top-row .link'),'homepage top right no longer exposes shortcut editing');await shot('home-default');
  const quick=await page.$$('.quick-item');await quick.at(-1).tap();await poll(()=>mini.currentPage(),p=>p.path==='pages/categories/index','More route');page=await mini.currentPage();
  check((await page.data('options')).length===27,'More is shortcut management with 27 real choices');
  for(const option of await page.$$('.shortcut-option')){const id=await option.attribute('data-id');if(!(await page.data('selectedIds')).includes(id))await option.tap();}
  await poll(()=>page.data('selectedIds'),ids=>ids.length===27,'all shortcut choices selected');check((await page.data('selectedIds')).length===27,'shortcut selection supports 27 items, beyond seven and the former fifteen limit');await shot('more-27');
  await(await page.$('.shortcut-save .btn')).tap();await poll(()=>mini.currentPage(),p=>p.path==='pages/home/index','save returns home');page=await mini.currentPage();await poll(()=>page.data('quickItems'),x=>x.length===28,'28 home items');
  check((await page.data('quickItems')).at(-1).id==='more','More stays last after all 27 shortcuts');
  const positions=await Promise.all((await page.$$('.quick-item')).map(x=>x.offset()));check(new Set(positions.map(p=>Math.round(p.top))).size===2,'actual layout remains exactly two rows');
  const scroll=await page.$('.quick-scroll'),width=await scroll.scrollWidth(),viewport=await scroll.size();check(width>viewport.width*2,'shortcut content extends horizontally instead of creating extra rows');
  await scroll.scrollTo(width,0);await pause(400);check(await scroll.property('scrollLeft')>0,'native shortcut container scrolls horizontally to later choices');await shot('home-27-scrolled');
  page=await route('/pages/home/index');await(await page.$('.location')).tap();await poll(()=>mini.currentPage(),p=>p.path==='pages/regions/index','city chooser');page=await mini.currentPage();
  check(!await page.$('.title')&&(await page.data('groups')).length>15,'city page starts with search and grouped cities, without a large title or region tabs');
  await(await page.$('input')).input('dongguan');await poll(()=>page.data('groups'),x=>x.length===1&&x[0].cities.length===1,'pinyin search');check((await page.data('groups'))[0].cities[0].code==='441900','pinyin search resolves Dongguan to a stable city code');
  await(await page.$('.district-entry')).tap();await poll(()=>page.data('districts'),x=>x.some(d=>d.code==='441900004'),'Dongguan direct towns');check((await page.data('districts')).some(d=>d.name==='南城街道'&&d.level==='town'),'Dongguan uses direct town/street children without an invented county');await shot('dongguan-towns');
  await(await page.$('.district-sheet .link')).tap();await(await page.$('.city-group .city-row')).tap();await poll(()=>mini.currentPage(),p=>p.path==='pages/home/index','selected city returns home');page=await mini.currentPage();await poll(()=>page.data('region'),x=>x==='东莞市','city label');
  const saved=await mini.callWxMethod('getStorageSync',keys[3]);check(saved.cityCode==='441900'&&saved.source==='manual','manual selection persists independently of GPS');
  check((await mini.callWxMethod('getStorageSync',keys[4]))[0]==='441900','selected cities enter bounded recent history');
  page=await route('/pages/search/index');await poll(()=>page.data(),d=>!d.loading,'city search');check(await page.data('cityCode')==='441900','global search inherits the browsing city');
  page=await route('/pages/publish/index');await(await page.$('.project-row')).tap();await poll(()=>page.data('showForm'),Boolean,'publication form');check(!(await page.data('attributes')).cityCode,'new publication city does not silently copy browsing/GPS city');
  const index=(await page.data('publishCities')).findIndex(x=>x.code==='441900');await(await page.$('.publish-city')).trigger('change',{value:index});await poll(()=>page.data('attributes'),a=>a.cityCode==='441900','explicit publication city');check((await page.data('attributes')).cityCode==='441900','publication city is explicitly confirmed through its picker handler');
  const login=await req('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD});assert.equal(login.status,200);admin={cookie:login.cookie,csrf:login.data.csrf};const fixture=JSON.parse(fs.readFileSync('docs/local-business-result.json','utf8'));
  check((await req('/api/v1/items/'+fixture.serviceId,'GET',undefined,{},false)).status===404,'map fixture is hidden in ordinary mode before any synthetic coordinates are assigned');
  assert.equal((await req('/api/v1/items/'+fixture.serviceId)).status,200);
  point={kind:'service',cityCode:'441900',districtCode:'',latitude:23.024,longitude:113.75,precision:'approximate',approved:true,verificationNote:'自动化开发验收虚拟点；非真实地址，仅关联既有测试服务'};
  assert.equal((await req('/admin/api/map-locations/'+fixture.serviceId,'PUT',point,admin)).status,200);pointWritten=true;
  page=await route('/pages/map/index');await poll(()=>page.data(),d=>!d.loading&&Math.abs(d.longitude-113.75)<.2,'offline display city center');check(!!await page.$('map')&&await page.data('cityCode')==='441900','native map inherits the selected city and keeps location layers separate');
  await page.setData({latitude:23.02,longitude:113.75,scale:15,dirty:true});await pause(700);await(await page.$('.search-region button')).tap();await poll(()=>page.data(),d=>!d.loading&&d.items.some(x=>x.id===fixture.serviceId),'actual map bounds and real PG point query');await poll(()=>page.data('markers'),rows=>rows.length>0,'native map marker update');check((await page.data('markers')).length>0,'real viewport API returns the explicitly labeled development point');
  const marker=(await page.data('markers'))[0];await(await page.$('map')).trigger('markertap',{markerId:marker.id});await poll(()=>page.data('selectedId'),Boolean,'marker selection');check(await page.data('selectedId')===fixture.serviceId,'marker event highlights its related information row');
  // SDK invokes real touch handlers; physical finger gestures remain unverified.
  const drag=async(from,to)=>{await mini.evaluate(([from,to])=>{const p=getCurrentPages().slice(-1)[0];p.dragStart({touches:[{clientY:from}]});p.dragEnd({changedTouches:[{clientY:to}]});return true;},[from,to]);await pause(250);};
  check(!await page.$('.drawer-states'),'drawer uses a handle instead of state buttons');await drag(600,350);await poll(()=>page.data('drawer'),x=>x==='expanded','expanded drawer');check(await page.data('drawer')==='expanded','upward drag expands the result drawer');await shot('map-expanded');
  await drag(350,600);await drag(350,600);await poll(()=>page.data('drawer'),x=>x==='collapsed','collapsed drawer');check(await page.data('drawer')==='collapsed','downward drag collapses the result drawer');await drag(600,350);await poll(()=>page.data('drawer'),x=>x==='half','half drawer');check(await page.data('drawer')==='half','upward drag restores half-screen state');
  const query='?cityCode=441900&west=113&east=114&south=22&north=24';check((await req('/api/v1/map'+query,'GET',undefined,{},false)).data.items.every(x=>x.id!==fixture.serviceId),'synthetic map point remains hidden from ordinary users');
  await shot('map-half');const row=await page.$('.map-result');await row.tap();check((await mini.currentPage()).path==='pages/map/index','first list click focuses the marker without opening detail');await(await page.$('.map-result .map-detail')).tap();await poll(()=>mini.currentPage(),p=>p.path==='pages/detail/index','explicit map detail');check((await mini.currentPage()).path==='pages/detail/index','explicit detail action opens the related information');
  await mini.callWxMethod('removeStorageSync',keys[3]);
  page=await route('/pages/discover/index');await poll(()=>page.data(),d=>!d.loading&&d.filtered.length,'existing discovery feed');await mini.pageScrollTo(300);await pause(250);await mini.pageScrollTo(100);await pause(300);const before=await poll(viewportSnapshot,x=>!x.pending&&x.scroll>0,'native discovery viewport before map');
  const floats=await page.$$('.float-action');await floats[1].tap();await poll(()=>mini.currentPage(),p=>p.path==='pages/map/index','map entry');check((await mini.currentPage()).path==='pages/map/index','discovery globe opens a distinct native-map subpage');
  await mini.evaluate(()=>{setTimeout(()=>wx.navigateBack(),120);return true;});await pause(1600);const after=await poll(viewportSnapshot,x=>!x.pending&&x.path==='pages/discover/index','native discovery viewport after map');console.log('NATIVE_VIEWPORT '+JSON.stringify({before,after}));check(after.path==='pages/discover/index'&&after.type===before.type&&after.first===before.first&&Math.abs(after.scroll-before.scroll)<5,'map back restores the discovery channel, existing feed and scroll position');
  check(errors.length===0,'no captured application runtime exceptions');
  fs.writeFileSync('docs/geo-shortcuts-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,checkedAt:new Date().toISOString(),physicalDevice:false,geocoder:'not configured; no real reverse-geocoding sign-off',mapPoint:'synthetic coordinates on development-only service; normal visibility denied; withdrawn in finally',nativeInteractions:'SDK taps, scroll container, picker/marker event handlers; physical GPS/touch drawer gestures pending device acceptance'},null,2));
 }finally{
  try{if(pointWritten){const fixture=JSON.parse(fs.readFileSync('docs/local-business-result.json','utf8'));assert.equal((await req('/admin/api/map-locations/'+fixture.serviceId,'PUT',{...point,approved:false},admin)).status,200);}for(let n=0;n<original.length;n++)await mini.callWxMethod('setStorageSync',keys[n],original[n]||'');await route('/pages/home/index');}finally{await mini.disconnect();}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
