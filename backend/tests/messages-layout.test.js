'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const view=require('../../miniprogram/utils/message-view');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const event=dataset=>({currentTarget:{dataset}});
function client(request){
 let definition;const state={owner:'owner-a:token',session:true},badges=[],modals=[],routes=[],app={globalData:{}};
 const sandbox={Page:v=>definition=v,require:name=>name.endsWith('/api')?{request,hasSession:()=>state.session,showError(){}}:name.endsWith('/tab-bar')?{context:()=>state.owner,setUnread:n=>badges.push(n)}:name.endsWith('/message-view')?view:{apply(){}},wx:{showModal:v=>modals.push(v),showToast(){},navigateTo:v=>routes.push(v.url),switchTab:v=>routes.push(v.url),stopPullDownRefresh(){}},getApp:()=>app};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../miniprogram/pages/messages/index.js'),'utf8'),sandbox);
 const page={data:structuredClone(definition.data),setData:v=>Object.assign(page.data,v)};
 for(const [key,value]of Object.entries(definition))if(typeof value==='function')page[key]=value.bind(page);
 return {page,state,badges,modals,routes,app};
}
const notice={id:'n1',targetKind:'booking',targetId:'b1',title:'预约动态',body:'预约已确认',createdAt:new Date().toISOString(),readAt:null};
const contact={id:'c1',title:'真实信息',message:'申请内容',response:'',status:'pending',outgoing:false,blocked:false,createdAt:new Date().toISOString()};
test('points notices filter actual ledger changes and navigate to their own record view',async()=>{
 const entry={...notice,targetKind:'points-ledger',targetId:'ledger-1'};
 const c=client(async(method,url)=>method==='POST'?{ok:true}:url.includes('notifications')?{items:[entry],unread:1,hasMore:false}:{items:[]});await c.page.refresh();c.page.filterNotices(event({category:'points'}));assert.equal(c.page.data.visibleNotices.length,1);
 await c.page.open(event({id:entry.id}));assert.equal(c.app.globalData.pointsTarget.view,'ledger');assert.equal(c.app.globalData.pointsTarget.id,'ledger-1');assert.equal(c.routes.at(-1),'/pages/me/index');
});
test('older contacts append with deduplication and stale account responses are ignored',async()=>{
 const gate=deferred();let response=gate.promise;const c=client(async(m,u)=>u.includes('notifications')?{items:[],unread:0}:u.includes('?page=2')?response:{items:[contact],hasMore:true,pendingCount:101});
 await c.page.refresh();assert.equal(c.page.data.pendingContacts,101);const load=c.page.moreContacts();gate.resolve({items:[contact,{...contact,id:'c2'}],hasMore:false});await load;assert.equal(c.page.data.contacts.length,2);assert.equal(c.page.data.contactPage,2);
 c.page.setData({contactsHasMore:true,contactPage:1});const late=deferred();response=late.promise;const secondLoad=c.page.moreContacts();c.state.owner='other:token';late.resolve({items:[{...contact,id:'old-account-private-row'}],hasMore:false});await secondLoad;assert.equal(c.page.data.contacts.some(x=>x.id==='old-account-private-row'),false);
});
test('message dates and categories preserve privacy-redacted server text and never fabricate identities',()=>{
 const now=new Date('2026-10-18T10:00:00');
 assert.equal(view.dateText('2026-10-18T08:02:00',now),'08:02');assert.equal(view.dateText('2026-10-17T18:00:00',now),'昨天');assert.equal(view.dateText('invalid',now),'');
 const masked=view.notice({...notice,title:'你有一条新的站内通知',body:'内容摘要已隐藏，请进入对应业务查看。'});
 assert.equal(masked.title,'你有一条新的站内通知');assert.equal(masked.body,'内容摘要已隐藏，请进入对应业务查看。');assert.equal(masked.category,'booking');
 assert.equal(view.notice({...notice,targetKind:'privacy'}).category,'other');assert.equal(view.notice({...notice,targetKind:'publication-expiry'}).category,'review');
 assert.equal(view.contact(contact).needsReply,true);assert.equal(view.contact({...contact,blocked:true}).needsReply,false);assert.equal(view.contact({...contact,outgoing:true}).needsReply,false);
 assert.equal('displayName' in view.contact(contact),false);
});
test('message search, pending filter, row expansion and notification filters use actual loaded records',async()=>{
 const {page,modals}=client(async(method,url)=>url.includes('notifications')?{items:[notice,{...notice,id:'n2',targetKind:'publication'}],unread:2}:{items:[contact,{...contact,id:'c2',outgoing:true,title:'手机转让',response:'欢迎联系'}]});
 await page.refresh();assert.equal(page.data.visibleContacts.length,2);assert.equal(page.data.pendingContacts,1);
 page.showPending();assert.equal(page.data.visibleContacts.length,1);page.showAllContacts();page.search({detail:{value:'欢迎'}});assert.equal(page.data.visibleContacts[0].id,'c2');
 page.toggleContact(event({id:'c2'}));assert.equal(page.data.expandedId,'c2');page.toggleContact(event({id:'c2'}));assert.equal(page.data.expandedId,'');
 page.filterNotices(event({category:'review'}));assert.equal(page.data.visibleNotices.length,1);assert.equal(page.data.visibleNotices[0].id,'n2');
 page.filterNotices(event({category:'review'}));assert.equal(page.data.visibleNotices.length,2);
 page.filterNotices(event({category:'points'}));assert.equal(modals.length,0);assert.equal(page.data.noticeFilter,'points');assert.equal(page.data.visibleNotices.length,0);assert.equal(page.data.items.length,2);
});
test('messages reject previous account results and clear its records and badge on guest refresh',async()=>{
 const gate=deferred(),{page,state,badges}=client(()=>gate.promise);
 const pending=page.refresh();state.owner='guest:';state.session=false;await page.refresh();gate.resolve({items:[notice],unread:7});await pending;
 assert.equal(page.data.hasSession,false);assert.equal(page.data.loading,false);assert.equal(page.data.visibleNotices.length,0);assert.equal(page.data.contacts.length,0);assert.equal(badges.at(-1),0);
});
test('messages ignore unloaded requests and retain actionable retry after network failure',async()=>{
 const gate=deferred(),a=client(()=>gate.promise),pending=a.page.refresh();a.page.onUnload();gate.resolve({items:[],unread:0});await pending;assert.equal(a.page.data.items.length,0);assert.equal(a.badges.length,0);
 let fail=true;const b=client(async(method,url)=>{if(fail)throw Error('网络中断');return url.includes('notifications')?{items:[notice],unread:1}:{items:[]}});
 await b.page.refresh();assert.equal(b.page.data.error,'网络中断');assert.equal(b.page.data.loading,false);fail=false;await b.page.refresh();assert.equal(b.page.data.error,'');assert.equal(b.page.data.visibleNotices.length,1);
});
test('notification pagination keeps category selection, deduplicates overlaps and rejects old refresh results',async()=>{
 const gate=deferred(),{page}=client(async(method,url)=>url.includes('page=2')?gate.promise:url.includes('notifications')?{items:Array.from({length:20},(_,i)=>({...notice,id:'n'+i})),unread:20}:{items:[]});
 await page.refresh();page.filterNotices(event({category:'booking'}));const pending=page.more();gate.resolve({items:[notice,{...notice,id:'later',targetKind:'merchant'}]});await pending;
 assert.equal(page.data.items.length,21);assert.equal(page.data.visibleNotices.length,20);assert.equal(page.data.noticeFilter,'booking');assert.equal(page.data.hasMore,false);
});
test('mark-all waits for server success and duplicate requests cannot mark other accounts',async()=>{
 const gate=deferred();let writes=0;const {page,state}=client(async(method,url)=>{if(method==='POST'){writes++;return gate.promise}return url.includes('notifications')?{items:[notice],unread:1}:{items:[]}});
 await page.refresh();const pending=page.readAll();await page.readAll();assert.equal(writes,1);assert.equal(page.data.unread,1);
 state.owner='owner-b:token';gate.resolve({});await pending;assert.equal(page.data.items[0].readAt,null);
});
test('contact actions preserve direction, blocked restrictions and modal identity ownership',async()=>{
 const calls=[],{page,state,modals}=client(async(method,url,data)=>{calls.push({method,url,data});return {items:[],unread:0}});
 page.data.contacts=[view.contact(contact),view.contact({...contact,id:'out',outgoing:true}),view.contact({...contact,id:'blocked',blocked:true})];
 page.contactAction(event({id:'out',action:'accept'}));page.contactAction(event({id:'c1',action:'withdraw'}));page.contactAction(event({id:'blocked',action:'accept'}));assert.equal(modals.length,0);
 page.contactAction(event({id:'c1',action:'accept'}));state.owner='owner-b:token';await modals[0].success({confirm:true,content:'不应发送'});assert.equal(calls.length,0);
});
test('opening a notice updates real read state and existing navigation only once',async()=>{
 const gate=deferred(),{page,routes,badges}=client(()=>gate.promise);page.data.items=[view.notice(notice)];page.data.unread=1;
 const pending=page.open(event({id:'n1'}));await page.open(event({id:'n1'}));assert.equal(routes.length,0);gate.resolve({});await pending;
 assert.equal(routes[0],'/pages/my-bookings/index');assert.equal(page.data.unread,0);assert.ok(page.data.items[0].readAt);assert.equal(badges.at(-1),0);
});
test('contact confirmation serializes repeated accept and block taps',async()=>{
 const gate=deferred(),calls=[],{page,modals}=client(async(method,url)=>{calls.push(method);if(method==='POST')return gate.promise;return url.includes('notifications')?{items:[],unread:0}:{items:[]};});page.data.contacts=[view.contact(contact)];
 page.contactAction(event({id:'c1',action:'accept'}));page.contactAction(event({id:'c1',action:'accept'}));page.block(event({id:'c1'}));assert.equal(modals.length,1);
 const pending=modals[0].success({confirm:true,content:'欢迎了解'});assert.equal(calls.filter(x=>x==='POST').length,1);gate.resolve({ok:true});await pending;assert.equal(page.data.contactBusyId,'');
});
test('contact confirmation rechecks refreshed status before accepting an old request',async()=>{
 const calls=[],{page,modals}=client(async(...args)=>calls.push(args));page.data.contacts=[view.contact(contact)];page.contactAction(event({id:'c1',action:'accept'}));page.data.contacts[0].status='withdrawn';await modals[0].success({confirm:true,content:'已失效的回复'});assert.equal(calls.length,0);assert.equal(page.data.contactBusyId,'');
});
test('failed contact response retains its greeting for retry on the same request',async()=>{
 const {page,modals}=client(async()=>{throw Error('回复失败');});page.data.contacts=[view.contact(contact)];page.contactAction(event({id:'c1',action:'accept'}));await modals[0].success({confirm:true,content:'保存这段问候'});assert.equal(page.data.contactBusyId,'');assert.equal(page.data.contactError,'回复失败');page.contactAction(event({id:'c1',action:'accept'}));assert.equal(modals[1].content,'保存这段问候');
});
