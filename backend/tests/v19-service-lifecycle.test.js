'use strict';
const {acceptedFixtureRequest}=require('./helpers/publication-confirmation');
const test=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');
const {pgOperations}=require('../src/operations-pg');
const fs=require('node:fs');
const path=require('node:path');

async function setup(t){
 const repo=createMemoryRepository(), app=createApp({repo,areas:['中心街道'],allowDevLogin:true,superAdminPassword:'v19-test-password'});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base=`http://127.0.0.1:${app.address().port}`;
 const req=async(p,method='GET',data,auth={})=>{
  const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie}:{}),...(auth.csrf?{'X-CSRF-Token':auth.csrf}:{})},body:data===undefined?undefined:JSON.stringify(acceptedFixtureRequest(p,method,data))});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 };
 const login=async name=>{
  const r=await req('/api/v1/dev/login','POST',{devUser:name});assert.equal(r.status,200);return r.data;
 };
 return {repo,req,login};
}

test('V0.19: owner pauses service, no new bookings; existing booking remains actionable; re-submission needs moderation',async t=>{
 const {req,login}=await setup(t);
 const owner=await login('v19-owner'), customer=await login('v19-customer'), staff=await login('v19-staff'), stranger=await login('v19-stranger');
 const a=await req('/api/v1/merchant-applications','POST',{name:'邻里家电维修',category:'维修',district:'中心街道'},{token:owner.token});assert.equal(a.status,201);
 const aid=a.data.application.id;
 assert.equal((await req(`/api/v1/merchant-applications/${aid}/evidence`,'POST',{registrationCode:'OFFLINE-REVIEW-V19',licenseHolder:'邻里家电维修',evidenceReference:'v19-only-test'}, {token:owner.token})).status,200);
 const adm=await req('/admin/api/login','POST',{role:'superadmin',password:'v19-test-password'});
 const credentials={cookie:adm.cookie,csrf:adm.data.csrf};
 const mr=await req('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'演示环境人工核验测试，不代表真实资质审核'},credentials);
 assert.equal(mr.status,200);const mid=mr.data.merchant.id;
 const srv=await req(`/api/v1/merchants/${mid}/services`,'POST',{title:'测试家电上门维修',description:'服务在商家暂停后应停止新增预约',price:'¥40'}, {token:owner.token});assert.equal(srv.status,201);
 const sid=srv.data.service.id;
 const endpoint=`/api/v1/merchants/${mid}/services/${sid}/action`;
 assert.equal((await req(endpoint,'POST',{action:'pause'},{token:owner.token})).status,409,'pending service cannot pause');
 assert.equal((await req('/admin/api/review-service','POST',{id:sid,status:'published'},credentials)).status,200);
 assert.equal((await req('/api/v1/items/'+sid)).status,200);
 const book=await req('/api/v1/bookings','POST',{serviceId:sid,date:'2099-10-18',time:'10:00',remark:'不涉及付款'}, {token:customer.token});
 assert.equal(book.status,201);
 assert.equal((await req(endpoint,'POST',{action:'invalid'},{token:owner.token})).status,400);
 assert.equal((await req(endpoint,'POST',{action:'pause'},{token:stranger.token})).status,403);
 assert.equal((await req(`/api/v1/merchants/${mid}/members`,'POST',{userId:staff.userId,role:'staff'},{token:owner.token})).status,200);
 assert.equal((await req(endpoint,'POST',{action:'pause'},{token:staff.token})).status,403);
 const paused=await req(endpoint,'POST',{action:'pause'},{token:owner.token});
 assert.equal(paused.status,200);assert.equal(paused.data.service.status,'draft');
 assert.equal((await req(endpoint,'POST',{action:'pause'},{token:owner.token})).status,409);
 assert.equal((await req('/api/v1/items/'+sid)).status,404);
 assert.equal((await req('/api/v1/feed?type=service')).data.items.length,0);
 assert.equal((await req(`/api/v1/services/${sid}/slots?date=2099-10-18`)).status,404);
 assert.equal((await req('/api/v1/bookings','POST',{serviceId:sid,date:'2099-10-18',time:'11:00',remark:'不得再接新预约'},{token:stranger.token})).status,404);
 const bookingPath=`/api/v1/merchants/${mid}/bookings/${book.data.booking.id}/action`;
 assert.equal((await req(bookingPath,'POST',{action:'confirm'},{token:staff.token})).status,200,'pause must not erase existing customers');
 assert.equal((await req(bookingPath,'POST',{action:'complete'},{token:owner.token})).status,200);
 const again=await req(endpoint,'POST',{action:'resubmit'},{token:owner.token});assert.equal(again.status,200);
 assert.equal(again.data.service.status,'pending_review');assert.equal((await req('/api/v1/items/'+sid)).status,404);
 assert.equal((await req('/admin/api/queue','GET',undefined,credentials)).data.services.length,1);
 assert.equal((await req(endpoint,'POST',{action:'resubmit'},{token:owner.token})).status,409);
 assert.equal((await req('/admin/api/review-service','POST',{id:sid,status:'disabled'},credentials)).status,200);
 assert.equal((await req(endpoint,'POST',{action:'resubmit'},{token:owner.token})).status,409,'moderation disabled cannot be restored by merchant');
 assert.equal((await req('/api/v1/items/'+sid)).status,404);
});

test('V0.19: manager may pause; role revocation blocks service action; category closure blocks re-submission',async t=>{
 const {repo,req,login}=await setup(t);
 const owner=await login('v19-second-owner'),manager=await login('v19-manager');
 const application=await req('/api/v1/merchant-applications','POST',{name:'社区保洁工作室',category:'保洁',district:'中心街道'},{token:owner.token});
 const aid=application.data.application.id;
 await req(`/api/v1/merchant-applications/${aid}/evidence`,'POST',{registrationCode:'V19-LOCAL-ONLY-TEST',licenseHolder:'社区保洁工作室',evidenceReference:'v19-testing-reference'},{token:owner.token});
 const admin=await req('/admin/api/login','POST',{role:'superadmin',password:'v19-test-password'}),credentials={cookie:admin.cookie,csrf:admin.data.csrf};
 const m=await req('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'演示核验并非生产资质许可'},credentials);assert.equal(m.status,200);const mid=m.data.merchant.id;
 const sr=await req(`/api/v1/merchants/${mid}/services`,'POST',{title:'小时保洁服务',description:'测试按小时到家保洁预约',price:'面议'},{token:owner.token});const sid=sr.data.service.id;
 await req('/admin/api/review-service','POST',{id:sid,status:'published'},credentials);
 const target=`/api/v1/merchants/${mid}/services/${sid}/action`;
 assert.equal((await req(`/api/v1/merchants/${mid}/members`,'POST',{userId:manager.userId,role:'manager'},{token:owner.token})).status,200);
 assert.equal((await req(target,'POST',{action:'pause'},{token:manager.token})).status,200);
 assert.equal((await req(`/api/v1/merchants/${mid}/members/${manager.userId}/remove`,'POST',{}, {token:owner.token})).status,200);
 assert.equal((await req(target,'POST',{action:'resubmit'},{token:manager.token})).status,403);
 assert.ok(await repo.setCategoryEnabled('service',false));
 assert.equal((await req(target,'POST',{action:'resubmit'},{token:owner.token})).status,403);
 assert.equal((await req('/api/v1/items/'+sid)).status,404);
});

test('V0.19: PostgreSQL service transition contract uses membership guard and audit within transaction',()=>{
 // SQL contract only. Real PostgreSQL integration remains a separate release gate.
 const code=fs.readFileSync(path.resolve(__dirname,'../src/operations-pg.js'),'utf8');
 const method=code.match(/async changeMerchantServiceStatus\([^]*?\n  async myMerchantBookings/);
 assert.ok(method);
 assert.match(method[0],/mm\.user_id=\$1/);
 assert.match(method[0],/mm\.role IN \('owner','manager'\)/);
 assert.match(method[0],/s\.status=\$4/);
 assert.match(method[0],/admin_audit_events/);
 assert.match(method[0],/return wrap\(async c/);
 assert.equal(typeof pgOperations,'function');
 const pgRepo=fs.readFileSync(path.resolve(__dirname,'../src/pg-repository.js'),'utf8');
 assert.match(pgRepo,/s\.status='published' AND public_service_source_ok\(s\.id\) FOR SHARE OF s/,'new booking must lock service state against concurrent pause');
});
