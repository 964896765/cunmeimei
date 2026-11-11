'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {feedUrl}=require('../../miniprogram/utils/feed-query'),sorts=require('../../miniprogram/utils/discovery-sorts');
test('discovery conditions keep price, public location and unavailable salary rules distinct',()=>{
 for(const type of ['all','job','merchant','community'])assert.equal(sorts.options(type).find(x=>x.code==='price_low').enabled,false);
 for(const type of ['used','housing','service'])assert.equal(sorts.options(type).find(x=>x.code==='price_high').enabled,true);
 for(const type of ['used','housing','job'])assert.equal(sorts.options(type).find(x=>x.code==='distance').enabled,false);
 assert.equal(sorts.options('service').find(x=>x.code==='distance').enabled,true);assert.equal(sorts.options('job').find(x=>x.code==='salary_high').enabled,false);
 assert.match(feedUrl({sortIndex:1}),/sort=price_low/);assert.match(feedUrl({sort:'popular'}),/sort=popular/);
 assert.throws(()=>feedUrl({sort:'distance'}));assert.throws(()=>feedUrl({sort:'distance',latitude:NaN,longitude:113}));
 assert.match(feedUrl({sort:'distance',latitude:23,longitude:113}),/latitude=23&longitude=113/);assert.ok(!feedUrl({sort:'latest',latitude:23,longitude:113}).includes('latitude'));
});
function pageClient(){
 let definition,gps;const requests=[];
 const sandbox={Page:v=>definition=v,getApp:()=>({globalData:{}}),setTimeout,clearTimeout,require:name=>name.endsWith('/public-cache')?require('../../miniprogram/utils/public-cache'):name.endsWith('/search-filters')?require('../../miniprogram/utils/search-filters'):name.endsWith('/api')?{online:()=>true,request:async(method,url)=>{requests.push(url);return {items:[],pagination:{hasMore:false}}}}:name.endsWith('/discovery-sorts')?sorts:name.endsWith('/feed-query')?{feedUrl}:name.endsWith('/classification')?{channels:[]}:name.endsWith('/catalog')?{groupOptions:[]}:name.endsWith('/presentation')?{item:x=>x}:name.endsWith('/tab-bar')?{visibility(){}}:{},wx:{getLocation:options=>{gps=options},getStorageSync:()=>'',showToast(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../miniprogram/pages/discover/index.js'),'utf8'),sandbox);
 const page={data:structuredClone(definition.data),setData:v=>Object.assign(page.data,v)};for(const [key,value]of Object.entries(definition))if(typeof value==='function')page[key]=value.bind(page);page.active=true;
 return {page,requests,gps:()=>gps};
}
test('sort choices refetch server results and channel changes discard incompatible ordering',async()=>{
 const {page,requests}=pageClient();await page.selectSort({currentTarget:{dataset:{code:'popular'}}});assert.match(requests.at(-1),/sort=popular/);
 page.data.type='used';page.syncSortOptions();await page.selectSort({currentTarget:{dataset:{code:'price_low'}}});assert.match(requests.at(-1),/sort=price_low/);
 page.data.type='merchant';page.syncSortOptions();assert.equal(page.data.sortCode,'latest');assert.equal(page.data.sortIndex,0);
 const n=requests.length;await page.selectSort({currentTarget:{dataset:{code:'salary_high'}}});assert.equal(requests.length,n);
});
test('location denial and a cancelled or hidden sort sheet never apply a late location',async()=>{
 const a=pageClient();a.page.openSort();let pending=a.page.selectSort({currentTarget:{dataset:{code:'distance'}}});a.gps().fail({});await pending;assert.equal(a.page.data.sortCode,'latest');assert.ok(a.page.data.sortError);assert.equal(a.requests.length,0);
 const b=pageClient();b.page.openSort();pending=b.page.selectSort({currentTarget:{dataset:{code:'distance'}}});b.page.closeSort();b.gps().success({latitude:23,longitude:113});await pending;assert.equal(b.requests.length,0);assert.equal(b.page.data.sortCode,'latest');
 const c=pageClient();c.page.openSort();pending=c.page.selectSort({currentTarget:{dataset:{code:'distance'}}});c.gps().success({latitude:23,longitude:113});await pending;assert.match(c.requests[0],/sort=distance/);assert.equal(c.page.data.sortOpen,false);
});
test('feed sorting API validates origin and rejects unavailable salary instead of falling back silently',async t=>{
 const {createApp}=require('../src/server'),{createMemoryRepository}=require('../src/memory-repository');
 const app=createApp({repo:createMemoryRepository(),areas:['中心街道']});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const base='http://127.0.0.1:'+app.address().port;
 for(const query of ['sort=distance','sort=distance&latitude=999&longitude=113','sort=distance&latitude=23&longitude=113&type=used','sort=salary_high'])assert.equal((await fetch(base+'/api/v1/feed?'+query)).status,400);
 for(const sort of ['recommended','popular','latest'])assert.equal((await fetch(base+'/api/v1/feed?sort='+sort)).status,200);
});
