'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');

async function setup(t){
 const repo=createMemoryRepository();await repo.seedRegions(['中心街道']);
 const server=createApp({repo,areas:['中心街道'],allowDevLogin:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function api(route,method='GET',data,token){
  const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:r.status,data:await r.json()};
 }
 async function login(name){const r=await api('/api/v1/dev/login','POST',{devUser:name});assert.equal(r.status,200);return r.data.token;}
 return {repo,api,login};
}

test('V0.16 duplicate requests from same account return the same booking, but other accounts cannot claim the slot',async t=>{
 const {repo,api,login}=await setup(t);
 const a=await login('test-booking-a'),b=await login('test-booking-b');
 const svc=await repo.addTestService({title:'家庭清洁',description:'模拟商家服务',district:'中心街道',price:'100'});
 const body={serviceId:svc.id,date:'2099-11-01',time:'11:00',remark:'请提前联系'};
 const first=await api('/api/v1/bookings','POST',body,a);
 assert.equal(first.status,201);assert.equal(first.data.replayed,false);
 const retried=await api('/api/v1/bookings','POST',body,a);
 assert.equal(retried.status,200);assert.equal(retried.data.replayed,true);
 assert.equal(retried.data.booking.id,first.data.booking.id);
 assert.equal(retried.data.booking.userId,first.data.booking.userId);
 const thirdParty=await api('/api/v1/bookings','POST',body,b);
 assert.equal(thirdParty.status,409);assert.equal(thirdParty.data.error,'SLOT_TAKEN');
 assert.equal(JSON.stringify(thirdParty.data).includes(first.data.booking.id),false,'must not disclose another account booking ID');
 assert.equal((await api('/api/v1/me/bookings','GET',undefined,a)).data.items.length,1);
 assert.equal((await api('/api/v1/bookings/'+first.data.booking.id+'/cancel','POST',{},a)).status,200);
 const availableAgain=await api('/api/v1/bookings','POST',body,b);
 assert.equal(availableAgain.status,201);assert.notEqual(availableAgain.data.booking.id,first.data.booking.id);
});

test('V0.16 expired hold cannot be cancelled and is not replayed as active',async t=>{
 const {repo,api,login}=await setup(t);const token=await login('test-expiration');
 const svc=await repo.addTestService({title:'家庭维修',description:'服务超时测试',district:'中心街道',price:'50'});
 const params={serviceId:svc.id,date:'2099-11-01',time:'13:00'};
 const first=await api('/api/v1/bookings','POST',params,token);assert.equal(first.status,201);
 const before=Date.now;
 try {
  Date.now=()=>before()+31*60*1000;
  const cancel=await api('/api/v1/bookings/'+first.data.booking.id+'/cancel','POST',{},token);
  assert.equal(cancel.status,409);
  const again=await api('/api/v1/bookings','POST',params,token);
  assert.equal(again.status,201);assert.equal(again.data.replayed,false);
  assert.notEqual(again.data.booking.id,first.data.booking.id);
  const items=(await api('/api/v1/me/bookings','GET',undefined,token)).data.items;
  assert.equal(items.find(x=>x.id===first.data.booking.id).status,'expired');
 }finally{Date.now=before;}
});

test('V0.16 repository PG concurrency path reuses held connection and remains migration-neutral',()=>{
 const file=fs.readFileSync(path.join(__dirname,'../src/pg-repository.js'),'utf8');
 assert.match(file,/if\(e\.code==='23505'&&e\.constraint==='uq_booking_active_slot'\)/);
 assert.match(file,/const previous=\(await c\.query\(/);
 assert.match(file,/hold_expires_at>now\(\) RETURNING id/);
 assert.ok(require('../src/schema-migrations').manifest().length>=5);
});
