'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {toPublicItem}=require('../src/public-item');
const {createMemoryRepository}=require('../src/memory-repository');
const {createApp}=require('../src/server');
const RECORD={id:'11111111-1111-4111-8111-111111111111',title:'上门保洁需求',description:'我需要找人上门打扫',district:'中心街道',price:'100',type:'service'};

test('V0.13: publication service demand is a listing, catalog service is bookable',()=>{
 const demand=toPublicItem(RECORD,'publication');
 const catalog=toPublicItem(RECORD,'catalog');
 assert.equal(demand.kind,'listing');
 assert.equal(catalog.kind,'service');
 assert.equal(demand.type,'service');
 assert.equal(catalog.category,'生活服务');
 assert.notEqual(demand.kind,catalog.kind);
 assert.throws(()=>toPublicItem(RECORD,'unknown'));
});

test('V0.13: published service demand cannot be booked or falsely reported as a catalog service',async t=>{
 const repo=createMemoryRepository();await repo.seedRegions(['中心街道']);
 const author=await repo.upsertIdentity('dev_local','service-demand-user');
 const demand=await repo.createPublication(author,{type:'service',title:'求助找上门清洁阿姨',description:'家里需要大扫除，寻找附近保洁师傅',district:'中心街道',price:'100'});
 assert.equal(await repo.reviewPublication(demand.id,'published',''),true);
 const offered=await repo.addTestService({title:'上门保洁可预约',description:'商家提供的真实服务项目',district:'中心街道',price:'150'});
 const server=createApp({repo,areas:['中心街道'],allowDevLogin:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const get=async p=>{const r=await fetch(base+p);return {code:r.status,data:await r.json()};};
 const feed=await get('/api/v1/feed?type=service');assert.equal(feed.code,200);
 assert.equal(feed.data.items.find(x=>x.id===demand.id).kind,'listing');
 assert.equal(feed.data.items.find(x=>x.id===offered.id).kind,'service');
 assert.equal((await get('/api/v1/items/'+demand.id)).data.item.kind,'listing');
 assert.equal((await get('/api/v1/items/'+offered.id)).data.item.kind,'service');
 assert.equal((await get('/api/v1/services/'+demand.id+'/slots?date=2099-11-01')).code,404);
 assert.equal((await get('/api/v1/services/'+offered.id+'/slots?date=2099-11-01')).code,200);
 const session=await repo.upsertIdentity('dev_local','reporter');const hash=require('node:crypto').createHash('sha256').update('x'.repeat(43)).digest('hex');
 await repo.newSession(session,hash,new Date(Date.now()+60000).toISOString());
 const report=async type=>{const r=await fetch(base+'/api/v1/reports',{method:'POST',headers:{Authorization:'Bearer '+'x'.repeat(43),'Content-Type':'application/json'},body:JSON.stringify({targetType:type,targetId:demand.id,reason:'false_info'})});return r.status;};
 assert.equal(await report('service'),404,'cannot report service-demand publication as merchant catalog');
 assert.equal(await report('publication'),201,'can report user-generated service demand as publication');
});
