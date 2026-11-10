'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pgOperations}=require('../src/operations-pg');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');

function fakePool({authorized=true,hasService=true,auditFailure=false}={}){
 const calls=[];
 const client={async query(sql,args){
  calls.push({sql,args});
  if(sql.includes('SELECT mm.role'))return {rows:authorized?[{role:'manager'}]:[]};
  if(sql.includes('UPDATE service_catalog'))return {rows:hasService?[{id:'service-id',merchant_id:'shop',status:args[2]}]:[]};
  if(auditFailure&&sql.includes('INSERT INTO admin_audit_events'))throw new Error('audit unavailable');
  return {rows:[]};
 },release(){calls.push({sql:'RELEASE'});}};
 return {pool:{connect:async()=>client},calls};
}

test('V0.21: revoked manager cannot pause/resubmit service or write audit',async()=>{
 for(const action of ['pause','resubmit']){
  const {pool,calls}=fakePool({authorized:false});
  const actual=await pgOperations(pool).changeMerchantServiceStatus('removed-manager','shop','service-id',action);
  assert.equal(actual,null);
  assert.equal(calls[0].sql,'BEGIN');
  assert.match(calls[1].sql,/FOR SHARE OF mm, vm/);
  assert.match(calls[1].sql,/mm\.status='active'/);
  assert.equal(calls.some(c=>c.sql.includes('UPDATE service_catalog')),false);
  assert.equal(calls.some(c=>c.sql.includes('INSERT INTO admin_audit_events')),false);
  assert.ok(calls.some(c=>c.sql==='COMMIT'));
  assert.equal(calls.at(-1).sql,'RELEASE');
 }
});

test('V0.21: authorized manager locks membership before changing service state',async()=>{
 for(const [action,expectedStatus,expectedOrigin] of [
  ['pause','draft','published'],['resubmit','pending_review','draft']]){
  const {pool,calls}=fakePool();
  const result=await pgOperations(pool).changeMerchantServiceStatus('manager','shop','service-id',action);
  assert.equal(result.status,expectedStatus);
  const lockIndex=calls.findIndex(c=>c.sql.includes('SELECT mm.role'));
  const updateIndex=calls.findIndex(c=>c.sql.includes('UPDATE service_catalog'));
  const auditIndex=calls.findIndex(c=>c.sql.includes('INSERT INTO admin_audit_events'));
  assert.ok(lockIndex>0 && updateIndex>lockIndex && auditIndex>updateIndex);
  assert.equal(calls[updateIndex].args[3],expectedOrigin);
  assert.equal(calls[updateIndex].args[2],expectedStatus);
  assert.ok(calls.some(c=>c.sql==='COMMIT'));
 }
});

test('V0.21: stale or platform-disabled service cannot be revived or audited',async()=>{
 const {pool,calls}=fakePool({hasService:false});
 assert.equal(await pgOperations(pool).changeMerchantServiceStatus('manager','shop','service-id','resubmit'),false);
 assert.equal(calls.some(c=>c.sql.includes('INSERT INTO admin_audit_events')),false);
});

test('V0.21: failure to audit service transition rolls back transaction',async()=>{
 const {pool,calls}=fakePool({auditFailure:true});
 await assert.rejects(()=>pgOperations(pool).changeMerchantServiceStatus('manager','shop','service-id','pause'),/audit unavailable/);
 assert.ok(calls.some(c=>c.sql==='ROLLBACK'));
 assert.ok(!calls.some(c=>c.sql==='COMMIT'));
 assert.equal(calls.at(-1).sql,'RELEASE');
});

// HTTP regression checks role revocation through the API rather than a direct repository call.
test('V0.21 HTTP: role revocation takes effect before service resubmission',async t=>{
 const repo=createMemoryRepository();
 const app=createApp({repo,areas:['中心街道'],allowDevLogin:true,adminPassword:'v21-offline-admin-password'});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base=`http://127.0.0.1:${app.address().port}`;
 async function req(route,method='GET',data,credentials={}){
  const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(credentials.token?{Authorization:'Bearer '+credentials.token}:{}),...(credentials.cookie?{Cookie:credentials.cookie}:{}),...(credentials.csrf?{'X-CSRF-Token':credentials.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 async function login(n){const r=await req('/api/v1/dev/login','POST',{devUser:n});assert.equal(r.status,200);return r.data;}
 const owner=await login('v21-owner'),manager=await login('v21-manager');
 const application=await req('/api/v1/merchant-applications','POST',{name:'本地家电维修',category:'维修',district:'中心街道'},{token:owner.token});
 assert.equal(application.status,201);const aid=application.data.application.id;
 assert.equal((await req(`/api/v1/merchant-applications/${aid}/evidence`,'POST',{registrationCode:'LOCAL-V21-TEST-001',licenseHolder:'本地家电维修',evidenceReference:'offline-test-only'},{token:owner.token})).status,200);
 const adminLogin=await req('/admin/api/login','POST',{password:'v21-offline-admin-password'}),admin={cookie:adminLogin.cookie,csrf:adminLogin.data.csrf};
 const accepted=await req('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'仅用于离线权限测试'},admin);
 assert.equal(accepted.status,200);const mid=accepted.data.merchant.id;
 const created=await req(`/api/v1/merchants/${mid}/services`,'POST',{title:'家电维修预约',description:'验证撤销经理角色后不能重新发布服务',price:'50'},{token:owner.token});
 assert.equal(created.status,201);const sid=created.data.service.id;
 assert.equal((await req('/admin/api/review-service','POST',{id:sid,status:'published'},admin)).status,200);
 assert.equal((await req(`/api/v1/merchants/${mid}/members`,'POST',{userId:manager.userId,role:'manager'},{token:owner.token})).status,200);
 const route=`/api/v1/merchants/${mid}/services/${sid}/action`;
 assert.equal((await req(route,'POST',{action:'pause'},{token:manager.token})).status,200);
 assert.equal((await req(`/api/v1/merchants/${mid}/members/${manager.userId}/remove`,'POST',{}, {token:owner.token})).status,200);
 assert.equal((await req(route,'POST',{action:'resubmit'},{token:manager.token})).status,403);
 assert.equal((await req(route,'POST',{action:'resubmit'},{token:owner.token})).status,200);
 assert.equal((await req('/api/v1/items/'+sid)).status,404,'awaiting approval is not public');
});
