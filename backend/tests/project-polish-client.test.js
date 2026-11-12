'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function client(name,handler){
 let definition;const storage=new Map([['city_life_user_id','one'],['city_life_v2_auth_token','token']]),routes=[],calls=[],modals=[],timers=new Map();let city={cityCode:'441900',label:'东莞市'},timer=0;
 const api={online:()=>true,hasSession:()=>!!storage.get('city_life_v2_auth_token'),login:async()=>{},showError(){},request:async(method,url,data)=>{calls.push({method,url,data});return handler(method,url,data);}};
 const wx={getStorageSync:k=>storage.get(k)||'',setStorageSync:(k,v)=>storage.set(k,v),showModal:v=>modals.push(v),navigateTo:v=>routes.push(v.url),switchTab:v=>routes.push(v.url),setClipboardData(){},stopPullDownRefresh(){}};
 const sandbox={Page:v=>definition=v,wx,getCurrentPages:()=>[{}],setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),require:n=>n.endsWith('/feed-query')?require('../../miniprogram/utils/feed-query'):n.endsWith('/public-cache')?require('../../miniprogram/utils/public-cache'):n.endsWith('/api')?api:n.endsWith('/geo-context')?{current:()=>city}:n.endsWith('/theme')?{apply(){}}:n.endsWith('/shortcuts')?{load:()=>[],items:x=>x,pages:()=>[{id:'empty',items:[]}]}:n.endsWith('/navigation')?{detail:id=>routes.push('/pages/detail/index?id='+id)}:n.endsWith('/presentation')?{media:x=>'http://local'+x,item:x=>({...x,cover:x.images?.[0]||''})}:{} };
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages',name,'index.js'),'utf8'),sandbox);
 const page={data:structuredClone(definition.data),setData(v,done){Object.assign(this.data,v);done?.();}};for(const [key,value]of Object.entries(definition))if(typeof value==='function')page[key]=value.bind(page);
 return {page,api,storage,routes,calls,modals,timers,city:value=>{city=value;}};
}
const news={id:'10000000-0000-4000-8000-000000000001',kind:'news',title:'本机测试资讯',sourceName:'隔离来源',body:'第一段\n第二段',startsAt:new Date(Date.now()-10000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()};

test('home keeps real public information in the feed and filters expired records', async () => {
 const records=[{id:'hero',images:['https://example.test/approved-photo.jpg'],title:'实际公开信息'},{id:'text-only',images:[],title:'另一条公开信息'},{id:'expired',images:[],expiresAt:'2020-01-01T00:00:00Z'}];
 const c=client('home',async(method,url)=>url.includes('/config')?{areas:[]}:url.includes('/feed?')?{items:records}:{banners:[],news:[news]});
 await c.page.load();
 assert.deepEqual(c.page.data.featured.map(item=>item.id),['hero','text-only']);
 assert.ok(c.calls.some(call=>call.url.includes('sort=recommended')));
});
test('home reads actual content, preserves cities and discards late responses after city changes',async()=>{
 const gate=deferred(),c=client('home',async(m,u)=>u.includes('/config')?{areas:['中心街道']}:gate.promise);const work=c.page.load();c.city({cityCode:'310100',label:'上海市'});gate.resolve({news:[news],banners:[]});await work;assert.equal(c.page.data.news.length,0);
 c.api.request=async(m,u)=>u.includes('/config')?{areas:[]}:{news:[news],banners:[]};await c.page.load();assert.equal(c.page.data.region,'上海市');assert.equal(c.page.data.news[0].id,news.id);
});
test('home preserves eligible ad images and reports cached content when a refresh fails',async()=>{
 let fail=false;const c=client('home',async(m,u)=>{if(u.includes('/config'))return {areas:[]};if(fail)throw Error('network');return {news:[news],banners:[{...news,kind:'ad',imageId:'image-1'},{...news,id:'expired',endsAt:'2020-01-01T00:00:00Z'}]};});
 await c.page.load();assert.equal(c.page.data.banners.length,1);fail=true;await c.page.load();assert.equal(c.page.data.banners.length,1);assert.ok(c.page.data.banners[0].cover);assert.equal(c.page.data.cached,true);assert.ok(c.page.data.error);assert.equal(c.page.data.loading,false);
});

test('home restores cached ads after reopening, filters their schedule and isolates cities', async () => {
 const c=client('home',async()=>{throw Error('network');});
 const active={...news,kind:'ad',imageId:'image-1'};
 c.storage.set('city_life_public_cache_v1',[{key:'home:'+c.page.context(),at:Date.now(),value:{banners:[active,{...active,id:'expired',endsAt:'2020-01-01T00:00:00Z'},{...active,id:'future',startsAt:'2099-01-01T00:00:00Z',endsAt:'2099-02-01T00:00:00Z'}],news:[]}}]);
 await c.page.load();
 assert.deepEqual(c.page.data.banners.map(item=>item.id),[active.id]);
 assert.equal(c.page.data.cached,true);
 c.city({cityCode:'310100',label:'上海市'});
 await c.page.load();
 assert.equal(c.page.data.banners.length,0);
});

test('home removes a withdrawn ad when a successful response returns no placements', async () => {
 const c=client('home',async(method,url)=>url.includes('/config')?{areas:[]}:{banners:[{...news,kind:'ad',imageId:'image-1'}],news:[]});
 await c.page.load();
 c.api.request=async(method,url)=>url.includes('/config')?{areas:[]}:{banners:[],news:[]};
 await c.page.load();
 assert.equal(c.page.data.banners.length,0);
 c.api.request=async()=>{throw Error('network');};
 c.page.contentContext=undefined;
 await c.page.load();
 assert.equal(c.page.data.banners.length,0);
});
test('home backgrounding cancels refresh timers and prevents delayed private context from rendering',async()=>{
 const c=client('home',async(m,u)=>u.includes('/config')?{areas:[]}:{news:[news],banners:[]});c.page.visible=true;await c.page.load();assert.equal(c.timers.size,1);c.page.onHide();assert.equal(c.timers.size,0);
});
test('banner navigation rechecks current eligibility and cannot open after the user changes city',async()=>{
 const gate=deferred(),c=client('home',()=>gate.promise);c.page.visible=true;const opening=c.page.openBanner({currentTarget:{dataset:{id:news.id}}});c.city({cityCode:'310100',label:'上海市'});gate.resolve({item:{targetId:'target'}});await opening;assert.equal(c.routes.length,0);
});
test('information pagination deduplicates and retains earlier rows when the next page fails',async()=>{
 let fail=false;const c=client('information',async()=>{if(fail)throw Error('offline');return {items:[news],hasMore:true};});await c.page.load(true);await c.page.load(false);assert.equal(c.page.data.items.length,1);fail=true;await c.page.load(false);assert.equal(c.page.data.items.length,1);assert.ok(c.page.data.error);
});
test('information hides disabled content on retry and rejects late private report results after account changes',async()=>{
 const gate=deferred(),c=client('information',()=>gate.promise);c.page.setData({reportId:'10000000-0000-4000-8000-000000000003'});const load=c.page.load();c.storage.set('city_life_user_id','two');gate.resolve({report:{reason:'old account text'}});await load;assert.equal(c.page.data.report,null);
 const d=client('information',async()=>{throw Error('disabled');});d.page.setData({id:news.id,item:news});await d.page.load();assert.equal(d.page.data.item,null);
});
test('information report confirmation does not submit under a different account',async()=>{
 const c=client('information',async()=>({id:'report'}));c.page.setData({item:news});const work=c.page.report();c.storage.set('city_life_user_id','two');c.modals[0].success({confirm:true,content:'说明错误信息和原始来源'});await work;assert.equal(c.calls.filter(c=>c.method==='POST').length,0);
});
