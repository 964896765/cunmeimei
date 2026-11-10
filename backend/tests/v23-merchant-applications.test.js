'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMerchantApplication}=require('../src/merchant-application-pg');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');

function fakePool({existing=null,insertError=false}={}){
 const calls=[];
 const client={
  async query(sql,args){
   calls.push({sql,args});
   if(sql.startsWith('SELECT * FROM merchant_applications'))return {rows:existing?[existing]:[]};
   if(sql.startsWith('INSERT INTO merchant_applications')){
    if(insertError)throw Error('database insert failed');
    return {rows:[{id:'created-once',user_id:args[0],name:args[1],category:args[2],district:args[3]}]};
   }
   return {rows:[]};
  },
  release(){calls.push({sql:'RELEASE'});}
 };
 return {pool:{connect:async()=>client},calls};
}
const input={name:'中央街道维修店',category:'维修',district:'中心街道'};

test('V0.23 PostgreSQL transaction: locks user before searching/inserting',async()=>{
 const {pool,calls}=fakePool();
 const result=await createMerchantApplication(pool,'resident-one',input);
 assert.equal(result.id,'created-once');
 assert.equal(calls[0].sql,'BEGIN');
 assert.match(calls[1].sql,/pg_advisory_xact_lock/);
 assert.deepEqual(calls[1].args,['city-life-merchant-application:resident-one']);
 assert.match(calls[2].sql,/SELECT \* FROM merchant_applications/);
 assert.match(calls[3].sql,/INSERT INTO merchant_applications/);
 assert.equal(calls.at(-2).sql,'COMMIT');
 assert.equal(calls.at(-1).sql,'RELEASE');
});

test('V0.23 PostgreSQL transaction: existing pending submission is returned without an insert',async()=>{
 const {pool,calls}=fakePool({existing:{id:'already-pending',user_id:'resident-one'}});
 const result=await createMerchantApplication(pool,'resident-one',input,r=>({applicationId:r.id}));
 assert.deepEqual(result,{applicationId:'already-pending'});
 assert.equal(calls.some(x=>x.sql.startsWith('INSERT INTO merchant_applications')),false);
 assert.equal(calls.at(-2).sql,'COMMIT');
});

test('V0.23 PostgreSQL transaction: insertion failure rolls back and releases connection',async()=>{
 const {pool,calls}=fakePool({insertError:true});
 await assert.rejects(()=>createMerchantApplication(pool,'resident-one',input),/database insert failed/);
 assert.equal(calls.some(x=>x.sql==='COMMIT'),false);
 assert.equal(calls.at(-2).sql,'ROLLBACK');
 assert.equal(calls.at(-1).sql,'RELEASE');
});

test('V0.23 HTTP: rapid repeated merchant applications share one pending application',async t=>{
 const repo=createMemoryRepository();
 const app=createApp({repo,areas:['中心街道'],allowDevLogin:true});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>app.close(r)));
 const base=`http://127.0.0.1:${app.address().port}`;
 const login=await fetch(base+'/api/v1/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({devUser:'v23-resident'})});
 assert.equal(login.status,200);
 const {token}=await login.json();
 const post=()=>fetch(base+'/api/v1/merchant-applications',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(input)});
 const responses=await Promise.all(Array.from({length:12},()=>post()));
 assert.ok(responses.every(r=>r.status===201));
 const applications=await Promise.all(responses.map(async r=>(await r.json()).application));
 assert.equal(new Set(applications.map(x=>x.id)).size,1);
 const my=await fetch(base+'/api/v1/me/merchant-application',{headers:{Authorization:'Bearer '+token}});
 assert.equal((await my.json()).application.id,applications[0].id);
});
