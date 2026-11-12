'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function client(request){
 let definition;const state={owner:'one:token',session:true},routes=[],modals=[],badges=[],app={globalData:{}};
 const sandbox={Page:value=>definition=value,require:name=>name.endsWith('/api')?{request,hasSession:()=>state.session,online:()=>true,showError(){},logout:async()=>{state.session=false;state.owner='guest:'}}:name.endsWith('/points-workspace')?{initialState:{},open(){this.setData({mode:'points'});}}:name.endsWith('/personal-profile')?{fields:p=>({displayName:p.displayName||'附近的街坊',bio:p.bio||'',profileCityName:'',avatarImageId:p.avatarImageId||''}),avatar(){}}:name.endsWith('/tab-bar')?{context:()=>state.owner,setUnread:n=>badges.push(n)}:name.endsWith('/theme')?{current:()=>({theme:'prism'}),apply(){}}:name.endsWith('/recent')?{ids:()=>['item-1']}:name.endsWith('/presentation')?{item:x=>x}:{},getApp:()=>app,wx:{showModal:v=>modals.push(v),getStorageSync:()=>state.owner,showToast(){},navigateTo:v=>routes.push(v.url),switchTab:v=>routes.push(v.url)}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../miniprogram/pages/me/index.js'),'utf8'),sandbox);
 const page={data:structuredClone(definition.data),setData:v=>Object.assign(page.data,v)};
 for(const [name,fn]of Object.entries(definition))if(typeof fn==='function')page[name]=fn.bind(page);
 return {page,state,routes,modals,badges,app};
}
const responses=url=>url.endsWith('/summary')?{publications:21,bookings:13,saved:0,unread:2}:url.endsWith('/profile')?{displayName:'测试街坊'}:url.endsWith('/merchants')?{items:[]}:url.endsWith('/merchant-application')?{application:null}:url.includes('/saved?')?{items:[{id:'saved-1'}],hasMore:false}:{userId:'one'};
test('personal workspace counts remain unknown until real summary succeeds and preserve actual zero',async()=>{
 const gate=deferred(),{page}=client(async(method,url)=>{await gate.promise;return responses(url)});
 const pending=page.refresh();assert.equal(page.data.postCount,null);assert.equal(page.data.summaryLoading,true);gate.resolve();await pending;
 assert.equal(page.data.postCount,21);assert.equal(page.data.bookingCount,13);assert.equal(page.data.favCount,0);assert.equal(page.data.displayName,'测试街坊');assert.equal(page.data.summaryError,'');
});
test('failed personal summary exposes retry and does not fabricate counts or lose existing good data',async()=>{
 let failed=true;const {page}=client(async(method,url)=>{if(failed)throw Error('网络不可用');return responses(url)});
 await page.refresh();assert.equal(page.data.postCount,null);assert.equal(page.data.summaryError,'网络不可用');assert.equal(page.data.summaryLoading,false);
 failed=false;await page.refresh();assert.equal(page.data.postCount,21);failed=true;await page.refresh();assert.equal(page.data.postCount,21);assert.equal(page.data.summaryError,'网络不可用');
});
test('previous-account and unloaded summary results cannot overwrite a guest workspace',async()=>{
 const gate=deferred(),a=client(async(method,url)=>{await gate.promise;return responses(url)});
 const pending=a.page.refresh();a.state.owner='guest:';a.state.session=false;await a.page.refresh();gate.resolve();await pending;
 assert.equal(a.page.data.hasSession,false);assert.equal(a.page.data.myUserId,'');assert.equal(a.page.data.displayName,'附近的街坊');assert.equal(a.page.data.postCount,null);assert.equal(a.badges.at(-1),0);
 const other=deferred(),b=client(async(method,url)=>{await other.promise;return responses(url)}),p=b.page.refresh();b.page.onUnload();other.resolve();await p;assert.equal(b.page.data.postCount,null);
});
test('workspace retains three core entries and existing account/help management without a draft destination',()=>{
 const {page,routes,app,modals}=client(async()=>({}));
 page.goPosts();page.goBookings();page.goMerchant();page.goMessages();
 assert.deepEqual(routes,['/pages/my-posts/index','/pages/my-bookings/index','/pages/merchant/index','/pages/messages/index']);assert.equal(page.goDrafts,undefined);assert.equal(app.globalData.openDrafts,undefined);
 page.openAccount();assert.equal(page.data.mode,'account');page.openHelp();assert.equal(page.data.mode,'help');page.showPoints();assert.equal(page.data.mode,'points');
});
test('late favorite data cannot update a different identity or replace the account panel',async()=>{
 const gate=deferred(),{page,state}=client(()=>gate.promise);page.data.mode='saved';page.data.hasMore=true;
 const pending=page.loadSaved();page.openAccount();gate.resolve({items:[{id:'old-account-record'}],hasMore:false});await pending;assert.equal(page.data.items.length,0);assert.equal(page.data.mode,'account');assert.equal(page.data.loading,false);
 const other=deferred(),b=client(()=>other.promise);b.page.data.mode='saved';const p=b.page.loadSaved();b.state.owner='two:token';other.resolve({items:[{id:'old-record'}],hasMore:false});await p;assert.equal(b.page.data.items.length,0);
});
test('logout modal callbacks cannot log out another identity',async()=>{
 const calls=[],{page,state,modals}=client(async(...args)=>{calls.push(args);return {}});
 page.signout();state.owner='two:token';for(const modal of modals)await modal.success({confirm:true,content:'不应保存'});
 assert.equal(calls.length,0);assert.equal(state.session,true);
});

test('personal workspace exposes four real counts and keeps draft loading independent of summary',async()=>{
 const calls=[],{page}=client(async(method,url)=>{calls.push(url);return responses(url);});
 await page.refresh();assert.ok(!calls.some(url=>url.includes('draft')));assert.equal(page.data.draftCount,null);
 assert.equal(typeof page.openDrafts,'function');assert.equal(typeof page.loadDraftCount,'function');
 const markup=fs.readFileSync(path.join(__dirname,'../../miniprogram/pages/me/index.wxml'),'utf8');
 assert.equal((markup.match(/class="workspace-item /g)||[]).length,4);
 assert.ok(markup.includes('bindtap="openDrafts"'));
});

test('personal workspace presents one entry per action and uses one avatar and verification editor',()=>{
 const markup=fs.readFileSync(path.join(__dirname,'../../miniprogram/pages/me/index.wxml'),'utf8');
 const main=markup.slice(markup.indexOf('<block wx:else><view class="main-center">'));
 const actions=[...main.matchAll(/bindtap="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(actions.length,new Set(actions).size,'main workspace actions have a single visible entry');
 for(const action of ['goPosts','showFavorites','openDrafts','goBookings','showHistory','openNotifications','openPrivacy','openPersonalData','openHelp','openAccount','openServiceCenter'])assert.ok(actions.includes(action),action+' remains addressable');
 assert.doesNotMatch(main,/personal-function-grid|bindtap="showAbout"|bindtap="goMessages"/);
 const profile=markup.slice(markup.indexOf("mode==='profile'"),markup.indexOf("<block wx:elif=\"{{mode==='service'}}\""));
 assert.equal((profile.match(/open-type="chooseAvatar"/g)||[]).length,1);
 const account=markup.slice(markup.indexOf("<block wx:elif=\"{{mode==='account'}}\""),markup.indexOf("<block wx:elif=\"{{mode==='help'}}\""));
 assert.equal((account.match(/bindtap="openVerification"/g)||[]).length,1);
 assert.ok(markup.includes('class="center-menu-row about-action" bindtap="showAbout"'));
});
