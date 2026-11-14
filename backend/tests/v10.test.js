'use strict';
const {acceptedConsent}=require('./helpers/publication-confirmation');
const test=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('../src/server'),{createMemoryRepository}=require('../src/memory-repository');

test('V0.10: paginated public feed is stable, honors moderation and region settings; old details remain accessible',async t=>{
 const repo=createMemoryRepository();await repo.seedRegions(['中心街道','北城区']);
 const uid=await repo.upsertIdentity('dev_local','paging-user');
 const old=await repo.createPublication(uid,{publicationConsent:acceptedConsent(),type:'used',title:'最老的一条公开信息',description:'确保百条之后仍然能通过详情编号访问',district:'中心街道',price:'10'});
 assert.equal(await repo.reviewPublication(old.id,'published',''),true);
 for(let i=0;i<115;i++){
  const row=await repo.createPublication(uid,{publicationConsent:acceptedConsent(),type:'used',title:'公开分页记录'+String(i).padStart(3,'0'),description:'这是分页和地区展示测试使用的演示信息',district:i%2?'北城区':'中心街道',price:'20'});
  assert.equal(await repo.reviewPublication(row.id,'published',''),true);
 }
 const pending=await repo.createPublication(uid,{publicationConsent:acceptedConsent(),type:'used',title:'未审核的内容不可公开',description:'仅供本人和后台查看的未审内容',district:'中心街道',price:'100'});
 const app=createApp({repo,areas:['中心街道','北城区'],adminPassword:'test-admin-password-secure'});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const base=`http://127.0.0.1:${app.address().port}`;
 const fetchPage=async(path)=>{const r=await fetch(base+path);return {status:r.status,data:await r.json()};};
 const first=await fetchPage('/api/v1/feed?type=used&page=1&pageSize=20');
 const second=await fetchPage('/api/v1/feed?type=used&page=2&pageSize=20');
 assert.equal(first.status,200);assert.equal(first.data.items.length,20);assert.equal(first.data.pagination.hasMore,true);
 assert.equal(second.data.items.length,20);assert.equal(new Set([...first.data.items,...second.data.items].map(x=>x.id)).size,40);
 assert.equal(first.data.items.some(x=>x.id===pending.id),false);
 const last=await fetchPage('/api/v1/feed?type=used&page=6&pageSize=20');
 assert.equal(last.data.items.length,16);assert.equal(last.data.pagination.hasMore,false);
 assert.equal((await fetchPage('/api/v1/items/'+old.id)).status,200,'detail independent of first 100 feed records');
 for(const params of ['page=0','page=-1','page=10000','page=abc','pageSize=51','pageSize=0','pageSize=5.5','page=999&pageSize=50']){
  assert.equal((await fetchPage('/api/v1/feed?'+params)).status,400,params);
 }
 const regions=await repo.setRegionEnabled('北城区',false);assert.equal(regions.enabled,false);
 const nowVisible=await fetchPage('/api/v1/feed?type=used&page=1&pageSize=50');
 assert.ok(nowVisible.data.items.every(x=>x.district==='中心街道'));
 const hidden=await repo.listFeed({type:'used',area:'北城区'});assert.equal(hidden.length,0);
 assert.equal((await fetchPage('/api/v1/feed?page=1&pageSize=20&q='+encodeURIComponent('未审核的内容不可公开'))).data.items.length,0);
});
