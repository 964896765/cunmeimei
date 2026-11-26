'use strict';
const {acceptedConsent}=require('./helpers/publication-confirmation');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const browse=require('../../miniprogram/utils/browse-query'),catalog=require('../../miniprogram/utils/classification'),geo=require('../../miniprogram/utils/geography');
const city='441900',district=geo.findCity(city).districts[0].code,box={west:113,east:114,south:22,north:23};
function page(name,handler){const store=new Map([['city_life_user_id','owner'],['city_life_v2_auth_token','token'],['city_life_browse_city',{cityCode:city,districtCode:district}]]),app={globalData:{}},calls=[],routes=[],modals=[],events=[];let definition;
 const api={online:()=>true,hasSession:()=>!!store.get('city_life_v2_auth_token'),logout:async()=>{calls.push({method:'POST',url:'/api/v1/auth/logout'});store.delete('city_life_v2_auth_token');return {serverRevoked:true};},showError:e=>calls.push({error:e.message}),request:async(method,url,data)=>{calls.push({method,url,data});if(handler)return handler(method,url,data);if(url==='/api/v1/config')return {areas:['中心街道'],categories:['used','housing','service','merchant','community'].map(id=>({id,enabled:true})),features:{industryWorkflows:true,publishingApproved:true}};return {items:[],pagination:{hasMore:false}};}};
 const nav={search:(...args)=>routes.push(args),publish:id=>routes.push({publish:id}),personalCenter:section=>routes.push({center:section})};
 const wx={setClipboardData:o=>calls.push({clipboard:o.data}),getStorageSync:k=>store.get(k)||'',setStorageSync:(k,v)=>store.set(k,v),showModal:o=>modals.push(o),showActionSheet:o=>modals.push(o),navigateTo:o=>{routes.push(o.url);o.complete?.();},switchTab:o=>routes.push(o.url),navigateBack:()=>routes.push('back'),showToast(){},enableAlertBeforeUnload(){},disableAlertBeforeUnload(){}};
 const flowBox={module:{exports:{}},wx,require:()=>api,getCurrentPages:()=>[p]};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/workflow-client.js'),'utf8'),flowBox);
 const stub={Page:d=>definition=d,getApp:()=>app,wx,setTimeout,clearTimeout,getCurrentPages:()=>[p],require:n=>n.endsWith('/workflow-client')?flowBox.module.exports:n.endsWith('/api')?api:n.endsWith('/theme')?{current:()=>({theme:'prism'}),apply(){}}:n.endsWith('/navigation')?nav:n.endsWith('/points-workspace')?{initialState:{},open(){this.setData({mode:'points'});}}:n.endsWith('/personal-profile')?{fields:()=>({}),avatar(){}}:n.endsWith('/geo-context')?{current:()=>store.get('city_life_browse_city')||{cityCode:'',districtCode:''}}:n.endsWith('/tab-bar')?{context:()=>store.get('city_life_user_id')+':'+store.get('city_life_v2_auth_token'),setUnread(){},visibility(){}}:n.endsWith('/verification')?{selectProject:async id=>routes.push({resident:id}),open:()=>routes.push('verification')}:n.endsWith('/presentation')?{item:x=>x,media:x=>x}:require('../../miniprogram/utils/'+n.split('/').pop())};
 let p;vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/'+name+'/index.js'),'utf8'),stub);p={route:'pages/'+name+'/index',data:structuredClone(definition.data),setData(v,done){Object.assign(this.data,v);done?.();},getOpenerEventChannel:()=>({emit:(name,value)=>events.push({name,value})})};for(const [k,v]of Object.entries(definition))if(typeof v==='function')p[k]=v.bind(p);return {page:p,api,app,store,calls,routes,modals,events,wx};
}
test('personal workspace has exactly two integrated centers and all service tabs are addressable',()=>{const c=page('me');c.page.openServiceCenter();assert.equal(c.page.data.mode,'service');for(const tab of ['mine','sent','received','credentials','reports']){c.page.openServiceSection({currentTarget:{dataset:{section:tab}}});assert.ok(c.routes.at(-1).endsWith('?tab='+tab));const industry=page('industry');industry.page.onLoad({tab});assert.equal(industry.page.data.tab,tab);}for(const tab of ['offers','orders','promotion']){c.page.openCommerce({currentTarget:{dataset:{tab}}});assert.ok(c.routes.at(-1).endsWith('?tab='+tab));}const text=fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/me/index.wxml'),'utf8'),main=text.slice(text.indexOf('class="profile-entry"'));assert.ok(main.includes('积分中心')&&main.includes('服务中心'));assert.ok(!main.includes('bindtap="openIndustry"'));assert.ok(!main.includes('bindtap="openCommerce"'));});
test('all 418 projects retain explicit access rules and load their existing resident or industry publishing flow',async()=>{const c=page('publish');await c.page.onShow();assert.equal(c.page.data.configReady,true);for(const project of catalog.projects){if(require('../../miniprogram/utils/product-scope').isForumProject(project.id)){const before=c.routes.length;await c.page.chooseProject({currentTarget:{dataset:{id:project.id}}});assert.equal(c.routes.length,before);continue;}await c.page.chooseProject({currentTarget:{dataset:{id:project.id}}});const target=c.routes.at(-1);if(catalog.kindsFor(project.id).length)assert.equal(target.resident,project.id);else assert.equal(target,'/pages/industry/index?projectId='+project.id);}assert.equal(c.modals.length,3);});
test('failed publishing configuration does not claim a project is closed or navigate to a guessed form',async()=>{const c=page('publish',async()=>{throw Error('configuration offline');});await c.page.onShow();await c.page.chooseProject({currentTarget:{dataset:{id:catalog.projects[0].id}}});assert.equal(c.page.data.configReady,false);assert.equal(c.routes.length,0);assert.equal(c.modals.length,0);assert.ok(c.calls.some(x=>x.error));});
test('category picker resolves all industries, groups and projects without bridging their full definitions',()=>{for(const project of catalog.projects){const p=browse.categoryColumns(project.id);assert.equal(p.columns[2][p.value[2]].id,project.id);assert.equal(browse.category(project.id).industryId,project.categoryId);assert.ok(!JSON.stringify(p).includes('publication'));}assert.equal(browse.categoryColumns('').columns[0].length,28);assert.equal(browse.common({cityCode:city,districtCode:'310101'}).districtCode,'');});
test('navigation preserves job/event/public channel, region, hierarchy and common filters',()=>{const app={globalData:{}},routes=[],sandbox={module:{exports:{}},getApp:()=>app,wx:{navigateTo:o=>routes.push(o.url),switchTab:o=>routes.push(o.url)},require:n=>n==='./browse-query'?browse:catalog};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/navigation.js'),'utf8'),sandbox);const nav=sandbox.module.exports;for(const type of ['job','event','public']){nav.search(type,'名称 & 关键词','C02',{cityCode:city,districtCode:district,days:7,images:'with',sort:'latest'});const u=new URL(routes.at(-1),'http://test');assert.equal(u.searchParams.get('type'),type);assert.equal(u.searchParams.get('districtCode'),district);assert.equal(u.searchParams.get('images'),'with');assert.equal(u.searchParams.get('q'),'名称 & 关键词');}nav.publish(catalog.projects[0].id);assert.equal(app.globalData.publishTarget.id,catalog.projects[0].id);nav.personalCenter('service');assert.equal(app.globalData.personalCenterSection,'service');});
test('discovery retains its local district after tab return and sends the same scope to search',async()=>{const c=page('discover');await c.page.onShow();const d=geo.findCity(city).districts[1];await c.page.districtChanged({detail:{districtCode:d.code}});await c.page.onShow();assert.equal(c.page.data.districtCode,d.code);await c.page.categoryChanged({detail:{categoryId:'C02'}});c.page.setData({type:'job',days:7,images:'with'});c.page.openSearch();const [type,,cat,options]=c.routes.at(-1);assert.equal(type,'job');assert.equal(cat,'C02');assert.equal(options.districtCode,d.code);assert.equal(options.days,7);assert.equal(options.images,'with');});
test('map search queries the same viewport and publisher filters, then returns their complete context',async()=>{const c=page('search');c.page.onLoad({type:'service',q:'',categoryId:'C03',cityCode:city,districtCode:district,fromMap:'1',publicOnly:'1',...box,days:'7',images:'with',publisher:'verified',sort:'latest'});c.page.version=1;await c.page.search();const url=new URL(c.calls.at(-1).url,'http://test');assert.equal(url.pathname,'/api/v1/map');for(const [k,v]of Object.entries({...box,publisher:'verified',days:7,images:'with',districtCode:district}))assert.equal(url.searchParams.get(k),String(v));assert.equal(c.events.at(-1).value.publisher,'verified');assert.equal(c.events.at(-1).value.images,'with');assert.equal(c.page.data.canFilterDistance,false);});

test('search and map round trips keep service conditions and explicitly clear removed refinements',async()=>{
 const refinements={price:'100_500',supply:'bookable'};
 const c=page('search');
 c.page.onLoad({type:'service',cityCode:city,fromMap:'1',...box,refinements:encodeURIComponent(JSON.stringify(refinements))});
 await c.page.search(false);
 assert.deepEqual(JSON.parse(JSON.stringify(c.events.at(-1).value.refinements)),refinements);
 await c.page.removeCondition({detail:{key:'refinement:price'}});
 assert.deepEqual(JSON.parse(JSON.stringify(c.events.at(-1).value.refinements)),{supply:'bookable'});
 const map=page('map');
 map.page.onLoad({type:'service',cityCode:city,refinements:encodeURIComponent(JSON.stringify(refinements))});
 assert.equal(map.page.data.filterCount,2);
 map.page.searchArea=async()=>{};
 await map.page.removeCondition({detail:{key:'refinement:price'}});
 assert.equal(map.page.data.filterCount,1);
 await map.page.resetConditions();
 assert.equal(Object.keys(map.page.data.refinements).length,0);
 assert.equal(map.page.data.filterCount,0);
});
test('map viewport cannot silently expand into citywide results when missing or mismatched',async()=>{const c=page('search');c.page.onLoad({cityCode:city,fromMap:'1',...box});c.page.version=1;c.page.setData({cityCode:'310100'});await c.page.search();assert.equal(c.calls.length,0);assert.ok(c.page.data.error.includes('地图范围'));assert.throws(()=>browse.mapUrl({cityCode:city}),/地图范围/);});
test('public API includes approved legacy community content in public channel without exposing it on a map',async t=>{const repo=require('../src/memory-repository').createMemoryRepository();await repo.seedRegions(['中心街道']);const uid=await repo.upsertIdentity('dev_local','public-bridge-test'),p=await repo.createPublication(uid,{publicationConsent:acceptedConsent(),type:'community',title:'隔离邻里频道验收',attributes:{categoryId:'C08G01S01'},description:'只用于测试旧信息与公共频道的查询一致性',district:'中心街道',price:''});await repo.reviewPublication(p.id,'published','');let query;repo.listPublicLocations=async value=>{query=value;return [];};const server=require('../src/server').createApp({repo,areas:['中心街道']});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port,feed=await (await fetch(origin+'/api/v1/feed?type=public')).json();assert.ok(feed.items.some(x=>x.id===p.id));const response=await fetch(origin+browse.mapUrl({cityCode:city,districtCode:district,bounds:box,categoryId:'C03',publisher:'verified',images:'with',days:7}));assert.equal(response.status,200);assert.equal(query.publisher,'verified');assert.equal(query.districtCode,district);assert.equal(query.west,box.west);assert.equal((await response.json()).items.length,0);});

test('industry form back allows continued editing and never leaves after an unacknowledged save',async()=>{const c=page('industry');c.page.onLoad({});c.page.loadedClean=true;c.page.cleanForm=JSON.stringify(c.page.data.form);c.page.setData({mode:'form',form:{...c.page.data.form,title:'未保存的表单'}});c.page.back();await c.modals[0].success({tapIndex:2});c.modals[0].complete();assert.equal(c.routes.length,0);assert.equal(c.page.data.form.title,'未保存的表单');c.page.save=async()=>undefined;c.page.back();await c.modals[1].success({tapIndex:0});assert.equal(c.routes.length,0);});
test('save-and-leave waits for the acknowledged industry draft and rejects an old-account choice',async()=>{const c=page('industry');c.page.onLoad({});c.page.loadedClean=true;c.page.cleanForm=JSON.stringify(c.page.data.form);c.page.setData({mode:'form',form:{...c.page.data.form,title:'等待保存的表单'}});let finish;c.page.save=()=>new Promise(r=>finish=r);c.page.back();const choice=c.modals[0].success({tapIndex:0});assert.equal(c.routes.length,0);finish({entry:{id:'saved-original'}});await choice;assert.deepEqual(c.routes,['back']);const d=page('industry');d.page.loadedClean=true;d.page.cleanForm='previous';d.page.setData({mode:'form'});d.page.back();d.store.set('city_life_user_id','different-owner');await d.modals[0].success({tapIndex:1});assert.equal(d.routes.length,0);});

test('clearing an executed keyword cannot resurrect it and keeps the selected channel and project',async()=>{
 const c=page('search');c.page.onLoad({q:'旧关键词',type:'service',categoryId:'C03',cityCode:city,districtCode:district});await c.page.search();await c.page.clearQuery();
 const query=new URL(c.calls.at(-1).url,'http://test').searchParams;assert.equal(query.get('q'),'');assert.equal(query.get('type'),'service');assert.equal(query.get('categoryId'),'C03');assert.equal(c.page.data.submittedQ,'');
});

test('resetting search refinements preserves keyword, channel, city and map viewport',async()=>{
 const c=page('search');c.page.onLoad({q:'保洁',type:'service',categoryId:'C03',cityCode:city,districtCode:district,fromMap:'1',...box,days:90,images:'with',publisher:'verified'});await c.page.clear();
 const query=new URL(c.calls.at(-1).url,'http://test').searchParams;for(const [k,v]of Object.entries({...box,type:'service',q:'保洁',cityCode:city,categoryId:'',districtCode:'',days:0,images:'all',publisher:'all'}))assert.equal(query.get(k),String(v));
 assert.equal(c.store.get('city_life_browse_city').districtCode,district);
});

test('all supported date ranges survive shared query normalization and exact map searches',async()=>{
 const dates=require('../../miniprogram/utils/search-filters').dateOptions;
 for(const {value}of dates){const c=page('search');c.page.onLoad({cityCode:city,fromMap:'1',days:value,...box});await c.page.search(false);const q=new URL(c.calls.at(-1).url,'http://test').searchParams;assert.equal(q.get('days'),String(value));assert.equal(c.page.data.days,value);}
});

test('changing channel preserves independent refinements and clears incompatible category, distance and sorting',async()=>{
 const c=page('search');c.page.onLoad({q:'公开信息',categoryId:'C03',type:'service',days:3,images:'with',cityCode:city,sort:'distance',latitude:23,longitude:113,radiusKm:5});
 await c.page.changeType({detail:{value:c.page.data.types.findIndex(x=>x.id==='job')}});const q=new URL(c.calls.at(-1).url,'http://test').searchParams;assert.equal(q.get('categoryId'),'');assert.equal(q.get('days'),'3');assert.equal(q.get('images'),'with');assert.equal(q.get('q'),'公开信息');assert.equal(q.get('sort'),'recommended');assert.equal(q.has('latitude'),false);assert.equal(c.page.data.radiusKm,0);assert.ok(c.page.data.filterNotice);
});

test('blank search exposes refinements and applying them executes the real scoped list',async()=>{
 const c=page('search');c.page.onLoad({cityCode:city});c.page.toggleAdvanced();assert.equal(c.page.data.advancedOpen,true);c.page.chooseDate({currentTarget:{dataset:{value:1}}});await c.page.applyAdvanced();
 const q=new URL(c.calls.at(-1).url,'http://test').searchParams;assert.equal(q.get('q'),'');assert.equal(q.get('days'),'1');assert.equal(q.get('cityCode'),city);assert.equal(c.page.data.searched,true);
});

test('fresh directed discovery clears previous refinements while an ordinary tab return keeps them',async()=>{
 const c=page('discover');await c.page.onShow();c.page.setData({q:'上一入口的词',type:'used',days:90,images:'with',radiusKm:5,sortCode:'distance'});
 c.app.globalData.browseEntry={...browse.common({type:'job',categoryId:'C02'}),fresh:true,hasRegion:false};c.app.globalData.exploreTarget='job';c.app.globalData.exploreCategoryTarget={id:'C02'};await c.page.onShow();
 assert.equal(c.page.data.q,'');assert.equal(c.page.data.days,0);assert.equal(c.page.data.images,'all');assert.equal(c.page.data.radiusKm,0);assert.equal(c.page.data.categoryId,'C02');assert.equal(c.page.data.districtCode,district);
 c.page.setData({days:3,images:'with'});await c.page.onShow();assert.equal(c.page.data.days,3);assert.equal(c.page.data.images,'with');
});

test('successful discovery search returns its complete current query but failed or stale responses never return context',async()=>{
 const c=page('search');c.page.onLoad({cityCode:city,fromDiscover:'1',q:'新查询',type:'event',days:3,categoryId:'C06'});await c.page.search(false);assert.equal(c.events.at(-1).name,'browseSearchApplied');assert.equal(c.events.at(-1).value.days,3);assert.equal(c.events.at(-1).value.q,'新查询');
 const d=page('search',async()=>{throw Error('offline');});d.page.onLoad({cityCode:city,fromDiscover:'1',q:'失败词'});await d.page.search(false);assert.equal(d.events.length,0);
 let done;const stale=page('search',()=>new Promise(r=>done=r));stale.page.onLoad({cityCode:city,fromDiscover:'1',q:'旧请求'});const work=stale.page.search(false);stale.page.input({detail:{value:'未提交新词'}});done({items:[]});await work;assert.equal(stale.events.length,0);assert.equal(stale.page.data.queryDirty,true);
});

test('discovery consumes successful search context without dropping its distance radius on list pagination',async()=>{
 const c=page('discover');await c.page.onShow();c.page.openSearch();const options=c.routes.at(-1)[3];options.events.browseSearchApplied({type:'service',categoryId:'C03',cityCode:city,districtCode:district,q:'保洁',days:1,images:'all',sort:'latest',radiusKm:5,latitude:23,longitude:113});await c.page.onShow();
 const q=new URL(c.calls.filter(x=>x.url?.startsWith('/api/v1/feed?')).at(-1).url,'http://test').searchParams;assert.equal(q.get('radiusKm'),'5');assert.equal(q.get('latitude'),'23');assert.equal(q.get('days'),'1');assert.equal(c.page.data.q,'保洁');
});

test('map carries the discovery channel and uses city listings only for channels without pins',async()=>{
 const c=page('map');
 c.page.onLoad({cityCode:city,type:'job',categoryId:'C02',districtCode:district,q:'招聘'});
 c.page.setData({cityCode:city,districtCode:district});
 c.page.ready=true;
 c.page.readMapRegion=async()=>{throw Error('city listing must not read the native map');};
 await c.page.searchArea();
 assert.equal(c.page.data.type,'job');
 assert.equal(c.page.data.spatial,false);
 const url=new URL(c.calls.at(-1).url,'http://test');
 assert.equal(url.pathname,'/api/v1/feed');
 for(const [k,v]of Object.entries({channel:'job',type:'all',cityCode:city,districtCode:district,categoryId:'C02',q:'招聘'}))assert.equal(url.searchParams.get(k),v);
 assert.equal(url.searchParams.has('west'),false);
 assert.equal(c.page.data.markers.length,0);
 await c.page.openSearch();
 assert.equal(c.routes.at(-1)[3].fromDiscover,true);
 c.page.changeType({detail:{type:'event'}});
 assert.equal(c.page.data.type,'event');
 assert.equal(c.page.data.categoryId,'');
 const s=page('search');s.page.onLoad({cityCode:city,fromMap:'1',...box});
 assert.deepEqual(Array.from(s.page.data.types,x=>x.id),['all','merchant','service']);
 s.page.chooseCity();assert.equal(s.events.at(-1).name,'mapChooseCity');assert.equal(s.routes.at(-1),'back');
});

test('returning from citywide map search keeps the latest district and channel filters after changing city',async()=>{
 const c=page('map');
 c.page.onLoad({type:'job',cityCode:city});
 await c.page.onShow();
 const next=geo.findCity('310100');
 const first=next.districts[0].code,second=next.districts[1].code;
 c.store.set('city_life_browse_city',{cityCode:next.code,districtCode:first});
 c.page.applySearchContext({cityCode:next.code,districtCode:first,type:'housing',categoryId:'C05',q:'第一次'});
 c.page.applySearchContext({cityCode:next.code,districtCode:second,type:'housing',categoryId:'C05',q:'第二次',sort:'price_low'});
 await c.page.onShow();
 assert.equal(c.page.data.cityCode,next.code);
 assert.equal(c.page.data.districtCode,second);
 assert.equal(c.page.data.q,'第二次');
 assert.equal(c.page.data.categoryId,'C05');
 assert.equal(c.page.data.filters.sort,'price_low');
});

test('map range failures stay in the pinned channel and never request the city feed',async()=>{
 const c=page('map');
 c.page.onLoad({type:'merchant',cityCode:city});
 c.page.setData({cityCode:city});
 c.page.ready=true;
 c.page.readMapRegion=async()=>{throw Object.assign(Error('invalid range'),{code:'MAP_REGION_UNAVAILABLE'});};
 await c.page.searchArea();
 assert.equal(c.calls.length,0);
 assert.equal(c.page.data.mapUnavailable,true);
 await c.page.toggleMapMode();
 assert.equal(c.page.data.spatial,false);
 assert.equal(c.page.data.mapUnavailable,false);
 const url=new URL(c.calls.at(-1).url,'http://test');
 assert.equal(url.pathname,'/api/v1/feed');
 assert.equal(url.searchParams.get('channel'),'merchant');
 assert.equal(url.searchParams.get('cityCode'),city);
 assert.equal(url.searchParams.get('publicOnly'),'1');
});

test('map result clusters separate as users zoom in and expose all overlapping points at maximum zoom',()=>{
 const pins=[
  {id:'a',title:'一',latitude:23,longitude:113,type:'service'},
  {id:'b',title:'二',latitude:23,longitude:113,type:'service'},
  {id:'c',title:'三',latitude:23,longitude:113.001,type:'service'}
 ];
 const {markers}=require('../../miniprogram/utils/map-markers');
 assert.equal(markers(pins,11).markers.length,1);
 assert.equal(markers(pins,18).markers.length,2);
 const {page:map}=page('map');
 map.setData({items:pins,scale:18});
 map.renderMarkers();
 map.markerTap({detail:{markerId:map.data.markers[0].id}});
 assert.deepEqual(Array.from(map.data.clusterItems,item=>item.id),['a','b']);
 assert.equal(map.data.selectedId,'a');
 map.clearCluster();
 assert.equal(map.data.clusterItems.length,0);
});

test('map positioning stays on the same browsing city and ignores late coordinates after leaving',async()=>{
 const c=page('map');
 c.page.onLoad({type:'merchant',cityCode:city});
 await c.page.onShow();
 const before=c.page.data.latitude;
 let finishLocation;
 c.wx.getLocation=({success})=>{finishLocation=success;};
 const pending=c.page.locateHere();
 assert.equal(c.page.data.locating,true);
 c.page.onHide();
 finishLocation({latitude:22.98,longitude:113.7});
 await pending;
 assert.equal(c.page.data.latitude,before);
 assert.equal(c.page.data.locating,false);
 await c.page.onShow();
 c.wx.getLocation=({success})=>success({latitude:22.98,longitude:113.7});
 await c.page.locateHere();
 assert.equal(c.page.data.cityCode,city);
 assert.equal(c.page.data.latitude,22.98);
 assert.equal(c.page.data.scale,14);
 assert.equal(c.calls.length,0);
});

test('search category and district edits run only after confirmation',async()=>{
 const c=page('search');
 c.page.onLoad({type:'job',cityCode:city});
 c.page.toggleAdvanced();
 c.page.draftCategory({detail:{categoryId:'C02'}});
 c.page.draftDistrict({detail:{districtCode:district}});
 assert.equal(c.calls.length,0);
 c.page.closeAdvanced();
 assert.equal(c.page.data.categoryId,'');
 c.page.toggleAdvanced();
 c.page.draftCategory({detail:{categoryId:'C02'}});
 c.page.draftDistrict({detail:{districtCode:district}});
 await c.page.applyAdvanced();
 const query=new URL(c.calls.at(-1).url,'http://test').searchParams;
 assert.equal(query.get('categoryId'),'C02');
 assert.equal(query.get('districtCode'),district);
});

test('housing prices follow the selected rental or sale intent in search and map',async()=>{
 for(const name of ['search','map']){
  const c=page(name);
  c.page.onLoad({type:'housing',cityCode:city});
  c.page.setData({cityCode:city});
  c.page.ready=true;
  if(name==='search')c.page.toggleAdvanced();else c.page.openFilters();
  const select=(key,value)=>c.page.chooseBusinessFilter({currentTarget:{dataset:{key,value}}});
  select('price','lt1000');
  assert.equal(c.page.data.draftRefinements.price,undefined);
  select('intent','出租');
  select('price','lt1000');
  assert.equal(c.page.data.draftRefinements.price,'lt1000');
  select('intent','出售');
  assert.equal(c.page.data.draftRefinements.price,undefined);
  select('price','lt300k');
  if(name==='search')await c.page.applyAdvanced();else await c.page.applyFilters();
  const query=new URL(c.calls.at(-1).url,'http://test').searchParams;
  assert.equal(query.get('refinements'),JSON.stringify({intent:'出售',price:'lt300k'}));
 }
});

test('funeral services contain the memorial entry even when public browsing is closed',()=>{
 const c=page('publish');
 assert.equal(c.page.data.memorialPublic,false);
 c.page.selectCategory({currentTarget:{dataset:{id:'C23'}}});
 assert.equal(c.page.data.selectedCategory,'C23');
 assert.equal(c.page.data.expandedGroupId,'');
 c.page.openMemorial();
 assert.equal(c.routes.at(-1),'/pages/memorial/index');
 const markup=fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/publish/index.wxml'),'utf8');
 const projectColumn=markup.indexOf('<view class="project-column"');
 assert.ok(projectColumn>0);
 assert.doesNotMatch(markup.slice(0,projectColumn),/class="memorial-access"/);
 assert.match(markup.slice(projectColumn),/class="project-group-section"[\s\S]+<button wx:if="{{selectedCategory==='C23'}}" class="memorial-access" bindtap="openMemorial"[\s\S]+?<\/button>\s*<\/scroll-view>/);
});

test('time memories reads only the signed-in account list and omits deleted halls',async()=>{
 const c=page('memorial',async(_,url)=>{
  if(url==='/api/v1/config')return {features:{memorialPublic:false}};
  assert.equal(url,'/api/v1/memorial/me/halls');
  return {items:[{id:'visible',status:'draft',payload:{name:'样例纪念馆',memories:'样例回忆'}},{id:'deleted',status:'deleted',payload:{}}],hasMore:false};
 });
 c.page.openMemories();
 assert.equal(c.routes.at(-1),'/pages/memorial/index?mode=memories');
 c.page.onLoad({mode:'memories'});
 await c.page.onShow();
 assert.equal(c.page.data.pageTitle,'时光回忆');
 assert.equal(c.page.data.items.length,1);
 assert.equal(c.page.data.items[0].payload.memories,'样例回忆');
 c.store.delete('city_life_v2_auth_token');
 c.api.login=async()=>{};
 await c.page.load();
 assert.equal(c.page.data.privateLocked,true);
 assert.equal(c.calls.filter(call=>call.url==='/api/v1/memorial/me/halls').length,1);
});

test('About and verified public contacts are available signed out and account logout requires confirmation',async()=>{
 const c=page('me');
 c.page.owner='owner:token';
 c.page.openAccount();
 c.page.signout();
 await c.modals[0].success({confirm:false});
 assert.equal(c.api.hasSession(),true);
 c.page.signout();
 await c.modals[1].success({confirm:true});
 assert.equal(c.calls[0].url,'/api/v1/auth/logout');
 assert.equal(c.page.data.mode,'main');
 assert.equal(c.page.data.hasSession,false);
 c.page.openHelp();
 c.page.showAbout();
 await c.page.refresh();
 assert.equal(c.page.data.mode,'about');
 for(const kind of ['website','email'])c.page.copySupportContact({currentTarget:{dataset:{kind}}});
 assert.deepEqual(c.calls.slice(-2).map(x=>x.clipboard),['https://dgqfl.xyz/','chenjun@qingfanglai.cn']);
 await c.page.back();
 assert.equal(c.page.data.mode,'help');
});

test('identical search return does not invalidate loaded discovery pages or force a refresh',async()=>{
 const c=page('discover');await c.page.onShow();c.page.setData({page:3,filtered:[{id:'retained'}]});c.page.openSearch();const opts=c.routes.at(-1)[3];opts.events.browseSearchApplied({...browse.common({...c.page.data,sort:c.page.data.sortCode}),radiusKm:0});assert.equal(c.page.searchPending,false);await c.page.onShow();assert.equal(c.page.data.page,3);assert.equal(c.page.data.filtered[0].id,'retained');
});
