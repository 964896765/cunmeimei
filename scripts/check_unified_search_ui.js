'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const connect=require('./devtools_connection'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(read,accept,label){for(let n=0;n<60;n++){const v=await read();if(accept(v))return v;await pause(100);}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await connect(),checks=[],backups=[],exceptions=[];
 const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
 const route=async url=>{await mini.evaluate(url=>{setTimeout(()=>{if(['/pages/home/index','/pages/discover/index','/pages/messages/index'].includes(url))wx.switchTab({url});else wx.reLaunch({url});},100);return true;},url);await pause(3500);return poll(()=>mini.currentPage(),p=>p.path===url.split('?')[0].slice(1),'route '+url);};
 const shot=async name=>mini.screenshot({path:'docs/unified-'+name+'.png'});
 mini.on('exception',e=>exceptions.push(e));
 try{
  const uid=await mini.callWxMethod('getStorageSync','city_life_user_id');
  const prefs='city_life_preferences_'+(uid||'guest'),history='city_life_search_history_'+(uid||'guest'),shortcuts='city_life_shortcuts_'+(uid||'guest');
  for(const key of ['city_life_browse_city','city_life_acceptance_mode',prefs,history,shortcuts])backups.push([key,await mini.callWxMethod('getStorageSync',key)]);
  await mini.callWxMethod('setStorageSync','city_life_browse_city',{cityCode:'441900',districtCode:'',source:'manual'});
  await mini.callWxMethod('removeStorageSync',history);
  let page=await route('/pages/categories/index');
  const options=await page.data('options');check(options.length===27&&new Set(options.map(x=>x.id)).size===27&&(await page.$$('.shortcut-option')).length===27,'27 industries render exactly once');
  check(!await page.$('input')&&!await page.$('.selected-grid')&&!await page.$('.fixed-more'),'shortcut editor has no search, duplicate selected list or More');
  for(const button of await page.$$('.shortcut-option')){const id=await button.attribute('data-id'),selected=(await page.data('selectedIds')).includes(id);assert.equal(await(await button.$('.shortcut-state')).text(),selected?'−':'＋');}
  const first=await page.$('.shortcut-option'),id=await first.attribute('data-id'),wasSelected=(await page.data('selectedIds')).includes(id);
  await first.tap();await poll(()=>page.data('selectedIds'),ids=>ids.includes(id)!==wasSelected,'shortcut toggle');check((await page.$$('.shortcut-option')).length===27,'toggling does not duplicate or move the category list');
  await first.tap();await poll(()=>page.data('selectedIds'),ids=>ids.includes(id)===wasSelected,'restore shortcut');await shot('shortcuts');
  page=await route('/pages/home/index');await(await page.$('.search')).tap();await pause(1600);page=await mini.currentPage();check(page.path==='pages/search/index','homepage opens the single search route');
  await poll(()=>page.data(),d=>!d.loading&&!d.landingLoading,'search landing loaded');
  check(!(await page.data('searched'))&&!!await page.$('.recent-list')===false,'search starts in an honest empty recent-search state');
  check(!await page.$('.featured-section')&&!await page.$('.query-filters'),'idle search has no featured module or filter row');
  await shot('search-idle');
  await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',true);
  await(await page.$('input')).input('家电维修');await(await page.$('.search-submit')).tap();await poll(()=>page.data(),d=>d.searched&&!d.loading,'explicit search');
  const controls=[await page.$('.city-filter'),...await page.$$('.query-filters picker'),await page.$('.advanced-button')],positions=await Promise.all(controls.map(x=>x.offset()));check(Math.max(...positions.map(x=>x.top))-Math.min(...positions.map(x=>x.top))<6,'city, category, sort and advanced filters stay on one row after search');
  check((await page.data('recentTerms')).includes('家电维修'),'explicit real search is retained in account-scoped local history');
  check(!await page.$('.recent-list'),'search results replace landing sections on the same page');await shot('search-results');
  await(await page.$('input')).input('没有此内容验收关键词');await(await page.$('.search-submit')).tap();await poll(()=>page.data(),d=>d.searched&&!d.loading,'no-result search');check((await page.data('items')).length===0&&!!await page.$('.search-empty-mark'),'no-result state is rendered on the same search page');await shot('search-empty');
  await(await page.$('.advanced-button')).tap();await poll(()=>page.data('advancedOpen'),Boolean,'advanced filters');check(!!await page.$('.advanced-sheet'),'advanced filter opens actual region controls');await(await page.$('.advanced-mask')).tap();
  const acceptance=backups.find(x=>x[0]==='city_life_acceptance_mode')[1];if(acceptance)await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',acceptance);else await mini.callWxMethod('removeStorageSync','city_life_acceptance_mode');
  page=await route('/pages/discover/index');await poll(()=>page.data(),d=>!d.loading,'discovery feed');
  const floats=await page.$$('.float-action');check(floats.length===2&&!!await page.$('.float-search')&&!!await page.$('.float-globe')&&!await page.$('.float-symbol'),'discovery uses two matching line icons with no Emoji');
  for(const button of floats){const size=await button.size();assert.ok(size.width>=44&&size.height>=44);assert.ok(parseFloat(await button.style('border-top-width'))>0);}check(true,'discovery icons have visible boundaries and targets of at least 44px');await shot('discover');
  await floats[0].tap();await pause(1600);check((await mini.currentPage()).path==='pages/search/index','discovery opens the same search route');
  page=await route('/pages/messages/index');check(!await page.$('.message-heading')&&require('../miniprogram/pages/messages/index.json').navigationBarTitleText==='消息中心','message center uses one centered native header');await shot('messages');
  const originalPrefs=backups.find(x=>x[0]===prefs)[1]||{};
  for(const theme of ['prism','dark','clear','quiet','warm','gentle']){
   await mini.callWxMethod('setStorageSync',prefs,{...originalPrefs,theme,largeText:theme==='clear'});
   page=await route('/pages/search/index');await poll(()=>page.data(),d=>!d.loading&&!d.landingLoading,'theme landing');check((await page.data('themeClass')).includes('theme-'+theme),'unified search renders theme '+theme+(theme==='clear'?' with large text':''));await shot('search-'+theme);
  }
  check(exceptions.length===0,'no mini-program runtime exception during these checks');
  fs.writeFileSync('docs/unified-search-ui-result.json',JSON.stringify({checks,exceptions,device:'WeChat developer-tools simulator',physicalDevice:'not tested'},null,2)+'\n');
 }finally{
  for(const [key,value]of backups){if(value!==''&&value!==undefined&&value!==null)await mini.callWxMethod('setStorageSync',key,value);else await mini.callWxMethod('removeStorageSync',key);}
  try{await route('/pages/categories/index');}catch(e){console.error('Could not restore the final route: '+e.message);}finally{await mini.disconnect();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
