'use strict';
// Real local API/PostgreSQL and WeChat simulator acceptance. Retains labeled development records.
const assert=require('node:assert/strict');
const automator=require('../backend/node_modules/miniprogram-automator');
const fs=require('node:fs');
const path=require('node:path');
const base='http://127.0.0.1:3100';
let passed=0;
function check(condition,label){assert.ok(condition,label);console.log('PASS '+label);passed++;}
async function request(route,method='GET',body,auth={}){
 const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function poll(get,accept,label){for(let i=0;i<30;i++){const r=await get();if(accept(r))return r;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out: '+label);}
(async()=>{
 assert.equal(process.env.NODE_ENV,'development');assert.equal(process.env.DATA_DRIVER,'postgres');
 const mini=await require('./devtools_connection')();
 const call=(method,...args)=>mini.evaluate((name,values)=>{const pages=getCurrentPages();const page=pages[pages.length-1];if(typeof page[name]!=='function')throw Error('Missing '+name+' on '+page.route);setTimeout(()=>{Promise.resolve(page[name](...values)).catch(e=>console.error('Acceptance action failed: '+e.message));},0);return true;},method,args);
 const identityKeys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode','city_life_browse_city'];
 const original=[];for(const key of identityKeys)original.push(await mini.callWxMethod('getStorageSync',key));
 await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',true);await mini.callWxMethod('removeStorageSync','city_life_browse_city');
 const exceptions=[];mini.on('exception',e=>exceptions.push(e));
 const stamp=Date.now().toString();
 try{
  await mini.mockWxMethod('showModal',{confirm:true,cancel:false});
  await mini.callWxMethod('removeStorageSync','city_life_v2_auth_token');
  await mini.reLaunch('/pages/me/index');
  await new Promise(r=>setTimeout(r,700));
  let page=await mini.currentPage();await call('signin');
  const token=await poll(()=>mini.callWxMethod('getStorageSync','city_life_v2_auth_token'),Boolean,'development login');
  const user={token};const profile=await request('/api/v1/me','GET',undefined,user);user.userId=profile.data.userId;check(profile.status===200,'simulator development login uses persisted API session');
  const adminLogin=await request('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD});assert.equal(adminLogin.status,200);
  const admin={cookie:adminLogin.cookie,csrf:adminLogin.data.csrf};
  page=await mini.switchTab('/pages/publish/index');
  const title='本地验收闲置书桌'+stamp;
  await page.setData({kind:'used',title,detail:'本条为本地开发真实数据库验收记录，非真实商品。',district:'中心街道',price:'80',attributes:{cityCode:'441900'},publishCityName:'东莞市',agreed:true,showForm:true});
  await call('submit');
  const pubResult=await poll(()=>request('/api/v1/me/publications','GET',undefined,user),r=>r.data.items?.some(x=>x.title===title),'publication write');
  const publication=pubResult.data.items.find(x=>x.title===title);
  await poll(()=>mini.currentPage(),p=>p.path==='pages/my-posts/index','post-submit navigation');
  check(publication.status==='pending','UI publication persisted pending moderation');
  check((await request('/api/v1/items/'+publication.id)).status===404,'pending publication hidden publicly');
  check((await request('/admin/api/review','POST',{target:'publication',id:publication.id,status:'published'},{cookie:admin.cookie})).status===403,'review rejects missing CSRF');
  check((await request('/admin/api/review','POST',{target:'publication',id:publication.id,status:'published'},admin)).status===200,'authorized admin reviews persisted publication');
  page=await mini.switchTab('/pages/discover/index');console.log('DISCOVER ROUTE',page.path);await call('filter');await poll(()=>page.data('loading'),x=>!x,'discover feed load');
  check((await page.data('filtered')).some(x=>x.id===publication.id),'approved publication displayed in actual simulator discover feed');
  await mini.navigateTo('/pages/detail/index?id='+publication.id);await poll(()=>mini.currentPage(),p=>p.path==='pages/detail/index','detail navigation');
  page=await mini.currentPage();check(page.path==='pages/detail/index'&&(await page.data('item')).id===publication.id,'feed to detail navigation loads actual publication');
  const merchantLogin=await request('/api/v1/dev/login','POST',{devUser:'local-merchant-'+stamp});assert.equal(merchantLogin.status,200);const owner={token:merchantLogin.data.token};
  await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',owner.token);
  await mini.callWxMethod('setStorageSync','city_life_user_id',merchantLogin.data.userId);
  page=await mini.reLaunch('/pages/merchant/index');
  await page.setData({name:'本地验收维修铺'+stamp,category:'维修',district:'中心街道'});await call('submit');
  let application=(await poll(()=>request('/api/v1/me/merchant-application','GET',undefined,owner),r=>!!r.data.application,'merchant application')).data.application;
  await poll(()=>page.data('request'),Boolean,'merchant UI refresh');
  check(application?.status==='pending','merchant application submitted through simulator and persisted');
  check((await request('/admin/api/approve-merchant','POST',{id:application.id,manuallyVerified:true,note:'开发验收模拟核验'},admin)).status===409,'merchant approval blocked without evidence');
  await page.setData({registrationCode:'LOCAL-DEV-'+stamp,licenseHolder:application.name,evidenceReference:'development-acceptance-only-'+stamp});await call('submitEvidence');
  await poll(()=>request('/api/v1/me/merchant-application','GET',undefined,owner),r=>!!r.data.application?.registrationCode,'evidence persistence');
  const approved=await request('/admin/api/approve-merchant','POST',{id:application.id,manuallyVerified:true,note:'仅本地开发模拟人工核验，非真实资质背书'},admin);assert.equal(approved.status,200);const mid=approved.data.merchant.id;
  check(!!mid,'development merchant evidence and authorized review completed');
  await call('refresh');await poll(()=>page.data('mode'),x=>x==='operate','merchant workspace refresh');
  await mini.navigateTo('/pages/merchant-services/index?merchantId='+mid);page=await poll(()=>mini.currentPage(),p=>p.path==='pages/merchant-services/index','services navigation');await poll(()=>page.data('canEdit'),Boolean,'service permissions');
  check(page.path==='pages/merchant-services/index'&&(await page.data('canEdit')),'merchant service management business navigation and owner permission');
  const serviceTitle='验收家电维修'+stamp;
  await page.setData({title:serviceTitle,description:'本地验收模拟服务用于真实预约数据库流程，不接单不收款。',price:'50'});await call('submit');
  const services=await poll(()=>request('/api/v1/merchants/'+mid+'/services','GET',undefined,owner),r=>r.data.items?.some(x=>x.title===serviceTitle),'service persistence');const service=services.data.items.find(x=>x.title===serviceTitle);check(!!service,'UI merchant service submission persisted');
  check((await request('/api/v1/items/'+service.id)).status===404,'unreviewed service hidden');
  check((await request('/admin/api/review-service','POST',{id:service.id,status:'published'},admin)).status===200,'authorized admin service review completed');
  await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',user.token);
  await mini.callWxMethod('setStorageSync','city_life_user_id',user.userId);
  console.log('STAGE service detail');page=await mini.reLaunch('/pages/detail/index?id='+service.id);await poll(()=>page.data('item'),Boolean,'service detail load');console.log('STAGE booking navigation');await mini.navigateTo('/pages/booking/index?id='+service.id);page=await poll(()=>mini.currentPage(),p=>p.path==='pages/booking/index','booking navigation');await poll(()=>page.data('item'),Boolean,'booking service load');
  check(page.path==='pages/booking/index','published service detail to booking navigation');
  const date=new Date(Date.now()+86400000+8*3600000).toISOString().slice(0,10);
  await call('loadSlots',date);await new Promise(r=>setTimeout(r,400));await poll(()=>page.data('loadingSlots'),x=>!x,'available slots');await page.setData({date,time:'10:00',remark:'本地真实数据库验收预约，不产生真实派单'});await call('submit');
  const bookings=await poll(()=>request('/api/v1/me/bookings','GET',undefined,user),r=>r.data.items?.some(x=>x.serviceId===service.id),'booking persistence');
  const booking=bookings.data.items.find(x=>x.serviceId===service.id);
  await poll(()=>mini.currentPage(),p=>p.path==='pages/my-bookings/index','booking redirect');check(booking.status==='pending_confirm','UI booking persisted pending merchant confirmation');
  check((await request('/api/v1/bookings','POST',{serviceId:service.id,date,time:'10:00'},owner)).status===409,'second user cannot claim same slot');
  await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',owner.token);
  await mini.callWxMethod('setStorageSync','city_life_user_id',merchantLogin.data.userId);
  page=await mini.reLaunch('/pages/merchant-bookings/index?merchantId='+mid);
  const action='/api/v1/merchants/'+mid+'/bookings/'+booking.id+'/action';
  check((await request(action,'POST',{action:'confirm'},owner)).status===200,'merchant confirms persisted booking');
  check((await request(action,'POST',{action:'complete'},owner)).status===200,'merchant completes persisted booking');
  await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',user.token);
  await mini.callWxMethod('setStorageSync','city_life_user_id',user.userId);
  page=await mini.reLaunch('/pages/my-bookings/index');
  check((await page.data('items')).some(x=>x.id===booking.id&&x.status==='completed'),'customer simulator shows completed real booking');
  for(const route of ['home','discover','publish','messages','me']){page=await mini.switchTab('/pages/'+route+'/index');check(page.path==='pages/'+route+'/index','five-tab navigation '+route);}
  check(exceptions.length===0,'no simulator runtime exceptions captured during business flows');
  const report={passed,failed:0,ownerDevUser:'local-merchant-'+stamp,publicationId:publication.id,merchantId:mid,serviceId:service.id,bookingId:booking.id,date,checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(__dirname,'../docs/local-business-result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{try{for(let n=0;n<identityKeys.length;n++)await mini.callWxMethod('setStorageSync',identityKeys[n],original[n]||'');await mini.restoreWxMethod('showModal');await mini.evaluate(()=>{setTimeout(()=>wx.reLaunch({url:'/pages/home/index'}),120);return true;});}finally{await mini.disconnect();}}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
