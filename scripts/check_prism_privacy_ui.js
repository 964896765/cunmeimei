'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const connect=require('./devtools_connection');const base='http://127.0.0.1:3101';
async function req(route,method='GET',body,auth={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function poll(read,accept){for(let i=0;i<60;i++){const v=await read();if(accept(v))return v;await new Promise(r=>setTimeout(r,200));}throw Error('Privacy UI state did not arrive');}
(async()=>{
 const mini=await connect(),checks=[],errors=[];const keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode'],original=[];
 for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));mini.on('exception',e=>errors.push(e));
 const call=(name,...args)=>mini.evaluate((name,args)=>{const p=getCurrentPages().slice(-1)[0];setTimeout(()=>Promise.resolve(p[name](...args)).catch(e=>console.error(e.message)),0);return true;},name,args);
 const route=async (url,tab=false)=>{await mini.evaluate((url,tab)=>{setTimeout(()=>wx[tab?'switchTab':'reLaunch']({url}),200);return true;},url,tab);await new Promise(r=>setTimeout(r,3500));const page=await mini.currentPage();assert.equal(page.path,url.split('?')[0].slice(1));return page;};
 const shot=async n=>{await new Promise(r=>setTimeout(r,1800));await mini.screenshot({path:path.join(__dirname,'../docs/prism-'+n+'.png')});};
 try{
  console.log('Preparing real privacy acceptance records');
  const ownerDevUser='prism-owner-'+Date.now();const owner=(await req('/api/v1/dev/login','POST',{devUser:ownerDevUser})).data;
  const reader=(await req('/api/v1/dev/login','POST',{devUser:'prism-reader-'+Date.now()})).data;
  for(const [i,v] of [owner.token,owner.userId,true].entries())await mini.callWxMethod('setStorageSync',keys[i],v);
  const login=await req('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD});assert.equal(login.status,200);const admin={cookie:login.cookie,csrf:login.data.csrf};
  const areas=(await req('/api/v1/config')).data.areas;
  const publication=(await req('/api/v1/publications','POST',{type:'community',title:'隐私与主题开发验收',detail:'此条仅用于隐私设置和主题验收，不包含真实生活需求。',district:areas[0]},owner)).data.publication;
  await req('/admin/api/review','POST',{target:'publication',id:publication.id,status:'published'},admin);
  console.log('Saving dark theme through actual settings controls');
  let page=await route('/pages/me/index');console.log('Opening privacy panel');await call('openPrivacy');await poll(()=>page.data(),d=>d.mode==='privacy'&&!d.settingsBusy);
  console.log('Choosing dark theme');await (await page.$('.settings-row picker')).trigger('change',{value:'1'});
  const switches=await page.$$('switch');await switches[2].trigger('change',{value:false});await switches[3].trigger('change',{value:false});
  console.log('Saving settings');await (await page.$('button.btn')).tap();
  await poll(()=>req('/api/v1/me/preferences','GET',undefined,owner),r=>r.data.theme==='dark'&&!r.data.notificationPreview&&!r.data.allowContacts);
  await poll(()=>page.data(),d=>!d.settingsBusy&&d.themeClass==='theme-dark');checks.push('actual settings controls persist dark theme and privacy switches');
  const protectedNotices=(await req('/api/v1/me/notifications','GET',undefined,owner)).data.items;assert.ok(protectedNotices.length);assert.ok(protectedNotices.every(x=>x.title==='你有一条新的站内通知'));checks.push('server returns neutral notification summaries');
  assert.equal((await req('/api/v1/items/'+publication.id+'/contact','POST',{message:'验证停止接收新申请的服务端权限'},reader)).status,409);checks.push('server blocks new contact requests after switch is disabled');
  console.log('Capturing dark settings');await shot('dark-settings');
  for(const name of ['home','discover','publish','messages']){console.log('Capturing dark '+name);
   page=await route('/pages/'+name+'/index',true);await poll(()=>page.data(),d=>d.themeClass==='theme-dark');await shot('dark-'+name);
  }checks.push('dark theme remains consistent across the four other main tabs');
  page=await route('/pages/detail/index?id='+publication.id);await poll(()=>page.data(),d=>d.item&&d.themeClass==='theme-dark');await shot('dark-detail');checks.push('dark theme also renders a real approved detail');
  page=await route('/pages/me/index');await call('openPrivacy');await poll(()=>page.data(),d=>d.mode==='privacy'&&!d.settingsBusy);
  await (await page.$('.settings-row picker')).trigger('change',{value:'2'});const clearSwitches=await page.$$('switch');await clearSwitches[0].trigger('change',{value:true});await clearSwitches[1].trigger('change',{value:true});await (await page.$('button.btn')).tap();
  await poll(()=>page.data(),d=>!d.settingsBusy&&d.themeClass.includes('theme-clear large-text reduce-motion'));await shot('accessible-settings');checks.push('high contrast, larger text and reduced motion are saved and applied');
  console.log('Submitting a real privacy request and recording an audited reply');
  await (await page.$('.field-area')).input('申请访问本地开发验收账号的数据范围，不涉及真实个人资料。');await poll(()=>page.data(),d=>(d.requestText||'').length>=8&&!d.settingsBusy);console.log('Request form ready');await call('submitPrivacyRequest');
  const requests=await poll(()=>req('/api/v1/me/privacy-requests','GET',undefined,owner),r=>r.data.items.length>0);const request=requests.data.items[0];assert.equal(request.status,'pending');checks.push('actual form creates a private data-access request');
  const queue=(await req('/admin/api/privacy-requests','GET',undefined,admin)).data.items;assert.equal(queue.find(x=>x.id===request.id).reason,undefined);
  const detail=await req('/admin/api/privacy-requests/'+request.id,'GET',undefined,admin);assert.equal(detail.status,200);
  assert.equal((await req('/admin/api/privacy-requests/'+request.id,'POST',{status:'responded',revision:detail.data.item.revision,response:'这是本地开发验收答复，已经记录请求范围，未执行真实居民数据导出或删除。'},admin)).status,200);
  await call('openPrivacy');await poll(()=>page.data(),d=>d.privacyItems.some(x=>x.id===request.id&&x.status==='responded'));await mini.pageScrollTo(9999);await shot('request-response');checks.push('authorized admin response appears in the actual user request history');
  // Verify every selectable palette can be stored through the same versioned endpoint.
  for(const theme of ['quiet','warm','gentle','prism']){const current=(await req('/api/v1/me/preferences','GET',undefined,owner)).data;assert.equal((await req('/api/v1/me/preferences','PUT',{...current,theme,largeText:false,reduceMotion:false},owner)).status,200);await call('openPrivacy');await poll(()=>page.data(),d=>d.themeClass==='theme-'+theme&&!d.settingsBusy);if(theme==='quiet')await shot('quiet-settings');}
  page=await route('/pages/home/index',true);await poll(()=>page.data(),d=>d.themeClass==='theme-prism');await shot('home');checks.push('all six palettes are selectable and returning to Prism restores the shared appearance');
  assert.equal(errors.length,0);checks.push('no captured simulator runtime exceptions');
  fs.writeFileSync(path.join(__dirname,'../docs/prism-privacy-ui-result.json'),JSON.stringify({passed:checks.length,failed:0,checks,ownerUserId:owner.userId,ownerDevUser,publicationId:publication.id,requestId:request.id,physicalDevice:false},null,2));
  for(const c of checks)console.log('PASS '+c);
 }finally{try{for(let i=0;i<keys.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]);await route('/pages/home/index');}finally{await mini.disconnect();}}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
