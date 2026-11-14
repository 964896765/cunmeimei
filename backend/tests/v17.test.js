'use strict';
const {acceptedConsent}=require('./helpers/publication-confirmation');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {isValidSlotInstant,isBookableSlot} = require('../src/booking-window');
const {createMemoryRepository} = require('../src/memory-repository');
const {createApp} = require('../src/server');
const SLOT='2099-11-01T02:00:00.000Z'; // China local 10:00
const START=Date.parse('2099-11-01T01:40:00.000Z'); // 20 minutes before appointment

test('V0.17 repository recognizes only valid Beijing-local whole-hour appointment slots',()=>{
 assert.equal(isValidSlotInstant(SLOT),true);
 assert.equal(isValidSlotInstant('2099-11-01T02:15:00.000Z'),false);
 assert.equal(isValidSlotInstant('2099-11-01T21:00:00.000Z'),false);
 assert.equal(isValidSlotInstant('2099-02-30T02:00:00.000Z'),false);
 assert.equal(isValidSlotInstant('2099-11-01 10:00:00'),false);
 assert.equal(isBookableSlot(SLOT,START),true);
 assert.equal(isBookableSlot(SLOT,START+10*60000),false,'minimum lead time strictly greater than ten minutes');
});

test('V0.17 booking retry survives lead-time cutoff but new claims are rejected',async()=>{
 const repo=createMemoryRepository();await repo.seedRegions(['中心街道']);
 const svc=await repo.addTestService({title:'上门清洁',description:'预约边界',district:'中心街道',price:'100'});
 const first=await repo.upsertIdentity('dev_local','v17-first');
 const second=await repo.upsertIdentity('dev_local','v17-second');
 const original=Date.now;
 try{
  Date.now=()=>START;
  const claimed=await repo.createBooking(first,{serviceId:svc.id,requestedAt:SLOT,remark:'第一次提交'});
  assert.ok(claimed.id);
  Date.now=()=>START+12*60000;
  const retry=await repo.createBooking(first,{serviceId:svc.id,requestedAt:SLOT,remark:'网络重试'});
  assert.equal(retry.replayed,true);assert.equal(retry.id,claimed.id);
  assert.deepEqual(await repo.createBooking(second,{serviceId:svc.id,requestedAt:SLOT,remark:'新用户'}),{error:'slot_expired'});
  assert.equal(await repo.cancelBooking(first,claimed.id),true);
  assert.deepEqual(await repo.createBooking(second,{serviceId:svc.id,requestedAt:SLOT,remark:'已取消但是太晚'}),{error:'slot_expired'});
 }finally{Date.now=original;}
});

test('V0.17 HTTP response reports a slot becoming invalid after initial request validation',async t=>{
 const repo=createMemoryRepository();await repo.seedRegions(['中心街道']);
 const svc=await repo.addTestService({title:'家电检修',description:'并发模拟服务',district:'中心街道',price:'200'});
 const originalNow=Date.now;Date.now=()=>START;
 t.after(()=>{Date.now=originalNow;});
 const originalCreate=repo.createBooking.bind(repo);
 repo.createBooking=async(uid,v)=>{Date.now=()=>START+12*60000;return originalCreate(uid,v);};
 const server=createApp({repo,areas:['中心街道'],allowDevLogin:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const login=await fetch(base+'/api/v1/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({devUser:'v17-http'})});
 assert.equal(login.status,200);const token=(await login.json()).token;
 const response=await fetch(base+'/api/v1/bookings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({serviceId:svc.id,date:'2099-11-01',time:'10:00',remark:'等待后过期'})});
 assert.equal(response.status,409);assert.equal((await response.json()).error,'SLOT_EXPIRED');
 assert.equal((await repo.myBookings((await repo.upsertIdentity('dev_local','v17-http')))).length,0);
});

test('V0.17 merchant cannot confirm a pending appointment after its scheduled start',async()=>{
 const repo=createMemoryRepository();await repo.seedRegions(['中心街道']);
 const owner=await repo.upsertIdentity('dev_local','v17-owner');
 const visitor=await repo.upsertIdentity('dev_local','v17-visitor');
 const application=await repo.createMerchant(owner,{name:'按时服务店',category:'家政',district:'中心街道'});
 await repo.submitMerchantEvidence(owner,application.id,{registrationCode:'TEST-CONTRACT-CODE',licenseHolder:'模拟公司',evidenceReference:'offline-only-v17'});
 const merchant=await repo.approveMerchantApplication(application.id,'人工离线核验测试',true);
 assert.ok(merchant.id);
 const svc=await repo.createMerchantService(owner,merchant.id,{publicationConsent:acceptedConsent(),publicationConsent:require('./helpers/publication-confirmation').acceptedConsent(),title:'上门清洁预约',description:'预约确认的时间边界验证',price:'100'});
 assert.equal(await repo.reviewService(svc.id,'published'),true);
 const original=Date.now;try{
  Date.now=()=>START;
  const booked=await repo.createBooking(visitor,{serviceId:svc.id,requestedAt:SLOT,remark:'到点前等待商家'});
  assert.ok(booked.id);
  Date.now=()=>START+21*60000; // 10:01 China time, but 30-minute hold has not expired
  assert.equal(await repo.actOnMerchantBooking(owner,merchant.id,booked.id,'confirm'),false);
  assert.equal((await repo.myBookings(visitor)).find(x=>x.id===booked.id).status,'pending_confirm');
 }finally{Date.now=original;}
});

test('V0.17 PostgreSQL implementation contains database-time final gate, safe replay and late confirmation guard',()=>{
 const pg=fs.readFileSync(path.join(__dirname,'../src/pg-repository.js'),'utf8');
 const ops=fs.readFileSync(path.join(__dirname,'../src/operations-pg.js'),'utf8');
 assert.match(pg,/\$3::timestamptz > clock_timestamp\(\)\+interval '10 minutes'/);
 assert.match(pg,/b\.hold_expires_at>clock_timestamp\(\)/);
 assert.match(ops,/\$4<>'confirmed' OR b\.requested_at>clock_timestamp\(\)/);
 assert.ok(require('../src/schema-migrations').manifest().length>=5);
});
