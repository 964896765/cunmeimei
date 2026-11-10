'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {feedUrl}=require('../../miniprogram/utils/feed-query');
const business=require('../../miniprogram/utils/business-templates');
test('seven template search channels share codes with discovery and retain legacy community compatibility',()=>{
 const classification=require('../../miniprogram/utils/classification');
 assert.deepEqual(classification.templateCodes,business.templates.map(x=>x.code));
 assert.deepEqual(classification.channels.slice(1).map(x=>x.id),business.searchOptions.slice(1).map(x=>x.id));
 for(const item of business.templates)assert.equal(new URL(feedUrl({type:item.id}),'http://test').searchParams.get('type'),item.id);
 assert.match(feedUrl({type:'community'}),/type=community/);
});

test('picture filtering is validated and applied before feed pagination',async t=>{
 const repo=require('../src/memory-repository').createMemoryRepository(),app=require('../src/server').createApp({repo,areas:['中心街道']});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{app.closeAllConnections();app.close(r);}));const base='http://127.0.0.1:'+app.address().port;
 const withPhoto=await repo.createPublication('owner',{type:'used',title:'二手手机有图',description:'手机',district:'中心街道',imageIds:['00000000-0000-4000-8000-000000000001']});
 const noPhoto=await repo.createPublication('owner',{type:'used',title:'二手手机无图',description:'手机',district:'中心街道'});
 await repo.reviewPublication(withPhoto.id,'published','');await repo.reviewPublication(noPhoto.id,'published','');
 const r=await fetch(base+feedUrl({q:'手机',images:'with',pageSize:1}));assert.equal(r.status,200);const body=await r.json();assert.deepEqual(body.items.map(x=>x.id),[withPhoto.id]);assert.equal(body.pagination.hasMore,false);
 const pending=await repo.createPublication('owner',{type:'used',title:'未审核手机',description:'手机',district:'中心街道',imageIds:['00000000-0000-4000-8000-000000000002']});
 assert.ok(!(await repo.listFeed({q:'手机',images:'with'})).some(x=>x.id===pending.id));
 for(const value of ['none','true',''])assert.equal((await fetch(base+'/api/v1/feed?images='+value)).status,400);
 assert.throws(()=>feedUrl({images:'invalid'}));
});
test('date/radius HTTP filters reject malformed or private-location requests instead of silently ignoring them',async t=>{
 const repo=require('../src/memory-repository').createMemoryRepository(),app=require('../src/server').createApp({repo,areas:['中心街道']});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{app.closeAllConnections();app.close(r);}));const base='http://127.0.0.1:'+app.address().port;
 for(const query of ['days=-7','days=8','days=7.5','radiusKm=51','radiusKm=50','radiusKm=50&latitude=200&longitude=113','type=used&radiusKm=50&latitude=23&longitude=113'])assert.equal((await fetch(base+'/api/v1/feed?'+query)).status,400,query);
 for(const type of ['all','merchant','service'])assert.equal((await fetch(base+'/api/v1/feed?type='+type+'&days=7&radiusKm=50&latitude=23&longitude=113')).status,200);
 for(const type of ['event','public']){const r=await fetch(base+'/api/v1/feed?type='+type);assert.equal(r.status,200);assert.deepEqual((await r.json()).items,[]);}
 assert.throws(()=>feedUrl({days:8}));assert.throws(()=>feedUrl({radiusKm:50}));assert.throws(()=>feedUrl({type:'used',radiusKm:50,latitude:23,longitude:113}));
});
