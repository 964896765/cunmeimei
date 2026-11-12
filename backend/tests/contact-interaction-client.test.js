'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const tick=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const itemId='30000000-0000-4000-8000-000000000005',chatId='40000000-0000-4000-8000-000000000005';
function client(name){
 const store=new Map([['city_life_user_id','one'],['city_life_v2_auth_token','token-one']]),calls=[],modals=[],sheets=[],toasts=[],phones=[],recent={record(){}};let definition;
 const tabs={context:()=>[store.get('city_life_user_id')||'',store.get('city_life_v2_auth_token')||''].join(':')};
 const api={online:()=>true,hasSession:()=>!!store.get('city_life_v2_auth_token'),login:async()=>{store.set('city_life_user_id','one');store.set('city_life_v2_auth_token','renewed');},request:async(method,url,body)=>{calls.push({method,url,body});if(url.endsWith('/interaction'))return {comments:[],likes:0,liked:false,hasMore:false};if(url.includes('/chats/'))return {id:chatId,items:[],canSend:true,peerId:'peer',publicationId:itemId};return {saved:false};},showError:e=>toasts.push(e.message)};
 const wx={getStorageSync:key=>store.get(key)||'',showToast:o=>toasts.push(o.title),showModal:o=>modals.push(o),showActionSheet:o=>sheets.push(o),makePhoneCall:o=>phones.push(o.phoneNumber),setNavigationBarTitle(){},navigateTo(){},previewImage(){}};
 const sandbox={Page:d=>definition=d,wx,setInterval:()=>1,clearInterval(){},require:n=>n.endsWith('/api')?api:n.endsWith('/tab-bar')?tabs:n.endsWith('/presentation')?{item:x=>({...x,category:'本地测试'})}:n.endsWith('/recent')?recent:{apply(){},open(){}}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages',name,'index.js'),'utf8'),sandbox);
 const page={data:structuredClone(definition.data),updates:0,setData(v){Object.assign(this.data,v);this.updates++;}};for(const [key,value]of Object.entries(definition))if(typeof value==='function')page[key]=value.bind(page);
 if(name==='detail'){page.onLoad({id:itemId});page.data.item={id:itemId,type:'community',kind:'listing',images:[],contact:{allowMessages:true,phoneAvailable:true}};page.data.loading=false;page.data.favoriteReady=true;page.data.comment='原始留言内容';page.refreshVersion=1;}
 if(name==='chat'){page.onLoad({id:chatId});page.data.chat={id:chatId,canSend:true,peerId:'peer',publicationId:itemId};page.data.messages=[{id:'message-id',mine:false,body:'对方消息'}];page.data.draft='原始消息内容';}
 return {page,api,calls,store,modals,sheets,toasts,phones,recent,event:dataset=>({currentTarget:{dataset}}),switchOwner(){store.set('city_life_user_id','two');store.set('city_life_v2_auth_token','token-two');}};
}
test('contact modal after account switching never dispatches under the replacement account',async()=>{
 const c=client('detail');await c.page.talk();c.switchOwner();await c.modals[0].success({confirm:true,content:'旧账号的联系申请'});assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
});
test('failed contact application preserves entered text for an explicit retry',async()=>{
 const c=client('detail');c.api.request=async()=>{throw Error('联系提交失败');};await c.page.talk();await c.modals[0].success({confirm:true,content:'希望了解物品状况'});assert.equal(c.page.data.contactDraft,'希望了解物品状况');assert.ok(c.page.data.contactError);await c.page.talk();assert.equal(c.modals[1].content,'希望了解物品状况');
});
test('duplicate contact taps open only one pending compose modal',async()=>{const c=client('detail');await Promise.all([c.page.talk(),c.page.talk()]);assert.equal(c.modals.length,1);});
test('late phone disclosure after leaving the page never opens the native dialer',async()=>{
 const c=client('detail'),gate=deferred();c.api.request=()=>gate.promise;const p=c.page.callPublisher();await tick();c.page.onUnload();gate.resolve({phone:'13800000000'});await p;assert.equal(c.phones.length,0);
});
test('late report sheet never opens a confirmation for another account',async()=>{
 const c=client('detail');await c.page.report();c.switchOwner();await c.sheets[0].success({tapIndex:0});assert.equal(c.modals.length,0);
});
test('chat completion preserves text received after the sent message snapshot',async()=>{
 const c=client('chat'),gate=deferred();c.api.request=async method=>method==='POST'?gate.promise:{items:[],canSend:true};const p=c.page.submit();await tick();c.page.input({detail:{value:'下一条新消息'}});gate.resolve({message:{warning:''}});await p;assert.equal(c.page.data.draft,'下一条新消息');
});
test('identical chat input before retry never changes the key for an uncertain message',async()=>{
 const c=client('chat'),posts=[];c.api.request=async(method,url,body)=>{posts.push(body);throw Error('消息返回中断');};await c.page.submit();c.page.input({detail:{value:c.page.data.draft}});await c.page.submit();assert.equal(posts[0].clientKey,posts[1].clientKey);
});
test('old chat safety sheet cannot report the new account peer',async()=>{
 const c=client('chat');c.page.safetyAction();c.switchOwner();c.page.data.chat={canSend:true,peerId:'new-peer'};await c.sheets[0].success({tapIndex:2});assert.equal(c.modals.length,0);
});
test('unloaded chat report confirmation cannot submit a report',async()=>{
 const c=client('chat');c.page.report(c.event({type:'message',id:'message-id'}));c.page.onUnload();await c.modals[0].success({confirm:true,content:'测试举报'});assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
});
test('failed quiet chat refresh pauses sending until a successful permission refresh',async()=>{
 const c=client('chat');c.page.data.hasSession=true;c.api.request=async()=>{throw Error('权限状态读取失败');};await c.page.refresh(true);await c.page.submit();assert.equal(c.page.data.chat.canSend,false);assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
});
test('guest contact login binds the chosen account before dispatching the application',async()=>{
 const c=client('detail');c.store.clear();await c.page.talk();await c.modals[0].success({confirm:true,content:'登录后继续联系'});assert.equal(c.calls.filter(x=>x.method==='POST').length,1);assert.equal(c.store.get('city_life_user_id'),'one');
});
test('browsing-history quota failure cannot turn a readable detail into an unavailable item',async()=>{
 const c=client('detail');c.recent.record=()=>{throw Error('storage quota');};c.api.request=async(method,url)=>url.endsWith('/saved')?{saved:false}:url.endsWith('/interaction')?{comments:[],likes:0,liked:false}:{item:{id:itemId,type:'community',kind:'listing'}};await c.page.refresh();assert.equal(c.page.data.item.id,itemId);assert.equal(c.page.data.error,'');assert.ok(c.page.data.historyNotice);
});
test('an older quiet chat read cannot hide a message acknowledged by a later send',async()=>{
 const c=client('chat'),gate=deferred();let reads=0;c.api.request=async method=>method==='POST'?{message:{warning:''}}:++reads===1?gate.promise:{items:[{id:'new-message',body:'已发送内容'}],canSend:true};const old=c.page.refresh(true);await c.page.submit();gate.resolve({items:[],canSend:true});await old;assert.equal(c.page.data.messages[0].id,'new-message');assert.equal(reads,2);
});
test('legitimate token renewal keeps newer chat text in the same account',async()=>{
 const c=client('chat'),gate=deferred();c.api.request=async method=>method==='POST'?gate.promise:{items:[],canSend:true};const p=c.page.submit();await tick();c.page.input({detail:{value:'续期期间写的新消息'}});c.store.set('city_life_v2_auth_token','renewed-token');gate.resolve({message:{warning:''}});await p;assert.equal(c.page.data.draft,'续期期间写的新消息');assert.equal(c.page.data.sending,false);
});
test('a failed message report never prepopulates a different target report',async()=>{
 const c=client('chat');c.api.request=async()=>{throw Error('举报返回失败');};c.page.report(c.event({type:'message',id:'message-id'}));await c.modals[0].success({confirm:true,content:'针对这条消息的描述'});assert.equal(c.page.data.reportDraft,'针对这条消息的描述');c.page.report(c.event({type:'user',id:'peer'}));assert.equal(c.modals[1].content,'');
});
test('public detail response from an earlier account context cannot restore old content',async()=>{
 const c=client('detail'),gate=deferred();c.page.data.item=null;c.api.request=()=>gate.promise;const p=c.page.refresh();c.switchOwner();gate.resolve({item:{id:itemId,type:'community',kind:'listing'}});await p;assert.equal(c.page.data.item,null);
});
test('a denied chat read removes previously loaded private messages',async()=>{
 const c=client('chat');c.api.request=async()=>{const e=Error('会话不属于当前账号');e.code='CHAT_UNAVAILABLE';throw e;};await c.page.refresh(true);assert.equal(c.page.data.chat,null);assert.equal(c.page.data.messages.length,0);assert.equal(c.page.data.permissionsReady,false);
});
test('a server-blocked chat send pauses further sends while retaining its draft',async()=>{
 const c=client('chat');let writes=0;c.api.request=async()=>{writes++;const e=Error('对方已关闭联系');e.code='CHAT_BLOCKED';throw e;};await c.page.submit();await c.page.submit();assert.equal(writes,1);assert.equal(c.page.data.chat.canSend,false);assert.equal(c.page.data.draft,'原始消息内容');
});


test('query product detail has no public posting, like, comment or reply controls', async()=>{
 const c=client('detail');
 for(const name of ['sendComment','setComment','like','moreComments','loadInteractions','deleteComment','reply'])assert.equal(c.page[name],undefined,name);
 const markup=fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/detail/index.wxml'),'utf8');
 assert.doesNotMatch(markup,/bindtap="(?:sendComment|like|reply|deleteComment|moreComments)"/);
});
