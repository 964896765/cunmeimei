'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCapacity}=require('../src/upload-capacity');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');

test('capacity rejects excess work without running it and releases on success or error',async()=>{
 const run=createCapacity(1);let release,ran=false;
 const first=run(()=>new Promise(resolve=>{release=resolve;}));
 await assert.rejects(run(()=>{ran=true;}),{code:'UPLOAD_BUSY',status:503});
 assert.equal(ran,false);release('done');assert.equal(await first,'done');
 await assert.rejects(run(()=>{throw Error('decode failed');}),/decode failed/);
 assert.equal(await run(()=>42),42);
});

test('HTTP upload capacity spans applications, leaves health available and recovers after failure',async t=>{
 const sharp=require('sharp');
 const bytes=await sharp({create:{width:24,height:24,channels:3,background:'white'}}).png().toBuffer();
 const pending=[],apps=[];let completed=0;
 for(let i=0;i<2;i++){
  const repo=createMemoryRepository();
  repo.uploadContentImage=()=>new Promise((resolve,reject)=>pending.push({resolve:()=>{completed++;resolve({id:'local-test-image'});},reject}));
  const app=createApp({repo,areas:['中心街道'],allowDevLogin:true});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  apps.push(app);t.after(()=>new Promise(resolve=>app.close(resolve)));
 }
 const bases=apps.map(app=>'http://127.0.0.1:'+app.address().port);
 const tokens=await Promise.all(bases.map(async base=>(await (await fetch(base+'/api/v1/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({devUser:'upload-capacity-test'})})).json()).token));
 const upload=i=>fetch(bases[i]+'/api/v1/media',{method:'POST',headers:{Authorization:'Bearer '+tokens[i],'Content-Type':'image/png'},body:bytes});
 async function waitFor(n){for(let i=0;i<100&&pending.length<n;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(pending.length,n);}
 const first=upload(0),second=upload(1);
 try{
  await waitFor(2);
  const rejected=await upload(1);assert.equal(rejected.status,503);assert.equal((await rejected.json()).error,'UPLOAD_BUSY');
  assert.equal(pending.length,2);assert.equal((await fetch(bases[0]+'/api/v1/health')).status,200);
  pending[0].reject(new (require('../src/rules').ApiError)(400,'INVALID_IMAGE','无效图片'));
  assert.equal((await first).status,400);
  const retry=upload(0);await waitFor(3);pending[2].resolve();assert.equal((await retry).status,201);
  pending[1].resolve();assert.equal((await second).status,201);assert.equal(completed,2);
 }finally{for(const job of pending)job.resolve();await Promise.allSettled([first,second]);}
});
