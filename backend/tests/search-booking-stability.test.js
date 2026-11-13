'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function client(name){
 const storage=new Map([['city_life_user_id','one'],['city_life_v2_auth_token','token-one']]),calls=[],modals=[],toasts=[];let definition,gps;
 const faults={read:false,write:false,remove:false};
 const wx={getStorageSync:key=>{if(faults.read&&key.startsWith('city_life_search_history_'))throw Error('storage unavailable');return storage.get(key)||'';},setStorageSync:(key,v)=>{if(faults.write)throw Error('storage quota');storage.set(key,v);},removeStorageSync:key=>{if(faults.remove)throw Error('storage unavailable');storage.delete(key);},showModal:o=>modals.push(o),showToast:o=>toasts.push(o.title),getLocation:o=>gps=o,stopPullDownRefresh(){}};
 const api={online:()=>true,hasSession:()=>true,login:async()=>{},request:async(method,url,data,auth,owner)=>{calls.push({method,url,data,auth,owner});return url==='/api/v1/config'?{areas:['中心街道']}:{items:[],pagination:{hasMore:false}};},showError:e=>toasts.push(e.message)};
 const geo={current:()=>({cityCode:'',districtCode:'',label:'选择城市',...(storage.get('city_life_browse_city')||{})})};
 const sandbox={Page:o=>definition=o,wx,getApp:()=>({globalData:{}}),setTimeout,clearTimeout,require:p=>p.endsWith('/booking-pending')?require('./client-booking-store')(wx):p.endsWith('/api')?api:p.endsWith('/theme')?{apply(){}}:p.endsWith('/geo-context')?geo:p.endsWith('/presentation')?{item:r=>r}:p.endsWith('/region')?{selected:()=> '全部地区',save(){}}:p.endsWith('/tab-bar')?{visibility(){}}:p.endsWith('/navigation')?{}:p.endsWith('/storage')?{}:require(path.resolve(__dirname,'../../miniprogram/utils',p.split('/').at(-1)))};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages',name,'index.js'),'utf8'),sandbox);
 const page={data:structuredClone(definition.data),updates:0,setData(v){Object.assign(this.data,v);this.updates++;}};for(const [key,value]of Object.entries(definition))if(typeof value==='function')page[key]=value.bind(page);
 if(name==='search'){page.onLoad({q:'维修'});page.initialized=true;page.version=1;}
 if(name==='discover'){page.active=true;page.reqVersion=1;}
 return {page,api,storage,calls,modals,toasts,faults,gps:()=>gps,switchOwner(){storage.set('city_life_user_id','two');storage.set('city_life_v2_auth_token','token-two');}};
}
const feed=id=>({items:[{id,title:'本地测试信息',type:'service'}],pagination:{hasMore:false}});
test('expired sessions cannot read or append to the previous account search history',async()=>{
 const c=client('search');c.storage.set('city_life_search_history_one',['维修']);c.api.hasSession=()=>false;c.page.loadRecent();assert.equal(c.page.data.recentTerms.length,0);c.page.setData({q:'快递'});await c.page.search();assert.deepEqual(c.storage.get('city_life_search_history_one'),['维修']);assert.equal(c.storage.get('city_life_search_history_guest')[0],'快递');
});
test('discovery hydrates the actual saved state when rendering an existing bookmark',async()=>{
 const c=client('discover');c.page.reqVersion=1;c.api.request=async(m,u)=>u.includes('saved-state')?{savedIds:['saved-item']}:feed('saved-item');await c.page.fetchPage(1,1);await tick();assert.equal(c.page.data.filtered[0].isSaved,true);assert.equal(c.page.data.filtered[0].favoriteKnown,true);
});
test('uncertain favorite mutations require a read before another mutation',async()=>{
 const c=client('discover');c.page.reqVersion=1;c.page.data.filtered=[{id:'item',favoriteKnown:true,isSaved:false}];let posts=0;
 c.api.request=async(m,u)=>{if(m==='PUT'){posts++;throw Error('lost response');}return {savedIds:['item']};};await c.page.toggleSaved({detail:{id:'item'}});assert.equal(c.page.data.filtered[0].favoriteKnown,false);await c.page.toggleSaved({detail:{id:'item'}});assert.equal(posts,1);assert.equal(c.page.data.filtered[0].isSaved,true);
});
test('a stale saved-state read cannot overwrite an acknowledged favorite mutation',async()=>{
 const c=client('discover'),gate=deferred();c.page.reqVersion=1;c.page.data.filtered=[{id:'item',favoriteKnown:true,isSaved:false}];c.api.request=async(m,u)=>m==='GET'?gate.promise:{saved:true};
 const read=c.page.hydrateSaved(c.page.data.filtered,1,JSON.stringify(['','','one','token-one','']));
 await c.page.toggleSaved({detail:{id:'item'}});gate.resolve({savedIds:[]});assert.equal(await read,true);assert.equal(c.page.data.filtered[0].isSaved,true);
});
test('search-history confirmation never clears the newly selected account history',async()=>{
 const c=client('search');c.storage.set('city_life_search_history_one',['维修']);c.storage.set('city_life_search_history_two',['保洁']);c.page.clearHistory();c.switchOwner();await c.modals[0].success({confirm:true});assert.deepEqual(c.storage.get('city_life_search_history_two'),['保洁']);assert.deepEqual(c.storage.get('city_life_search_history_one'),['维修']);
});
test('search-history write failure never prevents fetching the submitted query',async()=>{
 const c=client('search');c.faults.write=true;await assert.doesNotReject(c.page.search());assert.ok(c.calls.some(x=>x.url.startsWith('/api/v1/feed?')));assert.ok(c.page.data.historyNotice);assert.equal(c.page.data.loading,false);
});
test('unavailable recent-history storage does not abort the search page lifecycle',async()=>{
 const c=client('search');c.faults.read=true;await assert.doesNotReject(c.page.onShow());assert.ok(c.page.data.historyNotice);assert.equal(c.page.data.loading,false);
});
test('failed search-history removal keeps recent terms and exposes a recoverable notice',async()=>{
 const c=client('search');c.page.data.recentTerms=['维修'];c.faults.remove=true;c.page.clearHistory();await assert.doesNotReject(Promise.resolve().then(()=>c.modals[0].success({confirm:true})));assert.equal(c.page.data.recentTerms[0],'维修');assert.ok(c.page.data.historyNotice);
});
for(const name of ['search','discover'])test(name+' rejects a late feed after a session change before onShow runs',async()=>{
 const c=client(name),gate=deferred();c.api.request=()=>gate.promise;const p=name==='search'?c.page.fetchPage(1,1):c.page.fetchPage(1,1);c.switchOwner();gate.resolve(feed('old-context'));await p;assert.equal((name==='search'?c.page.data.items:c.page.data.filtered).length,0);
});
test('popular search terms from an earlier city cannot apply before the next onShow',async()=>{
 const c=client('search'),gate=deferred();c.storage.set('city_life_browse_city',{cityCode:'441900'});c.page.data.cityCode='441900';c.api.request=()=>gate.promise;const p=c.page.loadDiscovery();c.storage.set('city_life_browse_city',{cityCode:'310100'});gate.resolve({items:[{term:'旧城市热词'}]});await p;assert.equal(c.page.data.popularTerms.length,0);
});
test('late configuration cannot restart a query already replaced by a newer submission',async()=>{
 const c=client('search'),gate=deferred();let queries=0;c.api.request=async(method,url)=>{if(url==='/api/v1/config')return gate.promise;queries++;return feed('current');};const initializing=c.page.initialize();c.page.input({detail:{value:'新关键词'}});await c.page.search();gate.resolve({areas:['中心街道']});await initializing;assert.equal(queries,1);assert.equal(c.page.data.submittedQ,'新关键词');
});
test('repeated search retry taps share the in-flight page request',async()=>{
 const c=client('search'),gate=deferred();c.api.request=async(...args)=>{c.calls.push(args);return gate.promise;};const a=c.page.retry(),b=c.page.retry();assert.equal(c.calls.length,1);gate.resolve(feed('retry'));await Promise.all([a,b]);assert.equal(c.page.data.items.length,1);
});
for(const name of ['search','discover'])test(name+' stops at the supported pagination boundary without claiming all matches were shown',async()=>{
 const c=client(name);c.api.request=async()=>({...feed('last-window'),pagination:{hasMore:true}});await c.page.fetchPage(501,1);assert.equal(c.page.data.hasMore,false);assert.equal(c.page.data.limitReached,true);assert.equal(name==='search'?c.page.data.items.length:c.page.data.filtered.length,1);
});
test('invalid native GPS keeps the previous discovery results and the sorting sheet open',async()=>{
 for(const point of [{latitude:NaN,longitude:113},{latitude:91,longitude:113},{latitude:23,longitude:181}]){
  const c=client('discover');c.page.setData({type:'service'});c.page.data.filtered=[{id:'preserved'}];c.page.openSort();const p=c.page.selectSort({currentTarget:{dataset:{code:'distance'}}});c.gps().success(point);await p;assert.equal(c.page.data.sortCode,'latest');assert.equal(c.page.data.sortOpen,true);assert.ok(c.page.data.sortError);assert.equal(c.calls.length,0);assert.equal(c.page.data.filtered[0].id,'preserved');
 }
});
const booking={id:'booking-one',serviceTitle:'本地测试服务',status:'pending_confirm',requestedAt:'2026-11-02T01:30:00Z'};
async function bookingClient(){const c=client('my-bookings');c.api.request=async(method,url,data,auth,owner)=>{c.calls.push({method,url,data,auth,owner});return {items:[booking]};};await c.page.refresh();return c;}
test('booking list failure is a retryable state and retains previously loaded rows',async()=>{
 const c=await bookingClient();c.api.request=async()=>{throw Error('预约读取中断');};await c.page.refresh();assert.equal(c.page.data.loading,false);assert.equal(c.page.data.error,'预约读取中断');assert.equal(c.page.data.items[0].id,booking.id);
});
test('booking refresh resolves in request order rather than response order',async()=>{
 const c=client('my-bookings'),gate=deferred();let calls=0;c.api.request=()=>++calls===1?gate.promise:Promise.resolve({items:[{...booking,serviceTitle:'新记录'}]});const first=c.page.refresh();await c.page.refresh();gate.resolve({items:[{...booking,serviceTitle:'旧记录'}]});await first;assert.equal(c.page.data.items[0].serviceTitle,'新记录');
});
test('booking cancel confirmation cannot transfer its mutation to another account',async()=>{
 const c=await bookingClient();c.page.cancel({currentTarget:{dataset:{id:booking.id}}});c.switchOwner();await c.modals[0].success({confirm:true});assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
});
test('repeated booking cancel taps open one confirmation and issue one mutation',async()=>{
 const c=await bookingClient(),gate=deferred();c.api.request=async(method,url)=>{c.calls.push({method,url});return method==='POST'?gate.promise:{items:[{...booking,status:'cancelled'}]};};const event={currentTarget:{dataset:{id:booking.id}}};c.page.cancel(event);c.page.cancel(event);assert.equal(c.modals.length,1);const confirmation=c.modals[0].success({confirm:true});c.page.cancel(event);assert.equal(c.calls.filter(x=>x.method==='POST').length,1);gate.resolve({ok:true});await confirmation;assert.equal(c.page.data.cancelingId,'');assert.equal(c.page.data.items[0].canCancel,false);
});
test('a missing or already confirmed booking cannot open a cancellation dialog',async()=>{
 const c=await bookingClient();c.page.cancel({currentTarget:{dataset:{id:'unknown'}}});c.page.data.items[0].canCancel=false;c.page.data.items[0].status='confirmed';c.page.cancel({currentTarget:{dataset:{id:booking.id}}});assert.equal(c.modals.length,0);
});
test('ambiguous booking cancellation failure requires refresh before sending another mutation',async()=>{
 const c=await bookingClient();c.api.request=async(method,url)=>{c.calls.push({method,url});throw Error('返回前网络中断');};const event={currentTarget:{dataset:{id:booking.id}}};c.page.cancel(event);await c.modals[0].success({confirm:true});assert.ok(c.page.data.actionError);c.page.cancel(event);assert.equal(c.modals.length,1);assert.equal(c.calls.filter(x=>x.method==='POST').length,1);
});
test('late booking responses cannot update an unloaded page',async()=>{
 const c=client('my-bookings'),gate=deferred();c.api.request=()=>gate.promise;const p=c.page.refresh();c.page.onUnload?.();const updates=c.page.updates;gate.resolve({items:[booking]});await p;await tick();assert.equal(c.page.updates,updates);
});
test('invalid booking timestamps do not erase the list or invent a 1970 appointment',async()=>{
 const c=client('my-bookings');c.api.request=async()=>({items:[{...booking,requestedAt:'invalid'},{...booking,id:'missing-time',requestedAt:null}]});await c.page.refresh();await tick();assert.equal(c.page.data.items.length,2);assert.equal(c.page.data.items[0].date,'时间待确认');assert.equal(c.page.data.items[1].date,'时间待确认');assert.equal(c.page.data.error,'');
});
test('booking confirmation rechecks a status updated while the dialog was open',async()=>{
 const c=await bookingClient();c.page.cancel({currentTarget:{dataset:{id:booking.id}}});c.page.data.items[0].status='confirmed';c.page.data.items[0].canCancel=false;await c.modals[0].success({confirm:true});assert.equal(c.calls.filter(x=>x.method==='POST').length,0);assert.equal(c.page.data.cancelingId,'');
});
test('confirmed cancellation stays cancelled when its follow-up list refresh fails',async()=>{
 const c=await bookingClient();c.api.request=async method=>{if(method==='POST')return {ok:true};throw Error('列表刷新失败');};c.page.cancel({currentTarget:{dataset:{id:booking.id}}});await c.modals[0].success({confirm:true});assert.equal(c.page.data.items[0].status,'cancelled');assert.equal(c.page.data.items[0].canCancel,false);assert.equal(c.page.data.error,'列表刷新失败');assert.equal(c.page.data.actionError,'');assert.equal(c.page.data.cancelingId,'');
});
