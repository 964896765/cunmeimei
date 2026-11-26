'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const geo=require('../src/geography');
test('versioned mainland cities support pinyin, direct towns and one Chongqing browsing city',()=>{
 assert.equal(geo.cities.length,369);assert.equal(new Set(geo.cities.map(x=>x.code)).size,369);
 assert.equal(geo.search('dongguan')[0].code,'441900');assert.ok(geo.search('dg').some(x=>x.code==='441900'));
 assert.ok(geo.findCity('441900').districts.some(x=>x.code==='441900004'&&x.name==='南城街道'&&x.level==='town'));
 assert.equal(geo.cities.filter(x=>x.name==='重庆市').length,1);
 assert.equal(geo.cityForCode('500229').code,'500100');
 assert.equal(geo.findCity('442000').districts.every(x=>x.level==='town'),true);
 assert.match(geo.source.coverage,/不含港澳台/);
});

test('all existing browsing cities have sourced display centers, available without a geocoder key',async()=>{
 const snapshot=require('../../miniprogram/data/city-centers.json');assert.deepEqual(require('../../miniprogram/data/city-centers'),snapshot);assert.equal(Object.keys(snapshot.centers).length,geo.cities.length);assert.ok(Object.keys(snapshot.source.inputHashes).length>=32);
 for(const city of geo.cities){const center=geo.centerForCity(city.code);assert.equal(center.code,city.code);assert.ok(Number.isFinite(center.latitude)&&Number.isFinite(center.longitude));assert.ok(center.latitude>0&&center.latitude<60&&center.longitude>70&&center.longitude<140);}
 const center=await require('../src/tencent-geography').provider('').center('310100');assert.ok(center.latitude>31&&center.latitude<32&&center.longitude>121&&center.longitude<122);assert.equal(center.approximate,true);assert.equal(geo.centerForCity('999999'),null);
});
test('manual browsing city survives GPS and validates town ancestry; history is bounded',()=>{
 const values=new Map(),context={module:{exports:{}},require:name=>name==='./geography'?geo:null,wx:{getStorageSync:k=>values.get(k),setStorageSync:(k,v)=>values.set(k,v)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/utils/geo-context'),'utf8'),context);const c=context.module.exports;
 assert.equal(c.current().cityCode,'');c.select('441900','441900004');values.set('gpsLocation',{cityCode:'440100'});
 assert.equal(c.current().label,'东莞市 · 南城街道');assert.throws(()=>c.select('440100','441900004'));
 for(const city of geo.cities.slice(0,9))c.select(city.code);assert.equal(c.history().length,6);
});
test('home shortcut grid preserves nine saved industries across four-column pages',()=>{
 const shortcuts=require('../../miniprogram/utils/shortcuts'),ids=require('../../miniprogram/utils/classification').categories.map(x=>x.id);
 assert.equal(shortcuts.normalize([...ids,...ids,'more','unknown']).length,9);
 assert.equal(shortcuts.defaults.length,7);
 for(const count of [0,1,7,8,9,15,16,23,24,27]){
  const visible=Math.min(count,9),slots=shortcuts.items(ids.slice(0,count)),pages=shortcuts.pages(slots);
  assert.equal(pages.length,visible>7?2:1);
  assert.ok(pages.every(page=>page.items.length===8&&page.items.at(-1).id==='more'));
  assert.deepEqual(slots.filter(x=>!x.empty&&x.id!=='more').map(x=>x.id),ids.slice(0,visible));
 }
});
test('geo query rejects malformed bounds/city ancestry and rounds approximate points before storage',()=>{
 for(const v of ['',null,true,'NaN','Infinity'])assert.throws(()=>geo.number(v,-90,90));
 assert.throws(()=>geo.bounds({west:120,east:110,south:20,north:25}));
 assert.throws(()=>geo.cityReference('441900','440106'));assert.throws(()=>geo.cityReference('not-a-city'));
 const v={kind:'merchant',cityCode:'441900',latitude:23.123456,longitude:113.123456,precision:'approximate',approved:true,verificationNote:'isolated geographic unit fixture'};
 assert.equal(geo.location(v).latitude,23.12);assert.equal(geo.location(v).longitude,113.12);
 assert.throws(()=>geo.location({...v,kind:'publication'}));
 const {publicationExtras}=require('../src/product-repository');
 assert.equal(publicationExtras({type:'used',attributes:{cityCode:'441900',districtCode:'441900004'}}).attributes.cityCode,'441900');
 assert.throws(()=>publicationExtras({type:'used',attributes:{cityCode:'440100',districtCode:'441900004'}}));
});
test('geography provider without key is explicit and failed vendor responses never echo key or GPS',async()=>{
 const {provider}=require('../src/tencent-geography');
 await assert.rejects(provider('').reverse(23,113),{code:'GEOCODER_NOT_CONFIGURED'});
 await assert.rejects(provider('secret-fixture',async()=>{throw Error('secret-fixture GPS 23,113');}).reverse(23,113),e=>e.code==='GEOCODER_UNAVAILABLE'&&!/secret|23/.test(e.message));
 let calls=0;const p=provider('private-fixture',async url=>{calls++;return {ok:true,json:async()=>String(url).includes('district')?{status:0,result:[[{id:'441900',location:{lat:23.02,lng:113.75}},{id:'440100',location:{lat:23.13,lng:113.26}}]]}:{status:0,result:{ad_info:{adcode:'441900'}}}};});
 const result=await p.reverse(23.02,113.75);assert.equal(result.cityCode,'441900');assert.ok(result.nearby.some(x=>x.code==='440100'));await p.center('441900');assert.equal(calls,2,'city-center directory is cached');
});
test('map marker clusters preserve underlying IDs and expose an exact selection after zoom',()=>{
 const build=require('../../miniprogram/utils/map-markers').markers,rows=[{id:'one',latitude:23,longitude:113,type:'service',title:'one'},{id:'two',latitude:23.001,longitude:113.001,type:'merchant',title:'two'}];
 const result=build(rows,10);assert.equal(result.markers.length,1);assert.equal(result.lookup.get(1).length,2);
 const separated=build([{...rows[0],latitude:23.1},rows[1]],18,'two');assert.equal(separated.markers.length,2);assert.ok(separated.markers.some(x=>x.width===40));
});
test('map HTTP validates scope and protects location writes before touching repository',async()=>{
 const repo=require('../src/memory-repository').createMemoryRepository();let queried;
 repo.listPublicLocations=async args=>{queried=args;return [];};
 const app=require('../src/server').createApp({repo,areas:['中心街道'],adminPassword:'unit-admin-long-password'});await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.address().port,query='?cityCode=441900&west=112&east=115&south=22&north=24';
 try{assert.equal((await fetch(base+'/api/v1/map'+query)).status,200);assert.equal(queried.cityCode,'441900');
  assert.equal((await fetch(base+'/api/v1/map'+query+'&page=-1')).status,400);
  assert.equal((await fetch(base+'/api/v1/map'+query+'&days=7&images=with&publisher=verified&sort=latest')).status,200);assert.equal(queried.days,7);assert.equal(queried.publisher,'verified');
  for(const day of [1,3,30,90]){assert.equal((await fetch(base+'/api/v1/map'+query+'&days='+day)).status,200);assert.equal(queried.days,day);}
  for(const suffix of ['&days=8','&days=','&images=fake','&publisher=phone_verified','&sort=price_low'])assert.equal((await fetch(base+'/api/v1/map'+query+suffix)).status,400);
  assert.equal((await fetch(base+'/api/v1/map'+query.replace('441900','999999'))).status,400);
  assert.equal((await fetch(base+'/api/v1/geo/reverse?latitude=23&longitude=113')).status,503);
  assert.equal((await fetch(base+'/admin/api/map-locations/11111111-1111-4111-8111-111111111111',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 }finally{await new Promise(r=>app.close(r));}
});
