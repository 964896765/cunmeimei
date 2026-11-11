'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Lifecycle/fault tests run page source with controlled network timing. These are
// not a substitute for the actual WeChat rendering and PostgreSQL checks.
function client(name, request, session = true) {
 const storage = new Map([['city_life_v2_auth_token', session ? 'test-session' : '']]);
 const app = {globalData: {exploreTarget: ''}};
 const timers = new Map(),routes=[];
 let definition, timerId = 0, locationRequest;
 const api = {online: () => true, hasSession: () => !!storage.get('city_life_v2_auth_token'), request, showError() {}};
 const sandbox = {
  Page(value) { definition = value; }, getApp: () => app,
  setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
  wx: {navigateTo:options=>routes.push(options.url),getLocation:options=>{locationRequest=options;},getStorageSync: key => storage.get(key) || '',setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key), setNavigationBarTitle() {}, showToast() {}, stopPullDownRefresh() {}},
  require(name) {
   if (name.endsWith('/public-cache')) return require('../../miniprogram/utils/public-cache');
   if (name.endsWith('/browse-query')) return require('../../miniprogram/utils/browse-query');
   if (name.endsWith('/auth-intent')) return {isReturning:()=>false};
   if (name.endsWith('/api')) return api;
   if (name.endsWith('/navigation')) return {search:(...args)=>routes.push(args),detail:id=>routes.push(id)};
   if (name.endsWith('/theme')) return {apply() {}};
   if (name.endsWith('/presentation')) return {item: item => ({...item, category: '测试分类'}),media:url=>url||''};
   if (name.endsWith('/map-filters')) return require('../../miniprogram/utils/map-filters');
   if (name.endsWith('/map-preview')) return require('../../miniprogram/utils/map-preview');
   if (name.endsWith('/geo-context')) return {current:()=>({cityCode:'',districtCode:'',label:'选择城市',...(storage.get('city_life_browse_city')||{})})};
   if (name.endsWith('/shortcuts')) return {load:()=>[],items:()=>[],pages:()=>[{id:'quick-0',items:[]}]};
   if (name.endsWith('/map-markers')) return require('../../miniprogram/utils/map-markers');
   if (name.endsWith('/business-templates')) return require('../../miniprogram/utils/business-templates');
   if (name.endsWith('/search-filters')) return require('../../miniprogram/utils/search-filters');
   if (name.endsWith('/feed-query')) return require('../../miniprogram/utils/feed-query');
   if (name.endsWith('/discovery-sorts')) return require('../../miniprogram/utils/discovery-sorts');
   if (name.endsWith('/tab-bar')) return {visibility(){}};
   if (name.endsWith('/route-query')) return require('../../miniprogram/utils/route-query');
   if (name.endsWith('/search-history')) return require('../../miniprogram/utils/search-history');
   if (name.endsWith('/geography')) return require('../../miniprogram/utils/geography');
   if (name.endsWith('/recent')) return {record(){}};
   if (name.endsWith('/classification')) return require('../../miniprogram/utils/classification');
   if (name.endsWith('/catalog')) return require('../../miniprogram/utils/catalog');
   if (name.endsWith('/region')) return {
    selected: areas => areas.includes(storage.get('area')) ? storage.get('area') : '全部地区',
    save: value => storage.set('area', value)
   };
   return {};
  }
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../miniprogram/pages', name, 'index.js'), 'utf8'), sandbox);
 const page = {data: structuredClone(definition.data), updates: 0, setData(update) { Object.assign(this.data, update); this.updates++; }};
 for (const [key, method] of Object.entries(definition)) if (typeof method === 'function') page[key] = method.bind(page);
 return {page, storage, app, timers,routes,gps:()=>locationRequest};
}
const row = id => ({id, type: 'used', kind: 'listing', title: '验收信息 ' + id});

test('merchant team account switch clears a previous write lock and ignores stale member responses', async () => {
 const pending=[];
 const {page,storage}=client('merchant-team',()=>new Promise(resolve=>pending.push(resolve)));
 storage.set('city_life_user_id','owner-a');page.onLoad({merchantId:'merchant'});page.onShow();
 page.setData({busy:true,targetUser:'previous-user',error:'previous error',canManage:true});
 storage.set('city_life_user_id','owner-b');page.onShow();
 assert.equal(page.data.busy,false);assert.equal(page.data.targetUser,'');assert.equal(page.data.error,'');assert.equal(page.data.canManage,false);
 pending[0]({items:[{userId:'owner-a',role:'owner',status:'active'}]});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.data.items.length,0);
 pending[1]({items:[{userId:'owner-b',role:'owner',status:'active'}]});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(page.data.canManage,true);assert.equal(page.data.loading,false);
});

test('map drawer accepts vertical drags, bounds its three states and ignores short movements',()=>{
 const {page}=client('map',async()=>({}));
 assert.equal(page.data.drawer,'half');page.setData({drawer:'collapsed',items:[{id:'public-one'}]});page.dragStart({touches:[{clientY:600}]});page.dragEnd({changedTouches:[{clientY:400}]});assert.equal(page.data.drawer,'half');
 page.dragStart({touches:[{clientY:600}]});page.dragEnd({changedTouches:[{clientY:400}]});assert.equal(page.data.drawer,'expanded');
 page.dragStart({touches:[{clientY:600}]});page.dragEnd({changedTouches:[{clientY:400}]});assert.equal(page.data.drawer,'expanded');
 page.dragStart({touches:[{clientY:400}]});page.dragEnd({changedTouches:[{clientY:600}]});assert.equal(page.data.drawer,'half');
 page.dragStart({touches:[{clientY:400}]});page.dragEnd({changedTouches:[{clientY:420}]});assert.equal(page.data.drawer,'half');
 page.dragStart({touches:[{clientY:400}]});page.dragEnd({changedTouches:[{clientY:600}]});assert.equal(page.data.drawer,'collapsed');
});

test('map defaults to half view, shares eight business channels and supports explicit search without implicit GPS',()=>{
 const {page}=client('map',async()=>({}));assert.equal(page.data.drawer,'half');
 page.dragStart({touches:[{clientY:600}]});page.dragEnd({changedTouches:[{clientY:300}]});assert.equal(page.data.drawer,'expanded');
 assert.equal(typeof page.openSearch,'function');assert.equal(page.data.channels.length,8);assert.equal(page.data.channels[0].name,'全部');assert.equal(page.data.channels[1].name,'招聘');assert.equal(page.data.moreChannels,undefined);assert.equal(page.locate,undefined);
});

test('map city switches immediately recenter and never query an old viewport response',async()=>{
 const requests=[],state=client('map',async(method,url)=>{requests.push(url);return {items:[]};}),{page,storage}=state;
 storage.set('city_life_browse_city',{cityCode:'310100',districtCode:'',label:'上海市'});page.onShow();assert.ok(page.data.latitude>31&&page.data.latitude<32);assert.ok(page.data.longitude>121&&page.data.longitude<122);
 let region;page.map={getRegion:options=>{region=options;}};page.ready=true;
 const pending=page.searchArea();storage.set('city_life_browse_city',{cityCode:'441900',districtCode:'',label:'东莞市'});page.onShow();
 region.success({southwest:{latitude:30,longitude:120},northeast:{latitude:32,longitude:122}});await pending;
 assert.equal(requests.length,0);assert.equal(page.data.cityCode,'441900');assert.ok(page.data.longitude>113&&page.data.longitude<114);assert.equal(page.data.drawer,'half');
 page.setData({items:[{id:'old-context'}],markers:[{id:1}]});storage.set('city_life_acceptance_mode',true);page.onShow();assert.equal(page.data.items.length,0);assert.equal(page.data.markers.length,0);
});

test('home retains the manually chosen city when configuration is offline',async()=>{
 const {page,storage}=client('home',async()=>{throw Error('offline');});storage.set('city_life_browse_city',{cityCode:'441900',label:'东莞市'});
 await page.onShow();assert.equal(page.data.region,'东莞市');assert.equal(page.data.error,'offline');
});

test('discovery industry targets preserve city, apply category to queries and survive map/detail round trips',async()=>{
 const requests=[],{page,app,storage,routes}=client('discover',async(method,url)=>{if(url.startsWith('/api/v1/me/saved-state?'))return {savedIds:[]};requests.push(url);return url.includes('/config')?{areas:['中心街道']}:{items:[row('in-industry')],pagination:{hasMore:false}};});
 storage.set('city_life_browse_city',{cityCode:'310100',districtCode:'310101',label:'上海市 · 黄浦区'});app.globalData.exploreTarget='all';app.globalData.exploreCategoryTarget={id:'C04'};await page.onShow();
 const first=new URL(requests.find(x=>x.includes('/feed')),'http://test');assert.equal(first.searchParams.get('categoryId'),'C04');assert.equal(first.searchParams.get('cityCode'),'310100');assert.equal(first.searchParams.get('districtCode'),'310101');assert.equal(page.data.categoryName,'二手闲置');assert.equal(page.data.type,'all');
 const count=requests.filter(x=>x.includes('/feed')).length;page.onHide();await page.onShow();assert.equal(requests.filter(x=>x.includes('/feed')).length,count);assert.equal(page.data.filtered[0].id,'in-industry');
 page.openMap();const mapQuery=new URL(routes.at(-1),'http://test');assert.equal(mapQuery.searchParams.get('categoryId'),'C04');assert.equal(page.data.categoryId,'C04');
 app.globalData.exploreTarget='all';app.globalData.exploreCategoryTarget={id:'C27'};await page.onShow();assert.equal(new URL(requests.at(-1),'http://test').searchParams.get('categoryId'),'C27');assert.equal(page.data.categoryName,'金融保险');
 app.globalData.exploreTarget='all';app.globalData.exploreCategoryTarget={id:''};await page.onShow();assert.equal(page.data.categoryId,'');
});

test('map gestures invalidate an older viewport response and synchronize native zoom for clusters',async()=>{
 const old=deferred();const {page}=client('map',()=>old.promise);page.version=1;page.bounds={west:112,east:114,south:22,north:24};page.setData({cityCode:'441900'});
 const pending=page.fetchPage(1,1);page.regionChanged({type:'end',detail:{causedBy:'scale',scale:16}});
 assert.equal(page.data.scale,16);assert.equal(page.data.dirty,true);assert.equal(page.data.loading,false);
 old.resolve({items:[{id:'old-map-point',latitude:23,longitude:113,type:'service'}]});await pending;
 assert.equal(page.data.items.length,0);assert.equal(page.data.dirty,true);
});

test('map channel switches cancel stale results and keep markers aligned to the new query',async()=>{
 const old=deferred();const {page}=client('map',()=>old.promise);page.version=1;page.bounds={west:112,east:114,south:22,north:24};page.setData({cityCode:'441900'});
 const pending=page.fetchPage(1,1);page.ready=true;page.map={getRegion:({success})=>success({southwest:{longitude:112,latitude:22},northeast:{longitude:114,latitude:24}})};
 const next=page.changeType({currentTarget:{dataset:{type:'merchant'}}});old.resolve({items:[{id:'old',latitude:23,longitude:113,type:'service'}]});await Promise.all([pending,next]);
 assert.equal(page.data.type,'merchant');assert.equal(page.data.loading,false);assert.equal(page.data.markers.length,page.data.items.length);
});

test('discovery context enters map and only explicitly applied filters replace results',async()=>{
 const d=client('discover',async()=>({}));d.page.setData({type:'service',q:'维修 & 保洁',sortCode:'latest',filtered:[row('retained')]});d.page.openMap();const url=new URL(d.routes.at(-1),'http://test');assert.equal(url.searchParams.get('q'),'维修 & 保洁');assert.equal(d.page.data.filtered[0].id,'retained');
 const c=client('map',async()=>({items:[],total:0}));c.page.onLoad(Object.fromEntries(url.searchParams));assert.equal(c.page.data.type,'service');assert.equal(c.page.data.q,'维修 & 保洁');
 c.page.openFilters();c.page.chooseFilter({currentTarget:{dataset:{key:'days',value:7}}});assert.equal(c.page.data.filters.days,0);c.page.closeFilters();assert.equal(c.page.data.filters.days,0);
 c.page.openFilters();c.page.chooseFilter({currentTarget:{dataset:{key:'days',value:30}}});await c.page.applyFilters();assert.equal(c.page.data.filters.days,30);assert.equal(c.page.data.filterOpen,false);
 c.page.selectRow({currentTarget:{dataset:{id:'public-id'}}});assert.equal(c.routes.at(-1),'public-id');
});

test('coincident map points at maximum zoom expose their information rows instead of a zoom dead end',()=>{
 const {page}=client('map',async()=>({}));page.setData({scale:18,items:[{id:'one',latitude:23,longitude:113,type:'service',title:'one'},{id:'two',latitude:23,longitude:113,type:'service',title:'two'}]});page.renderMarkers();page.markerTap({detail:{markerId:1}});
 assert.equal(page.data.scale,18);assert.equal(page.data.drawer,'half');assert.equal(page.data.selectedId,'one');assert.equal(page.data.items.length,2);
});
const feed = (ids, hasMore = false) => ({items: ids.map(row), pagination: {hasMore}});
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; }

test('detail initial lifecycle and overlapping reload share one public request', async () => {
 const pending = deferred(), requests = [];
 const {page} = client('detail', async (method, url) => {
  requests.push(url); return url.endsWith('/saved') ? {saved: false} : pending.promise;
 });
 page.onLoad({id: 'one'});
 const opening = page.onShow();
 assert.equal(requests.length, 1);
 assert.equal(page.refresh(), opening);
 pending.resolve({item: row('one')});
 await opening;
 assert.equal(requests.filter(url => !url.endsWith('/saved')).length, 1);
 assert.equal(page.data.item.id, 'one');
 assert.equal(page.data.favoriteReady, true);
});

test('failed favorite state preserves detail and blocks ambiguous mutation until retry succeeds', async () => {
 let failing = true;
 const mutations = [];
 const {page} = client('detail', async (method, url) => {
  if (!url.endsWith('/saved')) return {item: row('one')};
  if (method !== 'GET') { mutations.push(method); return {saved: false}; }
  if (failing) throw Error('temporary saved failure');
  return {saved: true};
 });
 page.onLoad({id: 'one'}); await page.onShow();
 assert.equal(page.data.item.id, 'one'); assert.equal(page.data.error, '');
 assert.ok(page.data.favoriteError); assert.equal(page.data.favoriteReady, false);
 await page.toggleFavorite(); assert.equal(mutations.length, 0);
 failing = false; await page.retryFavorite();
 assert.equal(page.data.favoriteError, ''); assert.equal(page.data.faved, true);
 await page.toggleFavorite(); assert.deepEqual(mutations, ['DELETE']);
});

test('public detail denial clears old content instead of retaining an unavailable record', async () => {
 let unavailable = false;
 const {page} = client('detail', async () => {
  if (unavailable) throw Error('信息已下架');
  return {item: row('one')};
 }, false);
 page.onLoad({id: 'one'}); await page.onShow(); unavailable = true; await page.onShow();
 assert.equal(page.data.item, null); assert.match(page.data.error, /下架/);
 const invalid = client('detail', async () => { throw Error('invalid ID must not request'); }, false).page;
 invalid.onLoad({}); await invalid.onShow();
 assert.equal(invalid.data.loading, false); assert.match(invalid.data.error, /缺少信息标识/);
});

test('community failure keeps the article and typed comment, and has a separate recovery path', async () => {
 let failing = true;
 const {page} = client('detail', async (method, url) => {
  if (url.endsWith('/interaction')) {
   if (failing) throw Error('temporary interaction failure');
   return {comments: [{id: 'comment-one', body: '真实留言'}], likes: 1, hasMore: false};
  }
  return {item: {...row('one'), type: 'community'}};
 }, false);
 page.onLoad({id: 'one'}); page.setData({comment: '保留尚未提交的文字'}); await page.onShow();
 assert.equal(page.data.item.id, 'one'); assert.ok(page.data.interactionError);
 assert.equal(page.data.comment, '保留尚未提交的文字');
 failing = false; await page.loadInteractions();
 assert.equal(page.data.interactionError, ''); assert.equal(page.data.comments.length, 1);
});

test('detail re-entry during a favorite mutation or retry never leaves its action permanently disabled', async () => {
 const mutation = deferred(), retry = deferred(); let deferSaved = false;
 const {page} = client('detail', async (method, url) => {
  if (!url.endsWith('/saved')) return {item: row('one')};
  if (method !== 'GET') return mutation.promise;
  if (deferSaved) { deferSaved = false; return retry.promise; }
  return {saved: false};
 });
 page.onLoad({id: 'one'}); await page.onShow();
 const saving = page.toggleFavorite(); await page.onShow();
 mutation.resolve({saved: true}); await saving;
 assert.equal(page.data.favoriteReady, true); assert.equal(page.data.saving, false);
 deferSaved = true; const retrying = page.retryFavorite(); await page.onShow();
 retry.resolve({saved: true}); await retrying;
 assert.equal(page.data.favoriteReady, true); assert.equal(page.data.favoriteLoading, false);
 assert.equal(page.data.faved, false, 'late retry cannot overwrite a newer status response');
});

test('discover return preserves loaded pages and avoids repeated config/feed requests', async () => {
 const requests = [];
 const {page} = client('discover', async (method, url) => {
  requests.push(url); if (url === '/api/v1/config') return {areas: ['中心街道']};
  return new URL(url, 'http://local').searchParams.get('page') === '2' ? feed(['two']) : feed(['one'], true);
 });
 await page.onShow(); await page.loadMore();
 const count = requests.length; page.onHide(); await page.onShow();
 assert.equal(requests.length, count);
 assert.equal(page.data.page, 2); assert.equal(page.data.filtered.length, 2);
});

test('discover retries the failed page, and a failed first-page refresh keeps current rows', async () => {
 const pages = []; let failPage = 2;
 const {page} = client('discover', async (method, url) => {
  if (url === '/api/v1/config') return {areas: []};
  if (url.startsWith('/api/v1/me/saved-state?')) return {savedIds: []};
  const number = Number(new URL(url, 'http://local').searchParams.get('page')); pages.push(number);
  if (number === failPage) throw Error('network interrupted');
  return feed(number === 1 ? ['one'] : ['two'], true);
 });
 await page.onShow(); await page.loadMore();
 assert.equal(page.data.filtered.length, 1);
 failPage = 0; await page.retry(); assert.equal(page.data.page, 2);
 failPage = 1; await page.filter();
 assert.equal(page.data.filtered.length, 2); assert.equal(page.data.page, 2);
 failPage = 0; await page.retry();
 assert.equal(page.data.page, 1); assert.equal(page.data.filtered.length, 1);
 assert.deepEqual(pages, [1, 2, 2, 1, 1]);
});

test('discover pending search resumes after return and ignores an older response', async () => {
 const old = deferred(); const queries = [];
 const {page, timers} = client('discover', async (method, url) => {
  if (url === '/api/v1/config') return {areas: []};
  if (url.startsWith('/api/v1/me/saved-state?')) return {savedIds: []};
  const q = new URL(url, 'http://local').searchParams.get('q'); queries.push(q);
  return q === '旧搜索' ? old.promise : feed([q || 'initial']);
 });
 await page.onShow(); page.setData({q: '旧搜索'}); const stale = page.filter();
 page.inputSearch({detail: {value: '新搜索'}}); page.onHide();
 assert.equal(timers.size, 0); await page.onShow();
 old.resolve(feed(['obsolete'])); await stale;
 assert.equal(page.data.filtered[0].id, '新搜索'); assert.equal(page.data.loading, false);
 assert.deepEqual(queries, ['', '旧搜索', '新搜索']);
});

test('discover config retry revalidates areas and retains the intended category', async () => {
 let failing = true; let configCalls = 0; const types = [];
 const {page, app} = client('discover', async (method, url) => {
  if (url === '/api/v1/config') { configCalls++; if (failing) throw Error('config offline'); return {areas: ['中心街道']}; }
  types.push(new URL(url, 'http://local').searchParams.get('type')); return feed([]);
 });
 app.globalData.exploreTarget = 'housing'; await page.onShow();
 assert.ok(page.data.error); failing = false; await page.retry();
 assert.equal(configCalls, 2); assert.deepEqual(types, ['housing']); assert.equal(page.data.error, '');
});

test('discover account/test-context change clears old rows before the replacement response', async () => {
 let wait = false; const pending = deferred();
 const {page, storage} = client('discover', async (method, url) => {
  if (url === '/api/v1/config') return {areas: []};
  return wait ? pending.promise : feed(['old-context']);
 });
 await page.onShow(); wait = true;
 storage.set('city_life_acceptance_mode', true); const changing = page.onShow();
 assert.equal(page.data.filtered.length, 0);
 pending.resolve(feed(['new-context'])); await changing;
 assert.equal(page.data.filtered[0].id, 'new-context');
});

test('changed region and navigation category refresh discovery instead of reusing old results', async () => {
 const queries = [];
 const {page, storage, app} = client('discover', async (method, url) => {
  if (url === '/api/v1/config') return {areas: ['中心街道']};
  const params = new URL(url, 'http://local').searchParams;
  queries.push([params.get('area'), params.get('type')]); return feed([]);
 });
 await page.onShow(); storage.set('area', '中心街道'); await page.onShow();
 app.globalData.exploreTarget = 'housing'; await page.onShow();
 assert.deepEqual(queries, [['全部地区', 'all'], ['中心街道', 'all'], ['中心街道', 'housing']]);
});

test('unloaded detail and discovery pages ignore late network results', async () => {
 for (const name of ['detail', 'discover']) {
  const pending = deferred();
  const {page} = client(name, async () => pending.promise, false);
  if (name === 'detail') page.onLoad({id: 'one'});
  const loading = page.onShow(); page.onUnload(); const updates = page.updates;
  pending.resolve(name === 'detail' ? {item: row('one')} : {areas: []}); await loading;
  assert.equal(page.updates, updates, name + ' must not update after unload');
 }
});

test('search refresh retains its local region and decodes Chinese navigation query once', async () => {
 const queries=[];
 const {page}=client('search',async(method,url)=>{
  if(url==='/api/v1/config')return {areas:['中心街道','北区']};
  queries.push(new URL(url,'http://local').searchParams);return feed(['one']);
 });
 page.onLoad({q:encodeURIComponent('家电维修'),area:encodeURIComponent('中心街道')});
 await page.onShow();page.setData({area:'北区'});await page.onPullDownRefresh();
 assert.equal(queries[0].get('q'),'家电维修');assert.equal(queries[0].get('area'),'中心街道');
 assert.equal(queries[1].get('area'),'北区');assert.equal(page.data.area,'北区');
});

test('unified search starts idle with only real popular terms, and rejects a late result after typing',async()=>{
 const pending=deferred(),queries=[];
 const {page,storage}=client('search',async(method,url)=>{
  queries.push(url);if(url==='/api/v1/config')return {areas:[]};
  if(url.startsWith('/api/v1/search/popular'))return {items:[]};
  if(url.includes('pageSize=3'))return feed([]);
  if(method==='POST')return {recorded:false};
  return pending.promise;
 });
 storage.set('city_life_browse_city',{cityCode:'441900',label:'东莞市'});
 page.onLoad({});await page.onShow();assert.equal(page.data.searched,false);assert.equal(page.data.featured,undefined);assert.equal(page.data.popularTerms.length,0);
 assert.equal(queries.filter(x=>x.startsWith('/api/v1/feed')).length,0);
 page.input({detail:{value:'家电维修'}});assert.equal(page.data.searched,false);
 const search=page.search();page.input({detail:{value:'新关键词'}});pending.resolve(feed(['stale']));await search;
 assert.equal(page.data.items.length,0);assert.equal(page.data.q,'新关键词');assert.equal(page.data.loading,false);
 assert.ok(storage.get('city_life_search_history_guest').includes('家电维修'));
 storage.set('city_life_user_id','another-account');await page.onShow();assert.equal(page.data.recentTerms.length,0);
});

test('recent search records deduplicate, cap history, and exclude sensitive or identifying queries',()=>{
 const history=require('../../miniprogram/utils/search-history');
 assert.deepEqual(history.add(['保洁','租房'],'保洁'),['保洁','租房']);
 for(const term of ['孕检','殡葬','电话13800138000','住址一单元','person@example.com'])assert.equal(history.safe(term),false);
 assert.equal(history.list(Array.from({length:20},(_,i)=>'词'+String.fromCharCode(65+i))).length,10);
});

test('a late distance-sort location cannot override a subsequent channel selection',async()=>{
 const c=client('search',async()=>({items:[],pagination:{hasMore:false}}));c.page.onLoad({cityCode:'441900',type:'service',q:'保洁'});
 const index=c.page.data.sortOptions.findIndex(x=>x.code==='distance'),pending=c.page.chooseSort({detail:{value:index}});assert.ok(c.gps());
 await c.page.changeType({detail:{value:c.page.data.types.findIndex(x=>x.id==='job')}});c.gps().success({latitude:23,longitude:113});await pending;assert.equal(c.page.data.type,'job');assert.notEqual(c.page.data.sort,'distance');assert.notEqual(c.page.data.latitude,23);
});

test('search region picker follows the browsing district and its current selected index',async()=>{
 const {page,storage}=client('search',async(method,url)=>url==='/api/v1/config'?{areas:[]}:{items:[],pagination:{hasMore:false}});
 storage.set('city_life_browse_city',{cityCode:'441900',districtCode:'441900004',label:'东莞市 · 南城街道'});
 page.onLoad({});await page.onShow();assert.equal(page.data.area,'南城街道');assert.equal(page.data.areas[page.data.areaIndex],'南城街道');
 await page.changeArea({detail:{value:0}});assert.equal(page.data.area,'全部地区');assert.equal(page.data.districtCode,'');assert.equal(page.data.areaIndex,0);
 storage.set('city_life_browse_city',{cityCode:'441900',districtCode:'441900003',label:'东莞市 · 东城街道'});
 await page.onShow();assert.equal(page.data.area,'东城街道');assert.equal(page.data.areas[page.data.areaIndex],'东城街道');
});

test('advanced search applies time and verified distance together, only on Apply, and resets unsupported radius',async()=>{
 const requests=[],state=client('search',async(method,url)=>{requests.push(url);return {items:[],pagination:{hasMore:false}};}),{page}=state;
 page.setData({cityCode:'441900',areas:['全部地区','南城街道'],q:'保洁',submittedQ:'保洁',searched:true,type:'service',canFilterDistance:true});page.toggleAdvanced();
 page.chooseDate({currentTarget:{dataset:{value:7}}});page.chooseRadius({currentTarget:{dataset:{value:50}}});assert.equal(requests.length,0);assert.equal(page.data.days,0);
 const applying=page.applyAdvanced();assert.equal(page.data.filterBusy,true);state.gps().success({latitude:23,longitude:113});await applying;
 const query=new URL(requests.at(-1),'http://test').searchParams;assert.equal(query.get('days'),'7');assert.equal(query.get('radiusKm'),'50');assert.equal(query.get('latitude'),'23');assert.equal(page.data.advancedOpen,false);
 const goods=page.data.types.findIndex(x=>x.id==='used');await page.changeType({detail:{value:goods}});assert.equal(page.data.radiusKm,0);assert.equal(page.data.days,7);assert.ok(page.data.filterNotice);assert.ok(!requests.at(-1).includes('latitude='));
 assert.equal(page.data.types.length,8);assert.equal(new Set(page.data.types.slice(1).map(x=>x.id)).size,7);
});

test('advanced search handles GPS denial and ignores GPS after close/hide without silently searching all distances',async()=>{
 const queries=[],a=client('search',async(method,url)=>{queries.push(url);return {items:[]};});
 a.page.setData({q:'保洁',submittedQ:'保洁',searched:true,type:'service',canFilterDistance:true});
 a.page.toggleAdvanced();a.page.chooseRadius({currentTarget:{dataset:{value:50}}});const denied=a.page.applyAdvanced();a.gps().fail();await denied;
 assert.ok(a.page.data.filterError);assert.equal(a.page.data.radiusKm,0);assert.equal(queries.length,0);
 a.page.closeAdvanced();a.page.toggleAdvanced();a.page.chooseRadius({currentTarget:{dataset:{value:50}}});const closed=a.page.applyAdvanced();a.page.onHide();a.gps().success({latitude:23,longitude:113});await closed;assert.equal(queries.length,0);assert.equal(a.page.data.radiusKm,0);
});

test('category-scoped browsing works without a keyword, and resetting keeps a submitted keyword and city',async()=>{
 const queries=[],{page}=client('search',async(method,url)=>{if(method==='GET')queries.push(new URL(url,'http://test').searchParams);return feed([]);});
 page.onLoad({type:'used',categoryId:'C04',q:'   '});assert.equal(page.data.searched,true);
 await page.search();assert.equal(queries.length,1);assert.equal(queries[0].get('categoryId'),'C04');
 page.setData({q:'  二手手机  ',cityCode:'310100'});await page.search();assert.equal(page.data.submittedQ,'二手手机');
 const firstAnchor=page.data.scrollAnchor;await page.chooseSort({detail:{value:1}});
 assert.equal(queries.at(-1).get('q'),'二手手机');assert.notEqual(page.data.scrollAnchor,firstAnchor);
 page.toggleAdvanced();page.chooseDate({currentTarget:{dataset:{value:7}}});page.chooseImages({currentTarget:{dataset:{value:'with'}}});
 const before=queries.length;page.closeAdvanced();assert.equal(queries.length,before);assert.equal(page.data.days,0);assert.equal(page.data.images,'all');
 page.toggleAdvanced();page.chooseImages({currentTarget:{dataset:{value:'with'}}});await page.applyAdvanced();
 assert.equal(queries.at(-1).get('images'),'with');assert.equal(queries.at(-1).get('q'),'二手手机');
 await page.clear();assert.equal(page.data.q,'二手手机');assert.equal(page.data.submittedQ,'二手手机');assert.equal(page.data.searched,true);
 assert.equal(queries.at(-1).get('cityCode'),'310100');assert.equal(queries.at(-1).get('q'),'二手手机');assert.equal(queries.at(-1).get('images'),null);assert.equal(page.data.categoryId,'');
});

test('search retries a failed next page without dropping prior results or the submitted keyword',async()=>{
 let fail=true;const queries=[],{page}=client('search',async(method,url)=>{const query=new URL(url,'http://test').searchParams;queries.push(query);if(query.get('page')==='2'&&fail)throw Error('网络暂时不可用');return feed(query.get('page')==='2'?['second']:['first'],query.get('page')==='1');});
 page.onLoad({q:'维修'});page.initialized=true;await page.search(false);await page.more();assert.equal(page.data.error,'网络暂时不可用');assert.equal(page.data.items[0].id,'first');
 fail=false;await page.retry();assert.deepEqual(Array.from(page.data.items,x=>x.id),['first','second']);assert.equal(queries.at(-1).get('page'),'2');assert.equal(queries.at(-1).get('q'),'维修');assert.equal(page.data.error,'');
});

test('search clears another account or test context immediately and rejects its late response', async () => {
 const old=deferred(),fresh=deferred();let calls=0;
 const {page,storage}=client('search',async(method,url)=>{
  if(url==='/api/v1/config')return {areas:[]};
  calls++;return calls===1?feed(['old']):calls===2?old.promise:fresh.promise;
 });
 page.onLoad({q:'家电维修'});await page.onShow();const pending=page.search();
 storage.set('city_life_v2_auth_token','different-session');const changing=page.onShow();
 assert.equal(page.data.items.length,0);old.resolve(feed(['stale']));await pending;
 assert.equal(page.data.items.length,0);fresh.resolve(feed(['fresh']));await changing;
 assert.equal(page.data.items[0].id,'fresh');
});

test('search unload and newer configuration refresh reject late configuration results', async () => {
 const config=deferred();let calls=0;
 const {page}=client('search',async(method,url)=>{
  if(url==='/api/v1/config')return ++calls===1?config.promise:{areas:['北区']};
  return feed(['fresh']);
 });
 page.onLoad({});const older=page.onShow();await page.initialize();
 config.resolve({areas:['旧地区']});await older;
 assert.equal(page.data.areas.includes('旧地区'),false);
 const late=deferred();const other=client('search',()=>late.promise).page;
 other.onLoad({});const pending=other.onShow();other.onUnload();const updates=other.updates;
 late.resolve({areas:['旧地区']});await pending;assert.equal(other.updates,updates);
});
