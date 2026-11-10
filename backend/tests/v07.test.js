'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');
const {validateDeployment}=require('../src/deployment-check');
const root=path.resolve(__dirname,'../..');
async function serverSetup(t){
 const repo=createMemoryRepository();let ready=true;
 const server=createApp({repo:{...repo,async ping(){if(!ready)throw Error('database offline');return true;}},areas:['中心街道'],adminPassword:'long-test-admin-secret',allowDevLogin:true});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 t.after(()=>new Promise(done=>server.close(done)));
 const base='http://127.0.0.1:'+server.address().port;
 const call=async(route,{method='GET',body,token,cookie,csrf}={})=>{
  const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
 };
 return {call,offline:()=>{ready=false;}};
}
test('logout revokes only current user token and rejects replay',async t=>{
 const {call}=await serverSetup(t);
 const a=(await call('/api/v1/dev/login',{method:'POST',body:{devUser:'same-user'}})).data;
 const b=(await call('/api/v1/dev/login',{method:'POST',body:{devUser:'same-user'}})).data;
 assert.equal(a.userId,b.userId);
 assert.equal((await call('/api/v1/me',{token:a.token})).status,200);
 assert.equal((await call('/api/v1/auth/logout',{method:'POST',body:{},token:a.token})).status,200);
 assert.equal((await call('/api/v1/me',{token:a.token})).status,401);
 assert.equal((await call('/api/v1/auth/logout',{method:'POST',body:{},token:a.token})).status,401);
 assert.equal((await call('/api/v1/me',{token:b.token})).status,200);
});
test('admin logout requires CSRF and invalidates admin cookie',async t=>{
 const {call}=await serverSetup(t);
 const login=await call('/admin/api/login',{method:'POST',body:{password:'long-test-admin-secret'}});
 assert.equal(login.status,200);
 const args={method:'POST',body:{},cookie:login.cookie};
 assert.equal((await call('/admin/api/logout',args)).status,403);
 assert.equal((await call('/admin/api/logout',{...args,csrf:login.data.csrf})).status,200);
 assert.equal((await call('/admin/api/session',{cookie:login.cookie})).status,401);
});
test('liveness is independent from database readiness',async t=>{
 const {call,offline}=await serverSetup(t);
 assert.deepEqual((await call('/api/v1/ready')).data,{ready:true});
 offline();
 assert.equal((await call('/api/v1/health')).status,200);
 const result=await call('/api/v1/ready');
 assert.equal(result.status,503);assert.equal(result.data.error,'DEPENDENCY_UNAVAILABLE');
});
test('deployment gate blocks unsafe production and accepts correctly structured config',()=>{
 const unsafe={NODE_ENV:'production',DATA_DRIVER:'memory',ALLOW_DEV_LOGIN:'true',SERVICE_AREAS:'中心街道'};
 const report=validateDeployment(unsafe,root);
 assert.equal(report.ok,false);
 assert.ok(report.errors.includes('PROD_POSTGRES_REQUIRED'));
 assert.ok(report.errors.includes('PRIVATE_STORAGE_ABSOLUTE_PATH_REQUIRED'));
 const safe={PHONE_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),PLATFORM_OPERATOR_NAME:'Isolated operator',PRIVACY_CONTACT_EMAIL:'privacy@example.test',NODE_ENV:'production',DATA_DRIVER:'postgres',DATABASE_URL:'postgres://api:fixture@localhost/citylife',ALLOW_DEV_LOGIN:'false',WECHAT_APPID:'wx1234567890abcdef',WECHAT_SECRET:'server-side-secret-value',ADMIN_PASSWORD:'very-long-admin-password',SERVICE_AREAS:'东城街道',PRIVATE_UPLOAD_DIR:'/var/lib/city-life-private'};
 assert.deepEqual(validateDeployment(safe,root),{ok:true,errors:[]});
 for(const DATABASE_URL of ['', 'not-a-url', 'https://database.example/citylife', 'postgres://localhost/', 'postgres://localhost/citylife#fragment']){
  assert.ok(validateDeployment({...safe,DATABASE_URL},root).errors.includes('DATABASE_URL_REQUIRED'));
 }
 assert.deepEqual(validateDeployment({NODE_ENV:'development',DATA_DRIVER:'memory'},root),{ok:true,errors:[]});
});
