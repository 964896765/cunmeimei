'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const connect=require('./devtools_connection');const base='http://127.0.0.1:3100';
async function req(route,method='GET',body,auth={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function poll(read,accept,label){for(let n=0;n<40;n++){const value=await read();if(accept(value))return value;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out: '+label);}
(async()=>{
 const mini=await connect(),report=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/product-ui-result.json'),'utf8')),business=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/local-business-result.json'),'utf8'));
 const token=await mini.callWxMethod('getStorageSync','city_life_v2_auth_token'),mode=await mini.callWxMethod('getStorageSync','city_life_acceptance_mode'),userId=await mini.callWxMethod('getStorageSync','city_life_user_id');
 let count=0;const exceptions=[];mini.on('exception',e=>exceptions.push(e));const ok=label=>{count++;console.log('PASS '+label);};
 const call=(name,...args)=>mini.evaluate((name,args)=>{const p=getCurrentPages();setTimeout(()=>{Promise.resolve(p[p.length-1][name](...args)).catch(e=>console.error(e.message));},0);return true;},name,args);
 try{
  await mini.mockWxMethod('showModal',{confirm:true,cancel:false});await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',true);
  const owner=(await req('/api/v1/dev/login','POST',{devUser:'product-ui-author'})).data,reader=(await req('/api/v1/dev/login','POST',{devUser:'product-ui-reader'})).data;
  const login=await req('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD}),admin={cookie:login.cookie,csrf:login.data.csrf};
  await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',owner.token);
  let page=await mini.reLaunch('/pages/detail/index?id='+report.communityId);await poll(()=>page.data('comments'),x=>x.length>0,'parent comment');const parent=(await page.data('comments'))[0];
  await call('reply',{currentTarget:{dataset:{id:parent.id}}});await poll(()=>page.data('replyTo'),x=>x===parent.id,'reply selection');await page.setData({comment:'回复与删除界面功能验收'});await call('sendComment');
  const pending=await poll(()=>req('/admin/api/comments','GET',undefined,admin),x=>x.data.items.some(c=>c.body==='回复与删除界面功能验收'),'pending reply');const reply=pending.data.items.find(c=>c.body==='回复与删除界面功能验收');
  await req('/admin/api/comments/review','POST',{id:reply.id,status:'published'},admin);await call('loadInteractions');await poll(()=>page.data('comments'),x=>x.some(c=>c.id===reply.id&&c.parentId===parent.id&&c.mine),'published reply');ok('actual reply UI persists, is moderated and shows ownership');
  await mini.screenshot({path:path.join(__dirname,'../docs/product-replies.png')});await call('deleteComment',{currentTarget:{dataset:{id:reply.id}}});await poll(()=>page.data('comments'),x=>!x.some(c=>c.id===reply.id),'own reply delete');ok('own reply deletion updates actual UI');
  page=await mini.reLaunch('/pages/messages/index');await poll(()=>page.data('contacts'),x=>x.some(c=>c.publicationId===report.publicationId),'contacts loaded');const contact=(await page.data('contacts')).find(c=>c.publicationId===report.publicationId);
  await call('block',{currentTarget:{dataset:{id:contact.id}}});await poll(()=>page.data('contacts'),x=>x.find(c=>c.id===contact.id)?.blocked,'blocked');assert.equal((await req('/api/v1/items/'+report.publicationId+'/contact','POST',{message:'被屏蔽后再次申请联系'},reader)).status,409);ok('blocking UI prevents actual new contact requests');
  await call('block',{currentTarget:{dataset:{id:contact.id}}});await poll(()=>page.data('contacts'),x=>x.find(c=>c.id===contact.id)?.blocked===false,'unblocked');ok('unblock UI restores future contact eligibility');
  const merchantOwner=(await req('/api/v1/dev/login','POST',{devUser:business.ownerDevUser})).data;await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',merchantOwner.token);
  page=await mini.reLaunch('/pages/merchant-services/index?merchantId='+business.merchantId);await poll(()=>page.data('items'),x=>x.some(s=>s.id===business.serviceId),'services loaded');
  await call('editService',{currentTarget:{dataset:{id:business.serviceId}}});await poll(()=>page.data('editingId'),x=>x===business.serviceId,'service editor');await page.setData({description:'本地服务编辑界面验收更新说明，不产生真实派单或收费。'});await call('submit');
  await poll(()=>req('/api/v1/merchants/'+business.merchantId+'/services','GET',undefined,merchantOwner),x=>x.data.items.some(s=>s.id===business.serviceId&&s.status==='pending_review'),'service resubmission');assert.equal((await req('/api/v1/items/'+business.serviceId)).status,404);ok('service edit UI removes public availability until platform re-review');
  await req('/admin/api/review-service','POST',{id:business.serviceId,status:'published'},admin);ok('reviewed service returns to public availability');
  assert.equal(exceptions.length,0);ok('no runtime exceptions during management UI checks');
  fs.writeFileSync(path.join(__dirname,'../docs/product-management-ui-result.json'),JSON.stringify({passed:count,failed:0,checkedAt:new Date().toISOString()},null,2));
 }finally{await mini.restoreWxMethod('showModal');await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',token);await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',mode||false);await mini.callWxMethod('setStorageSync','city_life_user_id',userId||'');await mini.reLaunch('/pages/home/index');await mini.disconnect();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
