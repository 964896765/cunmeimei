'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const os=require('node:os'),fs=require('node:fs/promises'),path=require('node:path');
const {createApp}=require('../src/server');const {createMemoryRepository}=require('../src/memory-repository');
const {verifyImage,LIMIT}=require('../src/private-license');
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
async function start(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'city-life-license-'));const repo=createMemoryRepository();const server=createApp({repo,areas:['中心街道'],allowDevLogin:true,adminPassword:'passphrase-for-tests',privateUploadDir:dir});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});const base=`http://127.0.0.1:${server.address().port}`;
 async function request(route,{method='GET',data,token,cookie,csrf,raw=false,type='application/json'}={}){const res=await fetch(base+route,{method,headers:{'Content-Type':type,...(token?{Authorization:`Bearer ${token}`}:{ }),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:data===undefined?undefined:raw?data:JSON.stringify(data)});let parsed;if(res.headers.get('content-type')?.includes('application/json'))parsed=await res.json();else parsed=Buffer.from(await res.arrayBuffer());return {status:res.status,data:parsed,cookie:res.headers.get('set-cookie')?.split(';')[0]};}
 async function auth(name){const x=await request('/api/v1/dev/login',{method:'POST',data:{devUser:name}});assert.equal(x.status,200);return x.data;}
 return {request,auth,repo,dir};}
test('Private license requires ownership, correct MIME/bytes, admin auth; replaced blob unavailable',async t=>{
 const {request,auth,dir}=await start(t);const owner=await auth('owner'),stranger=await auth('stranger');
 const created=await request('/api/v1/merchant-applications',{method:'POST',token:owner.token,data:{name:'邻里服务馆',category:'服务',district:'中心街道'}});const aid=created.data.application.id;const route=`/api/v1/merchant-applications/${aid}/license`;
 assert.equal((await request(route,{method:'POST',token:stranger.token,data:png,raw:true,type:'image/png'})).status,403);
 assert.equal((await request(route,{method:'POST',data:png,raw:true,type:'image/png'})).status,401);
 assert.equal((await request(route,{method:'POST',token:owner.token,data:Buffer.alloc(LIMIT+1),raw:true,type:'image/png'})).status,413);
 assert.equal((await request(route,{method:'POST',token:owner.token,data:Buffer.from('this is not an image'),raw:true,type:'image/png'})).status,400);
 assert.equal((await request(route,{method:'POST',token:owner.token,data:png,raw:true,type:'image/jpeg'})).status,415);
 const saved=await request(route,{method:'POST',token:owner.token,data:png,raw:true,type:'image/png'});assert.equal(saved.status,201);const fileId=saved.data.file.id;
 assert.deepEqual(await fs.readFile(path.join(dir,fileId+'.blob')),png);
 assert.equal((await request('/api/v1/merchant-applications/'+aid+'/license',{method:'GET',token:owner.token})).status,404);
 const download='/admin/api/licenses/'+fileId;assert.equal((await request(download)).status,401);assert.equal((await request(download,{token:owner.token})).status,401);
 const admin=await request('/admin/api/login',{method:'POST',data:{password:'passphrase-for-tests'}});const dl=await request(download,{cookie:admin.cookie});assert.equal(dl.status,200);assert.deepEqual(dl.data,png);
 const newFile=await request(route,{method:'POST',token:owner.token,data:png,raw:true,type:'image/png'});assert.equal(newFile.status,201);
 assert.equal((await request(download,{cookie:admin.cookie})).status,404,'old file no longer downloadable');
 await assert.rejects(fs.access(path.join(dir,fileId+'.blob')));
 assert.equal((await request('/admin/api/licenses/'+newFile.data.file.id,{cookie:admin.cookie})).status,200);
});
test('One booking per service slot, cancelled releases, different time remains open, invalid times rejected',async t=>{
 const {request,auth,repo}=await start(t);const first=await auth('first'),second=await auth('second');const s=await repo.addTestService({title:'家政服务',description:'实际预约测试服务',district:'中心街道',price:'100'});
 const slot=`/api/v1/services/${s.id}/slots?date=2099-11-01`;const availability=await request(slot);assert.equal(availability.status,200);assert.equal(availability.data.slots.length,10);assert.equal(availability.data.slots.find(x=>x.time==='10:00').available,true);
 const input={serviceId:s.id,date:'2099-11-01',time:'10:00',remark:'测试'};
 assert.equal((await request('/api/v1/bookings',{method:'POST',token:first.token,data:{...input,time:'10:15'}})).status,400);
 const a=await request('/api/v1/bookings',{method:'POST',token:first.token,data:input});assert.equal(a.status,201);assert.ok(a.data.booking.holdExpiresAt);
 const duplicate=await request('/api/v1/bookings',{method:'POST',token:second.token,data:input});assert.equal(duplicate.status,409);assert.equal(duplicate.data.error,'SLOT_TAKEN');
 assert.equal((await request(slot)).data.slots.find(x=>x.time==='10:00').available,false);
 assert.equal((await request('/api/v1/bookings',{method:'POST',token:second.token,data:{...input,time:'11:00'}})).status,201);
 assert.equal((await request('/api/v1/bookings/'+a.data.booking.id+'/cancel',{method:'POST',token:first.token,data:{}})).status,200);
 assert.equal((await request(slot)).data.slots.find(x=>x.time==='10:00').available,true);
 assert.equal((await request('/api/v1/bookings',{method:'POST',token:second.token,data:input})).status,201);
});
test('expired pending booking releases slot when another request arrives',async t=>{
 const {request,auth,repo}=await start(t);const u=await auth('person');const s=await repo.addTestService({title:'维修服务',description:'测试预约',district:'中心街道',price:'100'});
 const date='2099-11-01',time='10:00',create=()=>request('/api/v1/bookings',{method:'POST',token:u.token,data:{serviceId:s.id,date,time,remark:''}});
 const a=await create();assert.equal(a.status,201);
 const orig=Date.now;Date.now=()=>orig()+31*60*1000;
 try{assert.equal((await create()).status,201);assert.equal((await request('/api/v1/me/bookings',{token:u.token})).data.items.some(x=>x.id===a.data.booking.id&&x.status==='expired'),true);}finally{Date.now=orig;}
});
test('basic image content signature and pixel dimensions validation',()=>{
 assert.equal(verifyImage(png,'image/png'),'image/png');
 assert.throws(()=>verifyImage(Buffer.from(png.subarray(0,12)),'image/png'));
 const huge=Buffer.from(png);huge.writeUInt32BE(999999,16);assert.throws(()=>verifyImage(huge,'image/png'));
});
