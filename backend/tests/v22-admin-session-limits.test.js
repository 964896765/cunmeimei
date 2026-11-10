'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAdminLoginLimiter,pruneExpired}=require('../src/admin-login-limiter');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');

test('V0.22: five bad passwords lock only until the original 15-minute window expires',()=>{
 let now=1000;
 const limiter=createAdminLoginLimiter({maxFailures:5,windowMs:900000,clock:()=>now});
 for(let i=0;i<5;i++){
  assert.equal(limiter.blocked('127.0.0.1'),false);
  limiter.failure('127.0.0.1');
 }
 assert.equal(limiter.blocked('127.0.0.1'),true);
 now+=900001;
 assert.equal(limiter.blocked('127.0.0.1'),false);
 limiter.failure('127.0.0.1');
 // Regression: the first typo after lock expiration must NOT re-lock immediately.
 assert.equal(limiter.blocked('127.0.0.1'),false);
 limiter.success('127.0.0.1');
 assert.equal(limiter.blocked('127.0.0.1'),false);
});

test('V0.22: failed-login map is bounded and expired addresses are evicted',()=>{
 let now=1000;
 const limiter=createAdminLoginLimiter({maxFailures:3,windowMs:1000,maxKeys:2,clock:()=>now});
 limiter.failure('a');limiter.failure('b');
 assert.equal(limiter.blocked('c'),true);
 assert.equal(limiter.failure('c'),false);
 now+=1001;
 assert.equal(limiter.blocked('c'),false);
 limiter.failure('c');
 assert.equal(limiter.blocked('c'),false);
});

test('V0.22: an exactly-full 2,000-IP login window can recover after expiry',()=>{
 const ipAttempts=new Map();
 for(let i=0;i<2000;i++)ipAttempts.set('ip-'+i,{count:1,until:1000});
 pruneExpired(ipAttempts,'until',1001,2000);
 assert.equal(ipAttempts.size,0,'exact capacity must also be pruned');
});

test('V0.22: idle session and upload-counter entries are pruned only after expiry',()=>{
 const store=new Map([['old',{exp:5}],['valid',{exp:15}]]);
 pruneExpired(store,'exp',10,1);
 assert.equal(store.has('old'),false);
 assert.equal(store.has('valid'),true);
});

test('V0.22 HTTP: bad password lock, active session, CSRF and logout',async t=>{
 const repo=createMemoryRepository();
 const app=createApp({repo,areas:['中心街道'],adminPassword:'v22-long-offline-admin-password'});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base=`http://127.0.0.1:${app.address().port}`;
 const login=async password=>{
  const r=await fetch(base+'/admin/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};
 };
 const okay=await login('v22-long-offline-admin-password');
 assert.equal(okay.status,200);
 const cookie=okay.cookie.split(';')[0];
 let r=await fetch(base+'/admin/api/session',{headers:{Cookie:cookie}});
 assert.equal(r.status,200);
 r=await fetch(base+'/admin/api/logout',{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':okay.body.csrf}});
 assert.equal(r.status,200);
 r=await fetch(base+'/admin/api/session',{headers:{Cookie:cookie}});
 assert.equal(r.status,401);
 for(let i=0;i<5;i++)assert.equal((await login('wrong')).status,401);
 const blocked=await login('v22-long-offline-admin-password');
 assert.equal(blocked.status,429);
 assert.equal(blocked.body.error,'TOO_MANY_ATTEMPTS');
});
