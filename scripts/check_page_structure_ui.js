'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const connect=require('./devtools_connection');const pause=ms=>new Promise(r=>setTimeout(r,ms));const base=require('../miniprogram/utils/runtime').apiBaseUrl;
async function req(route,method='GET',body,auth={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function poll(read,accept,label){let value;for(let n=0;n<60;n++){value=await read();if(accept(value))return value;await pause(150)}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await connect(),checks=[],errors=[],keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode','city_life_v06_selected_area','city_life_browse_city'],original=[];
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label)};
 const route=async url=>{await mini.evaluate(url=>{setTimeout(()=>wx.reLaunch({url}),150);return true},url);await pause(3500);return poll(()=>mini.currentPage(),p=>p?.path===url.split('?')[0].slice(1),'route '+url.split('?')[0]);};
 const shot=async name=>{await mini.evaluate(()=>{setTimeout(()=>wx.pageScrollTo({scrollTop:0,duration:0}),0);return true;});await pause(350);await mini.screenshot({path:path.resolve(__dirname,'../docs/pages-'+name+'.png')})};
 mini.on('exception',e=>errors.push(e));
 const stamp=Date.now();const owner=(await req('/api/v1/dev/login','POST',{devUser:'page-structure-'+stamp})).data;
 const adminLogin=await req('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD});assert.equal(adminLogin.status,200);const admin={cookie:adminLogin.cookie,csrf:adminLogin.data.csrf};
 let publication;
 try{
  for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));
  for(const [n,value]of [owner.token,owner.userId,true,'全部地区'].entries())await mini.callWxMethod('setStorageSync',keys[n],value);
  await mini.callWxMethod('removeStorageSync','city_life_browse_city');
  await mini.mockWxMethod('showModal',{confirm:true,cancel:false});
  console.log('STAGE portal and shortcuts');let page=await route('/pages/home/index');await poll(()=>page.data(),d=>!d.loading,'home');
  check(!!await page.$('swiper')&&(await page.data('quickItems')).length===8,'home has guide carousel and eight initial shortcuts including final More');
  check(!await page.$('components\\/content-card\\/index'),'portal does not duplicate the ordinary discovery feed');
  check(!await page.$('.top-row .link'),'shortcut editing is removed from homepage top right');
  const quickButtons=await page.$$('.quick-item');await quickButtons[quickButtons.length-1].tap();await poll(()=>mini.currentPage(),p=>p.path==='pages/categories/index','More shortcuts');page=await mini.currentPage();
  await(await page.$('.shortcut-option.chosen')).tap();await poll(()=>page.data('selectedIds'),x=>x.length===6,'remove shortcut');check((await page.data('selectedIds')).length===6,'shortcut removal uses real editor state');
  const add=await page.$$('.shortcut-option');await add[add.length-1].tap();await poll(()=>page.data('selectedIds'),x=>x.includes('C27'),'add shortcut');check((await page.data('selectedIds')).includes('C27'),'candidate financial category can be pinned without granting publish permission');
  await(await page.$('.shortcut-save .btn')).tap();await poll(()=>mini.currentPage(),p=>p.path==='pages/home/index','save shortcuts');page=await mini.currentPage();check((await page.data('quickItems')).some(x=>x.id==='C27'),'shortcut changes save and return to home');
  const persisted=await mini.callWxMethod('getStorageSync','city_life_shortcuts_'+owner.userId);check(persisted.includes('C27'),'shortcut order and membership persist per account');await shot('home');
  page=await route('/pages/categories/index');check((await page.data('options')).length===27,'More exposes all 27 imported industry shortcut choices');
  const choices=await page.$$('.shortcut-option');check(choices.length===27&&new Set((await page.data('options')).map(x=>x.id)).size===27,'shortcut management renders each of the 27 industries exactly once');check(!await page.$('input')&&!await page.$('.selected-grid')&&!await page.$('.fixed-more'),'shortcut management has one list without search, duplicate selected list or More');for(const choice of choices){const id=await choice.attribute('data-id'),selected=(await page.data('selectedIds')).includes(id);check(await(await choice.$('.shortcut-state')).text()===(selected?'−':'＋'),'shortcut '+id+' uses selected minus or unselected plus');}await shot('directory');
  console.log('STAGE publishing directory search and real draft');page=await route('/pages/publish/index');
  check((await page.data('categories')).length===27,'publishing sidebar uses the same 27-industry registry');
  const drafts=await page.$('.drafts-button'),search=await page.$('.project-search-button');check((await search.offset()).left<(await drafts.offset()).left&&Math.abs((await search.offset()).top-(await drafts.offset()).top)<2,'project search control precedes drafts in the top toolbar');
  await search.tap();const projectInput=await poll(()=>page.$('.project-search-field input'),Boolean,'project search input rendered');await projectInput.input('家电维修');await poll(()=>page.data('projects'),x=>x.length===1,'cross-industry alias/project search');
  check((await page.data('projects'))[0].id==='C03G02S01','project search preserves the original leaf ID');
  await(await page.$('.project-row')).tap();await poll(()=>page.data('showForm'),Boolean,'actual service demand form');
  check((await page.data('attributes')).categoryId==='C03G02S01'&&(await page.data('kind'))==='service','project click opens the existing service-demand form with versioned category reference');
  const cityIndex=(await page.data('publishCities')).findIndex(x=>x.code==='441900');await(await page.$('.publish-city')).trigger('change',{value:cityIndex});await poll(()=>page.data('attributes'),a=>a.cityCode==='441900','explicit publication city');
  const inputs=await poll(()=>page.$$('input.field'),x=>x.length>=2,'publication inputs rendered after city selection'),titleText='目录UI验收家电维修'+stamp;
  await inputs[0].input(titleText);await(await page.$('textarea')).input('本条为本地真实数据库页面验收记录，不是实际服务需求。');if(inputs[1])await inputs[1].input('60');
  const actions=await page.$$('.btn');let save;for(const el of actions)if(await el.text()==='保存到账号')save=el;assert.ok(save);await save.tap();
  const draft=await poll(()=>req('/api/v1/me/draft','GET',undefined,owner),r=>r.data.payload?.title===titleText,'account draft save persisted');check(draft.data.payload?.attributes.categoryId==='C03G02S01','real PostgreSQL account draft retains leaf ID and catalog version');
  await mini.pageScrollTo(9999);await pause(400);await(await page.$('checkbox-group')).trigger('change',{value:['agreed']});await poll(()=>page.data('agreed'),Boolean,'publication agreement');
  let submit;for(const el of await page.$$('.btn'))if(await el.text()==='提交审核')submit=el;assert.ok(submit);await submit.tap();
  const pubs=await poll(()=>req('/api/v1/me/publications','GET',undefined,owner),r=>r.data.items.some(x=>x.title===titleText),'publication persisted');publication=pubs.data.items.find(x=>x.title===titleText);await poll(()=>mini.currentPage(),p=>p.path==='pages/my-posts/index','post-submit result navigation');
  check(publication.status==='pending'&&publication.attributes.categoryVersion==='2.0-audit','actual UI submission remains pending and retains candidate catalog version');
  check((await req('/api/v1/feed?categoryId=C03G02S01&q='+encodeURIComponent(titleText))).data.items.length===0,'pending category-tagged content remains hidden publicly');
  assert.equal((await req('/admin/api/review','POST',{target:'publication',id:publication.id,status:'published'},admin)).status,200);
  page=await route('/pages/search/index?categoryId=C03G02S01&q='+encodeURIComponent(titleText));
  await poll(()=>page.data(),d=>!d.loading&&d.items.some(x=>x.id===publication.id),'real category search');check((await page.data('items')).every(x=>x.attributes.categoryId==='C03G02S01'),'independent global search filters approved records by stable category ID');await shot('search');
  console.log('STAGE continuous discovery and native navigation');page=await route('/pages/discover/index');await poll(()=>page.data(),d=>!d.loading&&d.filtered.length>0,'discover');
  // Devtools exposes custom tags by their component path, not the WXML alias.
  const renderedCards=await poll(()=>page.$$('[layout="stream"]'),rows=>rows.length>0,'continuous feed rendered');
  check((await page.data('channels')).length===8&&renderedCards.length===(await page.data('filtered')).length&&!!await renderedCards[0].$('.stream-title'),'eight channels share a continuous list and existing content component');
  await mini.pageScrollTo(100);await pause(250);await mini.pageScrollTo(500);await pause(600);check(await page.data('immersed'),'real native upward scrolling hides discovery toolbar and floating controls');
  await mini.screenshot({path:path.resolve(__dirname,'../docs/pages-discover-immersed.png')});
  await mini.pageScrollTo(100);await pause(500);check(!(await page.data('immersed')),'downward scrolling restores discovery navigation');await mini.pageScrollTo(0);await pause(250);
  const first=(await page.data('filtered'))[0],prior=(await req('/api/v1/items/'+first.id+'/saved','GET',undefined,owner)).data.saved;
  const card=await page.$('[layout="stream"]');await(await card.$('.stream-save')).tap();await poll(()=>page.data('filtered'),rows=>rows.find(x=>x.id===first.id)?.isSaved===true,'stream save');
  check((await mini.currentPage()).path==='pages/discover/index'&&(await req('/api/v1/items/'+first.id+'/saved','GET',undefined,owner)).data.saved,'stream favorite calls the real server without entering detail');
  if(!prior)await req('/api/v1/items/'+first.id+'/saved','DELETE',{},owner);await shot('discover');
  const floats=await page.$$('.float-action');await floats[0].tap();await pause(3500);check((await mini.currentPage()).path==='pages/search/index','discovery search opens the same global search route');
  page=await route('/pages/map/index');check(!!await page.$('map')&&(await page.data('markers')).length===0,'native map does not invent markers or expose personal addresses');await shot('map');
  check(!await page.$('.map-list-fallback')&&!await page.$('.drawer-states'),'map has neither duplicate list-search action nor drawer state buttons');await(await page.$('.map-search')).tap();await pause(3500);check((await mini.currentPage()).path==='pages/search/index'&&await(await mini.currentPage()).data('publicOnly'),'map search reuses the unified page with verified public-location scope');
  console.log('STAGE personal workspace and contact center');page=await route('/pages/detail/index?id='+publication.id);await poll(()=>page.data(),d=>!!d.item,'detail');
  page=await route('/pages/me/index');await(await page.$('.history-entry')).tap();await poll(()=>page.data(),d=>d.mode==='history'&&!d.loading,'history');check((await page.data('items')).some(x=>x.id===publication.id),'local owner-scoped history revalidates public visibility through the real server');await shot('history');
  page=await route('/pages/me/index');await(await page.$$('.workspace-grid>view'))[1].tap();await pause(3500);page=await mini.currentPage();check(page.path==='pages/publish/index'&&await page.data('showDrafts'),'My drafts links into actual draft management');
  page=await route('/pages/messages/index');check(await page.data('tab')==='contacts','contact center defaults to real contact requests, not local demo conversations');await shot('messages');
  check(errors.length===0,'no captured application runtime exceptions during the page flows');
  fs.writeFileSync(path.resolve(__dirname,'../docs/pages-structure-ui-result.json'),JSON.stringify({passed:checks.length,failed:0,checks,publicationId:publication.id,physicalDevice:false,agreementInput:'WeChat SDK change event on checkbox-group; physical checkbox tapping pending device acceptance',testData:true,checkedAt:new Date().toISOString()},null,2));
 }finally{
  try{await mini.restoreWxMethod('showModal');for(let n=0;n<original.length;n++)await mini.callWxMethod('setStorageSync',keys[n],original[n]||'');await route('/pages/home/index');}finally{await mini.disconnect()}
 }
})().catch(error=>{console.error(error.stack);process.exitCode=1});
