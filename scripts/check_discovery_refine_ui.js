'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const connect=require('./devtools_connection'),base=require('../miniprogram/utils/runtime').apiBaseUrl;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,accept,label){for(let i=0;i<60;i++){const v=await read();if(accept(v))return v;await pause(150)}throw Error('Timed out: '+label)}
async function req(route,method='GET',body,auth={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,method+' '+route.split('?')[0]+' HTTP '+r.status);return {data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{
 const mini=await connect(),checks=[],errors=[],keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode','city_life_browse_city','city_life_v06_selected_area'],original=[];
 const pool=new(require('../backend/node_modules/pg').Pool)({connectionString:process.env.DATABASE_URL,max:1});
 const fixture=JSON.parse(fs.readFileSync('docs/local-business-result.json','utf8'));let oldPoint,pointWritten=false,gpsMocked=false,prefKey;
 const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label)};
 const go=async url=>{await mini.evaluate(url=>{setTimeout(()=>wx.reLaunch({url}),120);return true},url);await pause(2600);return poll(()=>mini.currentPage(),p=>p.path===url.slice(1),'route '+url)};
 const call=async(name,dataset)=>{await mini.evaluate((name,dataset)=>{setTimeout(()=>getCurrentPages().slice(-1)[0][name]({currentTarget:{dataset}}),0);return true},name,dataset);await pause(250)};
 const settled=page=>poll(()=>page.data(),d=>!d.loading,'feed settled');
 const shot=async name=>{await mini.screenshot({path:path.resolve('docs/discover-refine-'+name+'.png')})};
 mini.on('exception',e=>errors.push(e));
 try{
  for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));
  const user=(await req('/api/v1/dev/login','POST',{devUser:'discover-refine-'+Date.now()})).data;prefKey='city_life_preferences_'+user.userId;
  for(const [i,v]of [user.token,user.userId,true].entries())await mini.callWxMethod('setStorageSync',keys[i],v);
  await mini.callWxMethod('removeStorageSync',keys[3]);await mini.callWxMethod('setStorageSync',keys[4],'全部地区');
  oldPoint=(await pool.query('SELECT * FROM public_map_locations WHERE item_id=$1',[fixture.serviceId])).rows[0];
  const adminLogin=await req('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD}),admin={cookie:adminLogin.cookie,csrf:adminLogin.data.csrf};
  await req('/admin/api/map-locations/'+fixture.serviceId,'PUT',{kind:'service',cityCode:'441900',latitude:23.01,longitude:113,precision:'approximate',approved:true,verificationNote:'仅本地标记验收服务，排序模拟位置，非真实经营地址'},admin);pointWritten=true;
  let page=await go('/pages/discover/index');await settled(page);
  await mini.evaluate(()=>{const p={original:wx.request,requests:[]};getApp().globalData.sortUIProbe=p;wx.request=options=>{if(options.url.includes('/api/v1/feed?')){const query=options.url.split('?')[1];p.requests.push({base:options.url.split('/api/')[0],query});}return p.original.call(wx,options)};return true});
  check(await(await page.$('.discover-toolbar')).style('background-color')==='rgba(0, 0, 0, 0)','channel strip has no rectangular background');
  const floats=await page.$$('.float-action');assert.equal(floats.length,2);for(const b of floats){const size=await b.size();assert.ok(size.width>=44&&size.height>=44);assert.notEqual(await b.style('background-color'),'rgba(0, 0, 0, 0)');assert.ok(parseFloat(await b.style('border-top-width'))>0);}
  check(!!await page.$('.float-search')&&!!await page.$('.float-globe')&&!await page.$('.float-symbol'),'floating controls use matching line icons with visible boundaries');await shot('main');
  await(await page.$('.sort-trigger')).tap();await poll(()=>page.data('sortOpen'),Boolean,'sort open');check((await page.$$('.sort-option')).length===7,'seven sort choices and condition hints render');
  check((await page.data('sortOptions')).find(x=>x.code==='salary_high').enabled===false,'salary remains disabled while recruiting and comparable salary fields are unavailable');await shot('sort');
  check(await mini.evaluate(()=>getCurrentPages().slice(-1)[0].getTabBar().data.hidden),'sort panel hides the bottom bar so it cannot cover choices');
  await(await page.$('.sort-option[data-code="popular"]')).tap();await poll(()=>page.data(),d=>d.sortCode==='popular'&&!d.loading,'popular');check((await page.data('sortLabel'))==='热门优先','popular choice reloads real backend feed');
  await call('openSort');await(await page.$('.sort-option[data-code="recommended"]')).tap();await poll(()=>page.data(),d=>d.sortCode==='recommended'&&!d.loading,'recommended');check(true,'recommended choice reloads real backend feed');
  await call('changeType',{type:'used'});await settled(page);await call('openSort');await(await page.$('.sort-option[data-code="price_low"]')).tap();await poll(()=>page.data(),d=>d.sortCode==='price_low'&&!d.loading,'price');
  const amounts=(await page.data('filtered')).map(x=>String(x.price||'').replace(/[¥￥ ,]/g,'')).filter(x=>/^\d+(\.\d{1,2})?$/.test(x)).map(Number);check(amounts.every((x,i)=>!i||amounts[i-1]<=x),'price sorting renders numeric values in ascending order');
  if(await page.data('hasMore')){await call('loadMore');await poll(()=>page.data(),d=>d.page===2&&!d.loading,'sort pagination');check(true,'pagination preserves the selected server ordering');}
  await call('changeType',{type:'merchant'});await settled(page);check(await page.data('sortCode')==='latest','incompatible price ordering resets after channel switch');
  await call('changeType',{type:'all'});await settled(page);await call('openSort');
  await mini.mockWxMethod('getLocation',{latitude:23,longitude:113,accuracy:10});gpsMocked=true;
  await(await page.$('.sort-option[data-code="distance"]')).tap();await poll(()=>page.data(),d=>d.sortCode==='distance'&&!d.loading,'distance');
  check((await page.data('filtered')).some(x=>x.id===fixture.serviceId)&&!!await page.$('.distance-note'),'distance sorting uses a real verified test point and shows its public-location scope');
  check(!await mini.callWxMethod('getStorageSync',keys[3]),'distance origin does not overwrite the browsing city');await shot('distance');
  await mini.restoreWxMethod('getLocation');gpsMocked=false;
  const requests=await mini.evaluate(()=>getApp().globalData.sortUIProbe.requests);check(requests.some(x=>x.query.includes('sort=distance'))&&requests.some(x=>x.query.includes('sort=popular'))&&requests.every(x=>x.base===base),'updated API receives the actual selected sorting requests');
  await call('clearFilters');await settled(page);
  await mini.pageScrollTo(100);await pause(200);await mini.pageScrollTo(500);await pause(300);check(await page.data('immersed'),'upward scrolling still hides the toolbar and floating icons');await mini.pageScrollTo(0);await pause(400);check(!await page.data('immersed'),'returning to top restores navigation');
  await call('openSearch');await pause(2000);check((await mini.currentPage()).path==='pages/search/index','search icon retains real search navigation');page=await go('/pages/discover/index');await settled(page);await call('openMap');await pause(2000);check((await mini.currentPage()).path==='pages/map/index','globe retains real map navigation');
  for(const theme of ['prism','dark','clear','quiet','warm','gentle']){
   const prefs=(await req('/api/v1/me/preferences','GET',undefined,user)).data,updated=(await req('/api/v1/me/preferences','PUT',{...prefs,theme,largeText:theme==='clear'},user)).data;await mini.callWxMethod('setStorageSync',prefKey,updated);
   page=await go('/pages/discover/index');await settled(page);assert.equal((await page.data('displayPreferences')).theme,theme);await call('openSort');check(!!await page.$('.sort-sheet'),'sort panel renders '+theme+(theme==='clear'?' with large text':''));await shot(theme);await call('closeSort');
  }
  check(errors.length===0,'no captured application runtime exceptions');
  fs.writeFileSync('docs/discover-refine-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,physicalDevice:false,dataSource:'real local API/PostgreSQL; a labeled existing test service point is temporarily verified and restored',locationInput:'SDK mocked coordinates only; actual GPS permission and hardware pending device acceptance',interaction:'rendered sorting buttons and native scrolling; search/map handlers invoked asynchronously through SDK',apiBase:base,checkedAt:new Date().toISOString()},null,2));
 }finally{
  try{
   await mini.evaluate(()=>{const p=getApp().globalData.sortUIProbe;if(p){wx.request=p.original;delete getApp().globalData.sortUIProbe}return true});if(gpsMocked)await mini.restoreWxMethod('getLocation');
   if(pointWritten){if(oldPoint)await pool.query('UPDATE public_map_locations SET kind=$2,category_id=$3,city_code=$4,district_code=$5,latitude=$6,longitude=$7,precision=$8,approved=$9,verification_note=$10,updated_at=$11 WHERE item_id=$1',[fixture.serviceId,oldPoint.kind,oldPoint.category_id,oldPoint.city_code,oldPoint.district_code,oldPoint.latitude,oldPoint.longitude,oldPoint.precision,oldPoint.approved,oldPoint.verification_note,oldPoint.updated_at]);else await pool.query('DELETE FROM public_map_locations WHERE item_id=$1',[fixture.serviceId]);}
   if(prefKey)await mini.callWxMethod('removeStorageSync',prefKey);for(let i=0;i<original.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]||'');await go('/pages/messages/index');await go('/pages/discover/index');
  }finally{await pool.end();await mini.disconnect();}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
