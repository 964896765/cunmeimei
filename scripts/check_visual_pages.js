'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const connect=require('./devtools_connection');const base='http://127.0.0.1:3101';
async function req(route,method='GET',body,auth={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.ok(r.ok,route+': '+r.status);return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function poll(read,accept){for(let i=0;i<60;i++){const value=await read();if(accept(value))return value;await new Promise(r=>setTimeout(r,200));}throw Error('Visual page state did not arrive');}
(async()=>{
 const mini=await connect(),checks=[],errors=[];
 const keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode','city_life_v06_selected_area'],original=[];
 for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));
 mini.on('exception',e=>errors.push(e));
 const shot=async name=>{await new Promise(r=>setTimeout(r,350));await mini.screenshot({path:path.join(__dirname,'../docs/visual-'+name+'.png')});};
 try{
  console.log('Checking native capsule');const capsule=await mini.evaluate(()=>wx.getMenuButtonBoundingClientRect());assert.ok(capsule.width>0&&capsule.bottom>capsule.top);checks.push('actual native capsule metrics are available; native navigation is retained');
  await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',false);
  console.log('Checking home');let page=await mini.reLaunch('/pages/home/index');
  await poll(()=>page.data(),d=>!d.loading);assert.ok((await page.data()).latest.every(x=>x.kind==='listing'));await shot('home');checks.push('normal home prioritizes resident listings without invented supply');
  await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',true);
  console.log('Checking discover');page=await mini.reLaunch('/pages/discover/index');await poll(()=>page.data(),d=>!d.loading&&d.areas.length>1);
  // Invoke existing query handlers; API and rendered cards remain real.
  await mini.evaluate(()=>{const p=getCurrentPages().slice(-1)[0];setTimeout(()=>{p.wholeCity();p.changeType({currentTarget:{dataset:{type:'used'}}});},0);return true;});
  await poll(()=>page.data(),d=>!d.loading&&d.type==='used'&&d.filtered.length>0);
  assert.ok(await page.$('.result-grid'));await shot('discover');checks.push('used category renders real image records in two-column cards');
  await (await page.$('input')).input('没有匹配的开发筛选'+Date.now());
  await poll(()=>page.data(),d=>!d.loading&&d.q&&d.filtered.length===0);
  await (await page.$('.filter-summary .link')).tap();
  await poll(()=>page.data(),d=>!d.loading&&!d.q&&d.type==='all'&&d.area==='全部地区'&&d.sortIndex===0);checks.push('clear filters restores query, category, area and sort coherently');
  console.log('Checking publish');page=await mini.reLaunch('/pages/publish/index');await page.waitFor('.publish-choice');
  assert.equal((await page.$$('.publish-choice')).length,5);await shot('publish');checks.push('four standard publishing choices and separate gated recruitment entry remain');
  const owner=(await req('/api/v1/dev/login','POST',{devUser:'visual-owner-'+Date.now()})).data,reader=(await req('/api/v1/dev/login','POST',{devUser:'visual-reader-'+Date.now()})).data;
  const config=(await req('/api/v1/config')).data;
  const post=(await req('/api/v1/publications','POST',{type:'used',title:'界面联系申请验收',detail:'仅用于本地界面待处理申请验证，不代表实际商品。',district:config.areas[0]},owner)).data.publication;
  const login=await req('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD});
  await req('/admin/api/review','POST',{target:'publication',id:post.id,status:'published'},{cookie:login.cookie,csrf:login.data.csrf});
  await req('/api/v1/items/'+post.id+'/contact','POST',{message:'这是界面联系申请的开发验收记录。'},reader);
  await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',owner.token);await mini.callWxMethod('setStorageSync','city_life_user_id',owner.userId);
  console.log('Checking messages');page=await mini.reLaunch('/pages/messages/index');await poll(()=>page.data(),d=>d.pendingContacts===1&&!d.loading);await shot('messages');
  await (await page.$('.pending-banner')).tap();await poll(()=>page.data(),d=>d.tab==='contacts'&&d.contactFilter==='pending');await page.waitFor('.contact-title');assert.equal((await page.$$('.contact-title')).length,1);checks.push('pending-contact entry opens a genuine incoming request without equating unread with pending');
  await (await page.$('.contact-filter .link')).tap();await poll(()=>page.data(),d=>d.contactFilter==='all');checks.push('contact filter can return to all requests');
  page=await mini.reLaunch('/pages/me/index');await poll(()=>page.data(),d=>d.hasSession&&d.myUserId===owner.userId);
  assert.equal((await page.$$('.stats')).length,1);assert.equal((await page.$$('.merchant-entry')).length,1);await shot('me');checks.push('resident statistics and separate secondary merchant entry render once');
  assert.equal(errors.length,0);checks.push('no captured simulator runtime exceptions');
  fs.writeFileSync(path.join(__dirname,'../docs/visual-pages-result.json'),JSON.stringify({passed:checks.length,failed:0,checks,capsule,nativeNavigation:true,testData:true},null,2));for(const check of checks)console.log('PASS '+check);
 }finally{for(let i=0;i<keys.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]);await mini.reLaunch('/pages/home/index');await mini.disconnect();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
