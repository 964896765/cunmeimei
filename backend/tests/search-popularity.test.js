'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('../src/server'),{createMemoryRepository}=require('../src/memory-repository');
const {termFor}=require('../src/search-popularity');
test('popular search uses counted safe terms, city isolation, enabled categories and explicit event deduplication',async t=>{
 const repo=createMemoryRepository(),app=createApp({repo,areas:['中心街道']});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{app.closeAllConnections();app.close(r);}));
 const base='http://127.0.0.1:'+app.address().port;
 const request=async(path,data,testData=false)=>{const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(testData?{'X-Development-Test-Data':'true'}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json()};};
 assert.deepEqual((await request('/api/v1/search/popular?cityCode=441900')).data.items,[]);
 const event={cityCode:'441900',q:'保洁'};
 assert.equal((await request('/api/v1/search/events',event)).data.recorded,true);
 assert.equal((await request('/api/v1/search/events',event)).data.recorded,false);
 assert.deepEqual((await request('/api/v1/search/popular?cityCode=441900')).data.items,[]);
 await repo.recordSearch('441900','保洁');await repo.recordSearch('441900','保洁');
 assert.deepEqual((await request('/api/v1/search/popular?cityCode=441900')).data.items,[{term:'保洁'}]);
 assert.deepEqual((await request('/api/v1/search/popular?cityCode=440100')).data.items,[]);
 for(const q of ['地址13800138000','殡葬','孕检','招聘',"__proto__",'constructor']){assert.equal(termFor(q),'');assert.equal((await request('/api/v1/search/events',{...event,q})).data.recorded,false);}
 assert.equal((await request('/api/v1/search/events',{cityCode:'441900',q:'二手'},true)).data.recorded,false);
 assert.equal((await request('/api/v1/search/popular?cityCode=invalid')).status,400);
 await repo.setCategoryEnabled('service',false);assert.deepEqual((await request('/api/v1/search/popular?cityCode=441900')).data.items,[]);
});
