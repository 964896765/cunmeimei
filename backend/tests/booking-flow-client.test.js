'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const sid='30000000-0000-4000-8000-000000000006',mid='40000000-0000-4000-8000-000000000006',bid='50000000-0000-4000-8000-000000000006';
const day='2099-12-01',nextDay='2099-12-02';
function client(name,existingStorage){
 const storage=existingStorage||new Map([['city_life_user_id','one'],['city_life_v2_auth_token','token-one']]),calls=[],modals=[],routes=[],toasts=[],faults={read:false,write:false};let definition;
 const api={online:()=>true,hasSession:()=>!!storage.get('city_life_v2_auth_token'),login:async()=>{storage.set('city_life_user_id','one');storage.set('city_life_v2_auth_token','fresh');},showError:e=>toasts.push(e.message),request:async(method,url,data,auth,owner)=>{calls.push({method,url,data,auth,owner});return url.includes('/slots?')?{slots:[{time:'10:00',available:true}]}:{items:[]};}};
 const wx={getStorageSync:key=>{if(faults.read&&key.startsWith('city_life_booking_pending'))throw Error('恢复记录读取失败');return storage.get(key)||'';},setStorageSync:(key,value)=>{if(faults.write)throw Error('本机空间不足');storage.set(key,structuredClone(value));},showToast:o=>toasts.push(o.title),showModal:o=>modals.push(o),navigateBack(){},redirectTo:o=>routes.push(o.url)};
 const sandbox={Page:d=>definition=d,wx,require:n=>n.endsWith('/booking-pending')?require('./client-booking-store')(wx):n.endsWith('/api')?api:n.endsWith('/storage')?{}:n.endsWith('/presentation')?{item:x=>x}:n.endsWith('/theme')?{apply(){}}:n.endsWith('/booking-time')?require('../../miniprogram/utils/booking-time'):n.endsWith('/tab-bar')?{context:()=>storage.get('city_life_user_id')+':'+storage.get('city_life_v2_auth_token')}:{} };
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages',name,'index.js'),'utf8'),sandbox);
 const page={data:structuredClone(definition.data),updates:0,setData(v){Object.assign(this.data,v);this.updates++;}};for(const [key,value]of Object.entries(definition))if(typeof value==='function')page[key]=value.bind(page);
 if(name==='booking'){page.serviceId=sid;page.data.item={id:sid,kind:'service',title:'本地测试服务'};page.data.date=day;page.data.time='10:00';page.data.openSlots=['10:00','11:00'];page.data.slotLabels=['10:00','11:00'];page.data.remark='保留用户的服务备注';page._slotDate=day;page._slotService=sid;page.data.loadingItem=false;}
 else{page.data.merchantId=mid;page.data.canAct=true;page.data.items=[{id:bid,status:'pending_confirm',canConfirm:true,canComplete:false,requestedAt:day+'T02:00:00.000Z',serviceTitle:'本地测试服务'}];}
 return {page,api,calls,modals,routes,toasts,storage,wx,faults,store:require('./client-booking-store')(wx),event:dataset=>({currentTarget:{dataset}}),switchOwner(){storage.set('city_life_user_id','two');storage.set('city_life_v2_auth_token','token-two');}};
}
const receipt=payload=>({booking:{id:bid,serviceId:payload.serviceId,clientKey:payload.clientKey,requestedAt:payload.date+'T'+payload.time+':00+08:00',status:'pending_confirm'}});
test('booking date switch ignores the previous date response even when it arrives last',async()=>{
 const c=client('booking'),gate=deferred();c.api.request=async(method,url)=>url.includes(day)?gate.promise:{slots:[{time:'11:00',available:true}]};const first=c.page.loadSlots(day);c.page.data.date=nextDay;await c.page.loadSlots(nextDay);gate.resolve({slots:[{time:'15:00',available:true}]});await first;assert.equal(c.page.data.time,'11:00');assert.equal(c.page.data.date,nextDay);assert.equal(c.page.data.loadingSlots,false);
});
test('booking slot failure is retryable and clears stale time without erasing the remark',async()=>{
 const c=client('booking');c.api.request=async()=>{throw Error('时段读取失败');};await c.page.loadSlots(day);assert.equal(c.page.data.time,'');assert.ok(c.page.data.slotError);assert.equal(c.page.data.remark,'保留用户的服务备注');assert.equal(c.page.data.loadingSlots,false);
});
test('booking submission refuses a selected time not in the freshly loaded slot list',async()=>{
 const c=client('booking');c.page.data.time='18:00';await c.page.submit();assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
});
test('booking form stays immutable while the original payload is in flight',async()=>{
 const c=client('booking'),gate=deferred();c.api.request=()=>gate.promise;const p=c.page.submit();await tick();assert.equal(c.page.data.submitting,true);c.page.chooseDate({detail:{value:nextDay}});c.page.chooseSlot({detail:{value:1}});c.page.setRemark({detail:{value:'不应覆盖在途备注'}});assert.equal(c.page.data.date,day);assert.equal(c.page.data.time,'10:00');assert.equal(c.page.data.remark,'保留用户的服务备注');gate.resolve({booking:{id:bid,status:'pending_confirm'}});await p;
});
test('booking success locks the completed form against further submits',async()=>{
 const c=client('booking');c.api.request=async(method,url,data)=>{c.calls.push({method,url,data});return receipt(data);};await c.page.submit();await c.page.submit();assert.equal(c.calls.filter(x=>x.method==='POST').length,1);assert.ok(c.page.data.submitted);assert.equal(c.page.data.submitting,false);
});
test('unknown booking result blocks a changed payload until the original result is reconciled',async()=>{
 const c=client('booking');c.api.request=async()=>{throw Error('返回前断网');};await c.page.submit();assert.equal(c.page.data.pendingCheck,true);c.page.chooseDate({detail:{value:nextDay}});c.page.setRemark({detail:{value:'另一份申请'}});assert.equal(c.page.data.date,day);assert.equal(c.page.data.remark,'保留用户的服务备注');assert.ok(c.page.data.submitError);
});
test('booking reconciliation finds an active original reservation without issuing another POST',async()=>{
 const c=client('booking');c.api.request=async()=>{throw Error('返回前断网');};await c.page.submit();const payload=c.page._pending.payload;c.api.request=async(method,url)=>{c.calls.push({method,url});return receipt(payload);};await c.page.checkSubmission();assert.equal(c.page.data.submitted.id,bid);assert.equal(c.page.data.pendingCheck,false);assert.equal(c.calls.filter(x=>x.method==='POST').length,0);assert.ok(c.calls[0].url.endsWith('/'+payload.clientKey));
});
test('an inconclusive booking check never unlocks a new date or claims the original request failed',async()=>{
 const c=client('booking');c.api.request=async()=>{throw Error('返回前断网');};await c.page.submit();c.api.request=async()=>({items:[]});await c.page.checkSubmission();assert.equal(c.page.data.pendingCheck,true);assert.equal(c.page.data.submitted,null);c.page.chooseDate({detail:{value:nextDay}});assert.equal(c.page.data.date,day);
});
test('explicit booking retry sends the exact original payload',async()=>{
 const c=client('booking'),posts=[];c.api.request=async(method,url,data)=>{posts.push(structuredClone(data));if(posts.length===1)throw Error('返回前断网');return {...receipt(data),replayed:true};};await c.page.submit();await c.page.retrySubmission();assert.deepEqual(posts[0],posts[1]);assert.ok(c.page.data.submitted);assert.equal(c.page.data.pendingCheck,false);
});
test('slot conflicts reload availability and preserve the submitted remark',async()=>{
 const c=client('booking');c.api.request=async method=>{if(method==='POST'){const e=Error('时段被占用');e.code='SLOT_TAKEN';throw e;}return {slots:[{time:'11:00',available:true}]};};await c.page.submit();assert.equal(c.page.data.remark,'保留用户的服务备注');assert.equal(c.page.data.time,'11:00');assert.equal(c.page.data.pendingCheck,false);assert.ok(c.page.data.submitError);
});
test('guest booking authentication binds the chosen owner before submitting',async()=>{
 const c=client('booking');c.storage.clear();c.api.request=async(method,url,data,auth,owner)=>{c.calls.push({method,owner});return receipt(data);};await c.page.submit();assert.equal(c.storage.get('city_life_user_id'),'one');assert.equal(c.calls[0].owner,'one');assert.ok(c.page.data.submitted);
});
test('booking page departure prevents a late slot response from changing the disposed page',async()=>{
 const c=client('booking'),gate=deferred();c.api.request=()=>gate.promise;const p=c.page.loadSlots(day);c.page.onUnload?.();const n=c.page.updates;gate.resolve({slots:[{time:'12:00',available:true}]});await p;assert.equal(c.page.updates,n);
});
test('a late booking success after account switching never acknowledges another account reservation',async()=>{
 const c=client('booking'),gate=deferred();c.api.request=()=>gate.promise;const p=c.page.submit();await tick();c.switchOwner();gate.resolve({booking:{id:bid,status:'pending_confirm'}});await p;assert.equal(c.page.data.submitted,null);assert.equal(c.modals.length,0);
});
test('booking slot refresh keeps a selected time when it remains available',async()=>{
 const c=client('booking');c.page.chooseSlot({detail:{value:1}});c.api.request=async()=>({slots:[{time:'10:00',available:true},{time:'11:00',available:true}]});await c.page.loadSlots(day);assert.equal(c.page.data.time,'11:00');assert.equal(c.page.data.slotIndex,1);
});
test('a booking slot read cannot enable a replacement account form before onShow',async()=>{
 const c=client('booking'),gate=deferred();c.api.request=()=>gate.promise;const p=c.page.loadSlots(day);c.switchOwner();gate.resolve({slots:[{time:'12:00',available:true}]});await p;assert.equal(c.page.data.openSlots.length,0);assert.equal(c.page.data.time,'');
});
test('merchant booking action confirmation serializes repeated taps',async()=>{
 const c=client('merchant-bookings');c.page.action(c.event({id:bid,action:'confirm'}));c.page.action(c.event({id:bid,action:'confirm'}));assert.equal(c.modals.length,1);assert.equal(c.page.data.busyId,bid);
});
test('merchant booking confirmation cannot submit after an account switch',async()=>{
 const c=client('merchant-bookings');c.page.action(c.event({id:bid,action:'confirm'}));c.switchOwner();await c.modals[0].success({confirm:true});assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
});
test('merchant booking confirmation rechecks the latest state and valid transition',async()=>{
 const c=client('merchant-bookings');c.page.action(c.event({id:bid,action:'complete'}));assert.equal(c.modals.length,0);c.page.action(c.event({id:bid,action:'confirm'}));c.page.data.items[0].status='cancelled';c.page.data.items[0].canConfirm=false;await c.modals[0].success({confirm:true});assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
});
test('merchant booking read failure keeps rows while pausing processing',async()=>{
 const c=client('merchant-bookings');c.api.request=async()=>{throw Error('读取失败');};await c.page.load();assert.equal(c.page.data.items.length,1);assert.equal(c.page.data.canAct,false);assert.equal(c.page.data.error,'读取失败');assert.equal(c.page.data.loading,false);
});
test('merchant permission denial removes previously visible customer remarks',async()=>{
 const c=client('merchant-bookings');c.api.request=async()=>{const e=Error('权限已撤销');e.code='MERCHANT_FORBIDDEN';throw e;};await c.page.load();assert.equal(c.page.data.items.length,0);assert.equal(c.page.data.canAct,false);
});
test('merchant unknown action result requires a successful refresh before another mutation',async()=>{
 const c=client('merchant-bookings');c.api.request=async()=>{throw Error('操作返回中断');};c.page.action(c.event({id:bid,action:'confirm'}));await c.modals[0].success({confirm:true});assert.ok(c.page.data.actionError);assert.equal(c.page.data.busyId,'');c.page.action(c.event({id:bid,action:'confirm'}));assert.equal(c.modals.length,1);
});
test('merchant acknowledged status is preserved when the following refresh fails',async()=>{
 const c=client('merchant-bookings');c.api.request=async method=>{if(method==='POST')return {booking:{id:bid,status:'confirmed'}};throw Error('刷新失败');};c.page.action(c.event({id:bid,action:'confirm'}));await c.modals[0].success({confirm:true});assert.equal(c.page.data.items[0].status,'confirmed');assert.equal(c.page.data.items[0].canConfirm,false);assert.equal(c.page.data.error,'刷新失败');
});
test('merchant list ignores older responses after a newer refresh',async()=>{
 const c=client('merchant-bookings'),gate=deferred();let n=0;c.api.request=()=>++n===1?gate.promise:Promise.resolve({items:[{id:bid,status:'confirmed'}]});const p=c.page.load();await c.page.load();gate.resolve({items:[{id:bid,status:'pending_confirm'}]});await p;assert.equal(c.page.data.items[0].status,'confirmed');
});
test('merchant booking date renders in Beijing time rather than raw UTC',async()=>{
 const c=client('merchant-bookings');c.api.request=async()=>({items:[{id:bid,status:'expired',requestedAt:day+'T02:00:00.000Z'}]});await c.page.load();assert.equal(c.page.data.items[0].requestedLabel,day+' 10:00（北京时间）');assert.equal(c.page.data.items[0].statusText,'等待超时，已释放');
});
test('guest merchant login completes its permission read instead of invalidating the same request',async()=>{
 const c=client('merchant-bookings');c.storage.clear();c.api.request=async()=>({items:[{id:bid,status:'pending_confirm'}]});await c.page.load();assert.equal(c.page.data.loading,false);assert.equal(c.page.data.canAct,true);assert.equal(c.page.data.items.length,1);
});
test('booking return after midnight refreshes the minimum date without clearing the remark',async()=>{
 const c=client('booking');c.page.data.date='2020-01-01';c.page.data.minDate='2020-01-01';await c.page.onShow();assert.equal(c.page.data.date,require('../../miniprogram/utils/booking-time').today());assert.equal(c.page.data.minDate,c.page.data.date);assert.equal(c.page.data.remark,'保留用户的服务备注');
});
test('invalid calendar date never replaces the chosen booking date or queries impossible availability',async()=>{
 const c=client('booking');await c.page.chooseDate({detail:{value:'2099-02-30'}});assert.equal(c.page.data.date,day);assert.ok(c.page.data.slotError);assert.equal(c.calls.length,0);
});

test('booking persists the exact request before dispatch and a new page restores it without a POST',async()=>{
 const c=client('booking');let sent;
 c.api.request=async(method,url,payload)=>{sent=structuredClone(payload);assert.equal(c.store.read(c.store.context(),sid).payload.clientKey,payload.clientKey);throw Error('lost response');};
 await c.page.submit();c.page.onUnload();
 const reopened=client('booking',c.storage);await reopened.page.onLoad({id:sid});
 assert.equal(reopened.page.data.pendingCheck,true);assert.equal(reopened.page.data.remark,sent.remark);assert.equal(reopened.page.data.time,sent.time);
 assert.equal(reopened.page._pending.payload.clientKey,sent.clientKey);assert.equal(reopened.calls.filter(c=>c.method==='POST').length,0);
 assert.ok(reopened.page.data.itemError,'missing public service does not prevent recovery');
});
test('booking storage failure prevents dispatch and exposes explicit recovery retry',async()=>{
 const c=client('booking');c.faults.write=true;await c.page.submit();
 assert.equal(c.calls.filter(c=>c.method==='POST').length,0);assert.ok(c.page.data.recoveryError);assert.equal(c.page.data.submitting,false);
 c.faults.write=false;await c.page.retryRecovery();assert.equal(c.page.data.recoveryError,'');
});
test('corrupt pending storage locks new submissions instead of forgetting an uncertain request',async()=>{
 const c=client('booking');c.api.request=async()=>{throw Error('network');};await c.page.submit();
 const storageKey=[...c.storage.keys()].find(key=>key.startsWith('city_life_booking_pending'));
 c.storage.set(storageKey,{bad:'corrupt'});const reopened=client('booking',c.storage);reopened.page.restorePending();
 await reopened.page.submit();assert.ok(reopened.page.data.recoveryError);assert.equal(reopened.calls.length,0);
});
test('pending requests are isolated by account, API server and acceptance mode',async()=>{
 const c=client('booking');c.api.request=async()=>{throw Error('network');};await c.page.submit();
 assert.equal(c.store.list(c.store.context()).length,1);
 c.storage.set('city_life_acceptance_mode',true);assert.equal(c.store.list(c.store.context()).length,0);
 c.storage.set('city_life_acceptance_mode',false);
 assert.equal(require('./client-booking-store')(c.wx,{apiBaseUrl:'https://different.example.cn'}).list(c.store.context()).length,0);
 c.switchOwner();assert.equal(c.store.list(c.store.context()).length,0);
});
test('late success after page departure leaves the durable request available for reconciliation',async()=>{
 const c=client('booking'),gate=deferred();let payload;c.api.request=(m,u,p)=>{payload=p;return gate.promise;};
 const work=c.page.submit();await tick();c.page.onUnload();gate.resolve(receipt(payload));await work;
 assert.equal(c.store.read(c.store.context(),sid).payload.clientKey,payload.clientKey);assert.equal(c.page.data.submitted,null);
});
test('a receipt for another key or time cannot clear the original pending request',async()=>{
 const c=client('booking');c.api.request=async(m,u,p)=>({...receipt(p),booking:{...receipt(p).booking,clientKey:'unrelated_request_key_0001'}});
 await c.page.submit();assert.equal(c.page.data.pendingCheck,true);assert.equal(c.page.data.submitted,null);
 const payload=c.page._pending.payload;c.api.request=async()=>({booking:{...receipt(payload).booking,requestedAt:nextDay+'T02:00:00.000Z'}});
 await c.page.checkSubmission();assert.equal(c.page.data.pendingCheck,true);assert.ok(c.store.read(c.store.context(),sid));
});
for(const status of ['expired','cancelled','completed'])test('reconciliation acknowledges '+status+' without creating a replacement',async()=>{
 const c=client('booking');c.api.request=async()=>{throw Error('network');};await c.page.submit();const payload=c.page._pending.payload;
 c.api.request=async(m,u)=>{c.calls.push({method:m,url:u});return {booking:{...receipt(payload).booking,status}};};
 await c.page.checkSubmission();assert.equal(c.page.data.submitted.status,status);assert.equal(c.store.read(c.store.context(),sid),null);assert.equal(c.calls.filter(c=>c.method==='POST').length,0);
});
test('storage cleanup failure preserves a confirmed receipt and can be retried safely',async()=>{
 const c=client('booking');c.api.request=async(m,u,p)=>{c.faults.write=true;return receipt(p);};
 await c.page.submit();assert.ok(c.page.data.submitted);assert.ok(c.page.data.recoveryError);assert.ok(c.store.read(c.store.context(),sid));
 c.faults.write=false;c.page.retryRecovery();assert.ok(c.page.data.submitted);assert.equal(c.page.data.pendingCheck,false);assert.equal(c.page.data.recoveryError,'');assert.equal(c.store.read(c.store.context(),sid),null);
});
test('old snapshot cleanup cannot remove a different request for the same service',()=>{
 const c=client('booking'),payload={serviceId:sid,date:day,time:'10:00',remark:'original',clientKey:'old_booking_request_0001'};
 c.store.save(c.store.context(),payload,'service');c.store.remove(c.store.context(),payload);
 const newer={...payload,clientKey:'new_booking_request_0001'};c.store.save(c.store.context(),newer,'service');c.store.remove(c.store.context(),payload);
 assert.equal(c.store.read(c.store.context(),sid).payload.clientKey,newer.clientKey);
});
test('restoring a pending request invalidates an older slot response',async()=>{
 const c=client('booking'),gate=deferred();c.api.request=()=>gate.promise;const work=c.page.loadSlots(day);
 const payload={serviceId:sid,date:day,time:'11:00',remark:'saved',clientKey:'restored_booking_key_0001'};c.store.save(c.store.context(),payload,'service');c.page.restorePending();
 gate.resolve({slots:[{time:'10:00',available:true}]});await work;assert.equal(c.page.data.time,'11:00');assert.equal(c.page.data.loadingSlots,false);
});
test('a recorded rejection resolves uncertainty without another POST',async()=>{
 const c=client('booking');c.api.request=async()=>{throw Error('lost response');};await c.page.submit();const payload=c.page._pending.payload;
 c.api.request=async(method,url)=>{c.calls.push({method,url});return url.includes('/booking-submissions/')?{rejected:true,clientKey:payload.clientKey,errorCode:'SLOT_TAKEN'}:{slots:[]};};
 await c.page.checkSubmission();assert.equal(c.page.data.pendingCheck,false);assert.equal(c.page.data.submitted,null);assert.ok(c.page.data.rejectedText.includes('未创建'));assert.equal(c.store.read(c.store.context(),sid),null);assert.equal(c.calls.filter(c=>c.method==='POST').length,0);
});
test('a rejection for a different key cannot release the current request',async()=>{
 const c=client('booking');c.api.request=async()=>{throw Error('lost response');};await c.page.submit();
 c.api.request=async()=>({rejected:true,clientKey:'unrelated_rejection_key_001',errorCode:'SLOT_TAKEN'});await c.page.checkSubmission();
 assert.equal(c.page.data.pendingCheck,true);assert.ok(c.store.read(c.store.context(),sid));
});

test('recovered system cancellation explains the source change without submitting a replacement', async () => {
 const state = client('booking');
 state.api.request = async () => { throw Error('lost response'); };
 await state.page.submit();
 const payload = state.page._pending.payload;
 state.api.request = async (method, url) => {
  state.calls.push({method, url});
  return {booking: {...receipt(payload).booking, status: 'cancelled', cancellationReason: 'industry_source_unavailable'}};
 };
 await state.page.checkSubmission();
 assert.equal(state.page.data.submitted.status, 'cancelled');
 assert.ok(state.page.data.successText.includes('已由系统取消'));
 assert.equal(state.calls.filter(call => call.method === 'POST').length, 0);
 assert.equal(state.store.read(state.store.context(), sid), null);
});

test('customer and merchant lists show the same system reason and offer no terminal-state actions', async () => {
 const item = {id: bid, serviceId: sid, serviceTitle: '原服务', requestedAt: day + 'T02:00:00.000Z',
  status: 'cancelled', cancellationReason: 'industry_source_unavailable'};
 const customer = client('my-bookings');
 customer.api.request = async () => ({items: [item]});
 await customer.page.refresh();
 const merchant = client('merchant-bookings');
 merchant.api.request = async () => ({items: [item]});
 await merchant.page.load();
 assert.equal(customer.page.data.items[0].canCancel, false);
 assert.equal(merchant.page.data.items[0].canConfirm, false);
 assert.equal(merchant.page.data.items[0].canComplete, false);
 assert.ok(customer.page.data.items[0].cancellationText.includes('已由系统取消'));
 assert.equal(customer.page.data.items[0].cancellationText, merchant.page.data.items[0].cancellationText);
});
