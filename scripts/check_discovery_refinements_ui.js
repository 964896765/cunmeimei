'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const connect = require('./devtools_connection');
const definitions = require('../miniprogram/utils/discovery-refinements');
const channels = require('../miniprogram/utils/discovery-channels').definitions;
const out = path.resolve(__dirname, '../docs/remediation/discovery-refinements-2026-11-13');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function poll(read, accept, label) {
 for (let attempt = 0; attempt < 60; attempt++) {
  const value = await read();
  if (accept(value)) return value;
  await pause(200);
 }
 throw Error('Timed out '+label);
}

async function main() {
 fs.mkdirSync(out, {recursive:true});
 const checks = [], screenshots = [], exceptions = [];
 const mini = await connect();
 let hooked = false;
 const check = (condition, label) => {
  assert.ok(condition,label);
  checks.push(label);
  console.log('PASS '+label);
 };
 const call = (name,event) => mini.evaluate((name,event) => {
  setTimeout(() => getCurrentPages().slice(-1)[0][name](event),0);
  return true;
 },name,event);
 const settle = page => poll(() => page.data(), data => !data.loading, 'feed response');
 const shot = async name => {
  await pause(250);
  await mini.screenshot({path:path.join(out,name+'.png')});
  screenshots.push(name+'.png');
 };
 mini.on('exception',error => exceptions.push(String(error.message || error.description || error)));
 try {
  await mini.evaluate(() => {
   const app=getApp();
   if(app.globalData.__discoveryRefinementsAudit)throw Error('Previous audit probe still installed');
   const probe=app.globalData.__discoveryRefinementsAudit={original:wx.request,requests:[]};
   wx.request=options => probe.original({...options,success:response => {
    if(options.url.includes('/api/v1/feed?'))probe.requests.push({url:options.url,status:response.statusCode});
    options.success?.(response);
   }});
   return true;
  });
  hooked=true;
  let page=await mini.reLaunch('/pages/discover/index');
  await settle(page);
  check(await page.data('type')==='job','first discovery visit selects recruiting');
  await page.setData({cityCode:'310100',cityLabel:'上海市',districtCode:'310101',area:'黄浦区'});
  for(const channel of channels) {
   await page.setData({cityCode:'310100',cityLabel:'上海市',districtCode:'310101',area:'黄浦区',sortCode:'latest',sortLabel:'最新发布',sortIndex:0});
   const tabs=await page.$('#business-channels');
   check((await tabs.$$('.channel-tab')).length===7,'seven original tabs '+channel.id);
   await (await tabs.$('#channel-'+channel.id)).tap();
   await poll(() => page.data(),data => data.type===channel.id&&!data.loading,'channel '+channel.id);
   const data=await page.data();
   check(!data.error,'real API response '+channel.id);
   assert.deepEqual(data.quickFilters.map(item=>item.key), definitions.chips(channel.id).map(item=>item.key));
   check(!data.quickFilters.some(item=>item.key==='images')&&data.quickFilters.at(-1).key==='sort','sorting occupies final quick-filter position '+channel.id);
   await shot(channel.id);
   const key=definitions.configurations[channel.id].fields.find(field=>field!=='radiusKm');
   await (await page.$('.browse-chip[data-key="'+key+'"]')).tap();
   await poll(() => page.data(),value=>value.quickOpen&&value.quickKey===key,'filter sheet '+channel.id);
   const option=(await page.data()).quickOptions.find(item=>item.value!=='');
   check(!!option&&!!await page.$('.refinement-option[data-value="'+option.value+'"]'),'actual selectable field '+channel.id);
   if(channel.id==='job')await shot('job-options');
   await (await page.$('.refinement-option[data-value="'+option.value+'"]')).tap();
   await poll(() => page.data(),value=>!value.quickOpen&&!value.loading,'filtered '+channel.id);
   check(!await page.data('error'),'filter returns acknowledged API data '+channel.id);
   check((await page.data('quickFilters')).some(item=>item.key===key&&item.selected),'selected condition '+channel.id);
   await call('clearFilters');
   await poll(()=>page.data(),value=>!value.loading&&Object.keys(value.refinements).length===0&&!value.days,'reset '+channel.id);
   await (await page.$('.refine-trigger')).tap();
   await poll(()=>page.data('filterOpen'),Boolean,'channel filter panel '+channel.id);
   const panelData=await page.data();
   check(panelData.filterTitle===channel.name+'筛选','channel-specific funnel title '+channel.id);
   assert.deepEqual(panelData.panelFilters.map(field=>field.key),definitions.panel(channel.id).map(field=>field.key));
   const directory=await page.$('#browse-refinements');
   check((await directory.data('columns'))[0].length===channel.industries.length+1,'funnel category range '+channel.id);
   await shot(channel.id+'-panel');
   const panelField=panelData.panelFilters[0];
   const panelOption=panelField.options.find(option=>panelField.key==='radiusKm'?option.value==='':option.value!=='');
   await (await page.$('.refinement-option[data-key="'+panelField.key+'"][data-value="'+panelOption.value+'"]')).tap();
   await poll(()=>page.data(),value=>value.filterOpen&&!value.loading&&!value.quickBusy&&value.panelFilters.find(field=>field.key===panelField.key).options.some(option=>option.value===panelOption.value&&option.selected),'inline funnel condition '+channel.id);
   check((await page.data('panelFilters')).find(field=>field.key===panelField.key).options.some(option=>option.value===panelOption.value&&option.selected),'funnel condition and selected state '+channel.id);
   await (await page.$('.sort-close')).tap();
   await poll(()=>page.data('filterOpen'),value=>!value,'funnel complete '+channel.id);
   await call('clearFilters');
   await poll(()=>page.data(),value=>!value.loading&&Object.keys(value.refinements).length===0,'funnel reset '+channel.id);

  }
  await (await page.$('.browse-chip[data-key="sort"]')).tap();
  await poll(()=>page.data('sortOpen'),Boolean,'sorting from quick-filter row');
  await (await page.$('.sort-option[data-code="recommended"]')).tap();
  await poll(()=>page.data(),value=>value.sortCode==='recommended'&&!value.loading,'recommended ordering');
  check((await page.data('quickFilters')).find(item=>item.key==='sort').label==='综合推荐','sort chip reflects acknowledged selection');
  await call('changeType',{detail:{type:'service'}});
  await poll(()=>page.data(),value=>value.type==='service'&&!value.loading,'service final');
  await call('openQuickFilter',{currentTarget:{dataset:{key:'supply'}}});
  await poll(()=>page.data('quickOpen'),Boolean,'service source sheet');
  await (await page.$('.refinement-option[data-value="bookable"]')).tap();
  await poll(()=>page.data(),value=>!value.quickOpen&&!value.loading,'service condition');
  await call('openSearch');
  page=await poll(()=>mini.currentPage(),value=>value.path==='pages/search/index','search route');
  await settle(page);
  check((await page.data('refinements')).supply==='bookable','search receives business filters');
  await call('goBack');
  page=await poll(()=>mini.currentPage(),value=>value.path==='pages/discover/index','discovery return');
  await settle(page);
  check((await page.data('refinements')).supply==='bookable','return preserves business filters');
  await call('openMap');
  page=await poll(()=>mini.currentPage(),value=>value.path==='pages/map/index','map route');
  check((await page.data('refinements')).supply==='bookable','map receives supported service filters');
  await call('goBack');
  page=await poll(()=>mini.currentPage(),value=>value.path==='pages/discover/index','map return');
  await settle(page);
  // Explicit runtime-only layout fixtures exercise scrolling when the real query is empty.
  // They are discarded on reLaunch and never sent to the API or stored.
  await page.setData({filtered:Array.from({length:12},(_,index)=>({id:'layout-fixture-'+index,kind:'listing',type:'service',title:'隔离滚动验收条目 '+(index+1),description:'仅用于吸顶布局测试，非真实业务内容',district:'隔离布局验收',price:'',category:'布局测试'}))});
  await mini.pageScrollTo(500);
  await pause(400);
  const positions=await mini.evaluate(()=>new Promise(resolve=> {
   const query=wx.createSelectorQuery();
   query.select('.discover-toolbar').boundingClientRect();
   query.select('.discover-controls').boundingClientRect();
   query.exec(resolve);
  }));
  const header=await page.data('headerHeight');
  check(Math.abs(positions[0].top-header)<2,'tabs stick below native header');
  check(positions[1].top>=positions[0].bottom-2,'filters stay below seven tabs');
  await shot('sticky-layout-fixture');
  page=await mini.reLaunch('/pages/discover/index');
  await settle(page);
  await call('changeType',{detail:{type:'job'}});
  await poll(()=>page.data(),value=>value.type==='job'&&!value.loading,'large-text job');
  await mini.pageScrollTo(0);
  await call('restoreNavigation');
  const floats=await page.$$('.float-action');
  check(floats.length===2,'search and map keep bottom-right entrances');
  await page.setData({displayPreferences:{...(await page.data('displayPreferences')),largeText:true},themeClass:(await page.data('themeClass'))+' large-text'});
  await shot('large-text');
  const firstChip=await page.$('.quick-category-picker');
  const beforeScroll=await firstChip.offset();
  await (await page.$('.refinement-scroll')).scrollTo(1000,0);
  await pause(300);
  const afterScroll=await firstChip.offset();
  check(afterScroll.left<beforeScroll.left,'large text quick filters scroll horizontally');
  await shot('large-text-scrolled');
  const requests=await mini.evaluate(()=>getApp().globalData.__discoveryRefinementsAudit.requests);
  for(const channel of channels) {
   check(requests.some(request=>new URL(request.url).searchParams.get('channel')===channel.id&&request.status===200),'acknowledged channel request '+channel.id);
  }
  page=await mini.switchTab('/pages/me/index');
  await poll(()=>page.data(),value=>!value.summaryLoading,'personal center');
  const points=await page.$('#points-center-entry'),service=await page.$('#service-center-entry'),functions=await page.$('.personal-functions');
  const pointsOffset=await points.offset(),pointsSize=await points.size(),serviceOffset=await service.offset(),serviceSize=await service.size(),functionsOffset=await functions.offset();
  check(pointsOffset.top+pointsSize.height<=serviceOffset.top&&serviceOffset.top+serviceSize.height<=functionsOffset.top,'service center is an independent card below points and above personal functions');
  check((await page.$$('.service-center-card')).length===1,'single visible service-center card');
  await shot('me-service-card');
  await service.tap();
  await poll(()=>page.data('mode'),value=>value==='service','service center entry');
  check(!!await page.$('#service-merchant'),'service-center card opens existing business functions');
  await call('back');
  await poll(()=>page.data('mode'),value=>value==='main','personal center return');
  check(exceptions.length===0,'no captured runtime exceptions');
  fs.writeFileSync(path.join(out,'ui-result.json'),JSON.stringify({status:'pass',checks,passed:checks.length,screenshots,exceptions,realBackend:true,physicalDevice:false,content:'read-only real local API for seven screenshots and request checks; explicitly labeled runtime-only layout fixtures for sticky scrolling; no records created or persisted',region:'Shanghai Huangpu selected in page memory for layout checks',checkedAt:new Date().toISOString()},null,2));
 } catch(error) {
  try{await shot('failure');}catch{}
  fs.writeFileSync(path.join(out,'ui-result.json'),JSON.stringify({status:'fail',error:error.message,checks,screenshots,exceptions},null,2));
  throw error;
 } finally {
  if(hooked)await mini.evaluate(()=> {
   const app=getApp(),probe=app.globalData.__discoveryRefinementsAudit;
   wx.request=probe.original;
   delete app.globalData.__discoveryRefinementsAudit;
   return true;
  });
  await mini.reLaunch('/pages/discover/index');
  await mini.disconnect();
 }
}

main().catch(error=>{console.error(error.stack);process.exitCode=1;});
