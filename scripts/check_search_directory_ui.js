'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),connect=require('./devtools_connection');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,accept,label){for(let n=0;n<65;n++){const v=await read();if(accept(v))return v;await pause(100);}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await connect(),checks=[],backups=[],exceptions=[];let probed=false;
 const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
 const current=()=>mini.currentPage();
 const route=async url=>{await mini.evaluate(url=>{setTimeout(()=>url.includes('/home/')||url.includes('/discover/')||url.includes('/publish/')?wx.switchTab({url}):wx.reLaunch({url}),50);return true;},url);await pause(1400);return poll(current,p=>p.path===url.split('?')[0].slice(1),url);};
 const call=async(name,dataset={})=>{await mini.evaluate((name,dataset)=>{const p=getCurrentPages().slice(-1)[0];setTimeout(()=>p[name]({currentTarget:{dataset}}),0);return true;},name,dataset);await pause(180);};
 const settled=p=>poll(()=>p.data(),d=>!d.loading&&!d.landingLoading,'search settled');
 const mode=async value=>mini.evaluate(value=>{getApp().globalData.twoStateProbe.mode=value;return true;},value);
 const shot=name=>mini.screenshot({path:'docs/'+name+'.png'});
 mini.on('exception',e=>exceptions.push(e));
 try{
  const uid=await mini.callWxMethod('getStorageSync','city_life_user_id'),prefs='city_life_preferences_'+(uid||'guest'),history='city_life_search_history_'+(uid||'guest');
  for(const key of [prefs,history,'city_life_browse_city','city_life_city_history','city_life_acceptance_mode'])backups.push([key,await mini.callWxMethod('getStorageSync',key)]);
  await mini.callWxMethod('setStorageSync',prefs,{theme:'prism',largeText:false,reduceMotion:false});
  await mini.callWxMethod('setStorageSync','city_life_browse_city',{cityCode:'310100',districtCode:'',source:'manual'});
  let page=await route('/pages/home/index');await(await page.$('.search')).tap();page=await poll(current,p=>p.path==='pages/search/index','home search');await settled(page);
  check(!await page.$('.query-filters')&&(await page.$$('.landing-section')).length===2&&!await page.$('.featured-section'),'idle shows only search, recent and popular sections, without filters or local picks');
  check(await(await page.$('.search-root')).style('background-image')==='none','search has a plain surface without a page gradient');
  check(require('../miniprogram/pages/search/index.json').disableScroll===true&&!require('../miniprogram/app.json').tabBar.list.some(x=>x.pagePath==='pages/search/index'),'search remains a secondary page with no bottom tab and no outer page scroll');
  await shot('search-two-state-idle');
  await mini.evaluate(()=>{
   const probe={original:wx.request,urls:[],mode:'pass',pending:[]};getApp().globalData.twoStateProbe=probe;
   wx.request=options=>{
    if(!options.url.includes('/api/v1/feed?'))return probe.original.call(wx,options);
    probe.urls.push(options.url);
    if(probe.mode==='pass')return probe.original.call(wx,options);
    if(probe.mode==='hold'){probe.pending.push(options);return {abort(){}};}
    if(probe.mode==='fail'){setTimeout(()=>options.fail({errMsg:'request:fail layout test'}),60);return {abort(){}};}
    const items=Array.from({length:30},(_,i)=>({id:'layout-fixture-'+i,type:'used',kind:'listing',title:'仅用于自动化滚动检查 '+i,description:'临时测试夹具，不写入服务器。',district:'测试区域',price:'10'}));
    setTimeout(()=>options.success({statusCode:200,data:{items,pagination:{hasMore:false}}}),60);return {abort(){}};
   };return true;
  });probed=true;
  await(await page.$('input')).input('   ');await(await page.$('.search-submit')).tap();await pause(200);
  check(!await page.data('searched')&&(await mini.evaluate(()=>getApp().globalData.twoStateProbe.urls)).length===0,'blank keywords do not enter results or issue feed requests');
  await(await page.$('input')).input('不存在的搜索验收内容');await(await page.$('.search-submit')).tap();await settled(page);
  check(await page.data('searched')&&!!await page.$('.query-filters')&&!await page.$('.landing-section')&&!!await page.$('.search-empty'),'submitted keyword replaces landing with filtered empty results on the same route');
  await shot('search-two-state-empty');
  const controls=[await page.$('.city-filter'),...await page.$$('.query-filters picker'),await page.$('.advanced-button')],positions=await Promise.all(controls.map(x=>x.offset()));
  check(positions.every(x=>Math.abs(x.top-positions[0].top)<5),'city, category, sort and advanced icon remain on a single line');
  await(await page.$('.advanced-button')).tap();await poll(()=>page.data('advancedOpen'),Boolean,'advanced opened');
  check((await page.$$('.filter-section')).length===2&&!await page.$('.advanced-sheet picker'),'advanced filters contain date and pictures, without repeated city, category or sort');
  await call('chooseDate',{value:7});await call('chooseImages',{value:'with'});await shot('search-two-state-advanced');await call('closeAdvanced');
  check((await page.data('days'))===0&&(await page.data('images'))==='all','closing advanced filters discards unconfirmed changes');
  await call('toggleAdvanced');await call('chooseDate',{value:7});await call('chooseImages',{value:'with'});await call('applyAdvanced');await settled(page);
  let query=new URL((await mini.evaluate(()=>getApp().globalData.twoStateProbe.urls)).at(-1)).searchParams;
  check(query.get('q')==='不存在的搜索验收内容'&&query.get('days')==='7'&&query.get('images')==='with','applied filters retain the submitted keyword in the actual API request');
  await call('clear');await settled(page);query=new URL((await mini.evaluate(()=>getApp().globalData.twoStateProbe.urls)).at(-1)).searchParams;
  check(query.get('q')==='不存在的搜索验收内容'&&!query.has('days')&&!query.has('images')&&query.get('cityCode')==='310100','reset clears filters but preserves keyword, city and result mode');
  await mode('hold');await(await page.$('input')).input('等待验收');await(await page.$('.search-submit')).tap();await pause(150);
  check(!!await page.$('.search-loading')&&!await page.$('.search-empty'),'loading is separate from the empty state');
  await(await page.$('input')).input('再次搜索');
  await mini.evaluate(()=>{for(const r of getApp().globalData.twoStateProbe.pending.splice(0))r.success({statusCode:200,data:{items:[],pagination:{hasMore:false}}});return true;});await pause(150);
  check(!await page.data('searched')&&(await page.data('q'))==='再次搜索'&&!await page.$('.query-filters'),'typing again returns to the input state and ignores an older response');
  await mode('fail');await(await page.$('.search-submit')).tap();await poll(()=>page.data(),d=>!d.loading&&!!d.error,'failed request');
  check(!!await page.$('.search-error')&&!await page.$('.search-empty')&&(await page.data('q'))==='再次搜索','network failure preserves keyword and offers a separate retry state');
  await mode('pass');await(await page.$('.search-error button')).tap();await poll(()=>page.data(),d=>!d.loading&&!d.error,'successful retry');check(!await page.data('error')&&await page.data('searched'),'retry works without re-entering the query');
  await mode('fixture');await(await page.$('input')).input('布局验收');await(await page.$('.search-submit')).tap();await poll(()=>page.data(),d=>!d.loading&&d.items.length===30,'fixture list');
  const fixed=await page.$('.search-fixed-header'),before=await fixed.offset(),scroller=await page.$('.search-content');
  await poll(()=>page.$('#search-result-layout-fixture-0'),Boolean,'first rendered result');
  check((await page.data('items')).length===30&&!!await page.$('.result-heading'),'result layout renders a populated list using temporary automation fixtures only');
  await scroller.scrollTo(0,900);await pause(200);
  check(Number(await scroller.property('scrollTop'))>500&&Math.abs((await fixed.offset()).top-before.top)<1,'scrolling the result list does not move search or filters');
  const anchor=await page.data('scrollAnchor');await(await page.$('.query-filters picker')).trigger('change',{value:3});await settled(page);await pause(200);
  check((await page.data('scrollAnchor'))!==anchor&&Number(await scroller.property('scrollTop'))<5,'filtering resets result scrolling to the top');
  await scroller.scrollTo(0,700);await(await page.$('input')).input('第二次布局验收');await(await page.$('.search-submit')).tap();await settled(page);await pause(200);
  check(Number(await scroller.property('scrollTop'))<5,'submitting a new keyword resets the scroll position');
  await mode('pass');await call('clearQuery');await settled(page);check(!await page.data('searched')&&!await page.$('.query-filters'),'clearing the keyword restores recent and popular searches');
  await call('goBack');page=await poll(current,p=>p.path==='pages/home/index','return home');check(page.path==='pages/home/index','search back returns to its homepage entry');
  page=await route('/pages/discover/index');await(await page.$('.float-search')).tap();page=await poll(current,p=>p.path==='pages/search/index','discovery search');await settled(page);check(page.path==='pages/search/index','discovery opens the same unified search page');
  // Wait for the native opening transition before invoking a second navigation.
  await pause(500);await call('goBack');await poll(current,p=>p.path==='pages/discover/index','return discovery');
  page=await route('/pages/publish/index');await poll(()=>page.data(),d=>d.categories?.length===27,'publish categories');
  check((await page.$$('.industry-choice')).length===27&&(await page.data('groups')).length===3,'publishing keeps 27 categories and real group data');
  check((await page.$$('.project-group')).length===3&&(await page.$$('.project-row')).length===4,'directory expands just the first available group');
  const browser=await page.$('.project-browser'),browserTop=(await browser.offset()).top,left=await page.$('.industry-choice'),right=await page.$('.project-group');
  check((await left.offset()).top>=browserTop&&(await right.offset()).top>=browserTop,'the first rows begin below the fixed heading without top clipping');
  check(await left.style('font-size')==='14px'&&await right.style('background-image')==='none'&&!await page.$('.directory-note'),'directory uses restrained text navigation and removes gradient headings and the bottom disclaimer');
  await shot('publish-accordion-main');
  const group=(await page.data('groups'))[1];await call('toggleGroup',{id:group.id});
  check((await page.data('expandedGroupId'))===group.id&&(await page.$$('.project-row')).length===group.items.length,'expanding a group closes its siblings without navigating');
  await call('toggleProjectSearch');await(await page.$('.project-search-input')).input('空调维修');await poll(()=>page.data('searchHasQuery'),Boolean,'global project search');
  check((await page.data('projects'))[0].id==='C03G02S01','project search searches the entire real catalog rather than the selected category');
  await call('closeProjectSearch');check((await page.data('expandedGroupId'))===group.id,'closing project search restores the selected category and group');
  await call('openDrafts');await poll(current,p=>p.path==='pages/drafts/index','drafts');await pause(500);await call('goBack');page=await poll(current,p=>p.path==='pages/publish/index','return publish');
  check((await page.data('expandedGroupId'))===group.id,'returning from a secondary page preserves the expanded group');
  await call('selectCategory',{id:'C02'});check((await page.$$('.project-row')).length>0&&(await page.$$('.project-status')).length===(await page.$$('.project-row')).length,'unavailable projects remain explicitly labeled rather than opening generic forms');
  await call('selectCategory',{id:'C04'});await shot('publish-accordion-main');
  check(exceptions.length===0,'no captured WeChat runtime exceptions');
  fs.writeFileSync('docs/search-directory-ui-result.json',JSON.stringify({passed:checks.length,failed:0,checks,checkedAt:new Date().toISOString(),physicalDevice:false,data:'real local API for landing, empty results and filters; in-memory request fixtures only for scrolling/loading/failure, never persisted'},null,2));
 }finally{
  if(probed)await mini.evaluate(()=>{const p=getApp().globalData.twoStateProbe;if(p){wx.request=p.original;delete getApp().globalData.twoStateProbe;}return true;});
  for(const[key,value]of backups){if(value!==''&&value!==undefined&&value!==null)await mini.callWxMethod('setStorageSync',key,value);else await mini.callWxMethod('removeStorageSync',key);}
  await route('/pages/publish/index');await mini.disconnect();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
