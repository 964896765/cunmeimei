'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');
const {pgOperations}=require('../src/operations-pg');

async function fixture(t){
 const repo=createMemoryRepository();
 const app=createApp({repo,areas:['中心街道'],allowDevLogin:true,superAdminPassword:'v20-test-admin-password'});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base=`http://127.0.0.1:${app.address().port}`;
 async function req(route,method='GET',data,credentials={}){
  const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(credentials.token?{Authorization:'Bearer '+credentials.token}:{}),...(credentials.cookie?{Cookie:credentials.cookie}:{}),...(credentials.csrf?{'X-CSRF-Token':credentials.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 async function login(id){const res=await req('/api/v1/dev/login','POST',{devUser:id});assert.equal(res.status,200);return res.data;}
 return {repo,req,login};
}

test('V0.20 HTTP: revoked staff cannot confirm or complete booking; owner can finish',async t=>{
 const {req,login}=await fixture(t);
 const owner=await login('v20-owner'),staff=await login('v20-staff'),customer=await login('v20-customer');
 const a=await req('/api/v1/merchant-applications','POST',{name:'V20本地维修站',category:'上门维修',district:'中心街道'},{token:owner.token});
 assert.equal(a.status,201);
 const aid=a.data.application.id;
 assert.equal((await req(`/api/v1/merchant-applications/${aid}/evidence`,'POST',{registrationCode:'V20-TEST-OFFLINE-123',licenseHolder:'V20本地维修站',evidenceReference:'manual-only-no-real-credentials'},{token:owner.token})).status,200);
 const adm=await req('/admin/api/login','POST',{role:'superadmin',password:'v20-test-admin-password'});
 assert.equal(adm.status,200);
 const admin={cookie:adm.cookie,csrf:adm.data.csrf};
 const mr=await req('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'仅测试账号的模拟人工核验'},admin);
 assert.equal(mr.status,200);const mid=mr.data.merchant.id;
 const service=await req(`/api/v1/merchants/${mid}/services`,'POST',{title:'测试维修预约服务',description:'用于检查撤销员工权限后的订单操作权限',price:'¥50'},{token:owner.token});
 assert.equal(service.status,201);
 const sid=service.data.service.id;
 assert.equal((await req('/admin/api/review-service','POST',{id:sid,status:'published'},admin)).status,200);
 const booked=await req('/api/v1/bookings','POST',{serviceId:sid,date:'2099-12-01',time:'10:00',remark:'测试无真实收费'},{token:customer.token});
 assert.equal(booked.status,201);const bid=booked.data.booking.id;
 assert.equal((await req(`/api/v1/merchants/${mid}/members`,'POST',{userId:staff.userId,role:'staff'},{token:owner.token})).status,200);
 const endpoint=`/api/v1/merchants/${mid}/bookings/${bid}/action`;
 assert.equal((await req(`/api/v1/merchants/${mid}/members/${staff.userId}/remove`,'POST',{}, {token:owner.token})).status,200);
 assert.equal((await req(endpoint,'POST',{action:'confirm'},{token:staff.token})).status,403);
 assert.equal((await req(`/api/v1/merchants/${mid}/bookings`,'GET',undefined,{token:staff.token})).status,403);
 assert.equal((await req(endpoint,'POST',{action:'confirm'},{token:owner.token})).status,200);
 assert.equal((await req(endpoint,'POST',{action:'complete'},{token:staff.token})).status,403);
 assert.equal((await req(endpoint,'POST',{action:'complete'},{token:owner.token})).status,200);
 const own=(await req('/api/v1/me/bookings','GET',undefined,{token:customer.token}));
 assert.equal(own.data.items.find(x=>x.id===bid).status,'completed');
});

function fakePool(rights){
 const calls=[];
 const conn={async query(sql,args){
  calls.push({sql,args});
  if(sql.includes('SELECT mm.role'))return {rows:rights?[{role:'staff'}]:[]};
  if(sql.includes('RETURNING b.*'))return {rows:[{id:'sample-booking',status:'confirmed',user_id:'customer'}]};
  if(sql.includes('RETURNING *')&&sql.includes('INSERT INTO service_catalog'))return {rows:[{id:'service',merchant_id:'merchant',status:'pending_review'}]};
  return {rows:[]};
 },release(){calls.push({sql:'RELEASE'});}};
 return {pool:{async connect(){return conn;}},calls};
}

test('V0.20 PostgreSQL transaction contract: revoked booking actor performs no UPDATE',async()=>{
 const {pool,calls}=fakePool(false);
 const op=pgOperations(pool);
 const result=await op.actOnMerchantBooking('revoked-uid','merchant','booking','confirm');
 assert.equal(result,null);
 assert.equal(calls[0].sql,'BEGIN');
 assert.match(calls[1].sql,/FOR SHARE OF mm, vm/);
 assert.ok(calls.every(x=>!x.sql.includes('UPDATE booking_requests')));
 assert.ok(calls.some(x=>x.sql==='COMMIT'));
 assert.equal(calls.at(-1).sql,'RELEASE');
});

test('V0.20 PostgreSQL transaction contract: authorized staff checks permission before booking write',async()=>{
 const {pool,calls}=fakePool(true);
 const op=pgOperations(pool);
 const result=await op.actOnMerchantBooking('staff','merchant','booking','confirm');
 assert.equal(result.status,'confirmed');
 assert.equal(calls[0].sql,'BEGIN');
 assert.match(calls[1].sql,/FOR SHARE OF mm, vm/);
 const firstUpdate=calls.findIndex(x=>x.sql.includes('UPDATE booking_requests'));
 assert.ok(firstUpdate>1);
 assert.ok(calls.slice(0,firstUpdate).some(x=>x.sql.includes('mm.status=\'active\'')));
 assert.ok(calls.some(x=>x.sql==='COMMIT'));
});

test('V0.20 PostgreSQL transaction contract: revoked manager cannot create new service',async()=>{
 const {pool,calls}=fakePool(false);
 const result=await pgOperations(pool).createMerchantService('revoked','merchant',{title:'测试',description:'描述',price:'30'});
 assert.equal(result,null);
 assert.match(calls[1].sql,/mm.role IN \('owner','manager'\)/);
 assert.ok(!calls.some(x=>x.sql.includes('INSERT INTO service_catalog')));
});
