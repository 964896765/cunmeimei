'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function client(request){
 let definition;const state={owner:'one:token',session:true},routes=[],modals=[],badges=[],app={globalData:{}};
 const sandbox={Page:value=>definition=value,require:name=>name.endsWith('/page-layout')?{show(){},hide(){},measure(){},header(){},scroll(){}}:name.endsWith('/api')?{request,hasSession:()=>state.session,online:()=>true,showError(){},logout:async()=>{state.session=false;state.owner='guest:'}}:name.endsWith('/points-workspace')?{initialState:{},open(){this.setData({mode:'points'});}}:name.endsWith('/personal-profile')?{fields:p=>({displayName:p.displayName||'附近的街坊',bio:p.bio||'',profileCityName:'',avatarImageId:p.avatarImageId||''}),avatar(){}}:name.endsWith('/privacy-settings')?{async openPrivacy(section){this.setData({mode:'privacy',settingsSection:section});}}:name.endsWith('/tab-bar')?{context:()=>state.owner,setUnread:n=>badges.push(n)}:name.endsWith('/theme')?{current:()=>({theme:'prism'}),apply(){}}:name.endsWith('/recent')?{ids:()=>state.recentIds||['item-1'],clear:()=>{state.historyCleared=true;}}:name.endsWith('/presentation')?{item:x=>x}:{},getApp:()=>app,wx:{showModal:v=>modals.push(v),getStorageSync:()=>state.owner,showToast(){},navigateTo:v=>routes.push(v.url),switchTab:v=>routes.push(v.url)}};
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

test('personal workspace keeps the original groups with unique actions and one avatar and verification editor',()=>{
 const markup=fs.readFileSync(path.join(__dirname,'../../miniprogram/pages/me/index.wxml'),'utf8');
 const main=markup.slice(markup.indexOf('<block wx:else><view class="main-center">'));
 const actions=[...main.matchAll(/(?:bindtap|catchtap)="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(actions.length,new Set(actions).size,'main workspace actions have a single visible entry');
 for(const action of ['goPosts','showFavorites','openDrafts','goBookings','showHistory','openNotifications','openPersonalData','openHelp','openAccount','openServiceCenter'])assert.ok(actions.includes(action),action+' remains addressable');
 assert.match(markup,/class="center-menu-row privacy-entry" bindtap="openPrivacy"/);
 assert.match(main,/personal-function-grid/);
 assert.equal((main.match(/bindtap="showAbout"/g)||[]).length,1);
 assert.ok(main.includes("{{hasSession?displayName:'欢迎来到村美美'}}"));
 assert.equal((main.match(/bindtap="inspectCache"/g)||[]).length,1);
 const profile=markup.slice(markup.indexOf("mode==='profile'"),markup.indexOf("<block wx:elif=\"{{mode==='service'}}\""));
 assert.equal((profile.match(/open-type="chooseAvatar"/g)||[]).length,1);
 const account=markup.slice(markup.indexOf("<block wx:elif=\"{{mode==='account'}}\""),markup.indexOf("<block wx:elif=\"{{mode==='help'}}\""));
 assert.equal((account.match(/bindtap="openVerification"/g)||[]).length,1);
 const help=markup.slice(markup.lastIndexOf("mode==='help'"),markup.lastIndexOf("mode==='about'"));
 assert.match(help,/bindtap="showAbout"/);
 assert.match(account,/wx:if="{{hasSession}}" id="account-signout"[^>]*bindtap="signout"/);
});


test('service center is a single independent card directly below the points center',()=>{
 const markup=fs.readFileSync(path.join(__dirname,'../../miniprogram/pages/me/index.wxml'),'utf8');
 const main=markup.slice(markup.indexOf('<block wx:else><view class="main-center">'));
 const points=main.indexOf('id="points-center-entry"'),service=main.indexOf('id="service-center-entry"'),functions=main.indexOf('class="personal-functions"');
 assert.ok(points>=0&&service>points&&functions>service);
 assert.match(main,/id="service-center-entry" class="service-center-card"/);
 assert.equal((main.match(/bindtap="openServiceCenter"/g)||[]).length,1);
 assert.ok(!main.slice(main.indexOf('class="center-menu personal-services"')).includes('id="service-center-entry"'));
});

test('nested personal settings return to their parent and retain the main scroll position',async()=>{
 const {page,state}=client(async(method,url)=>responses(url));
 await page.refresh();
 page.sectionScrollTop=420;
 page.openAccount();
 await page.openPersonalData();
 assert.equal(page.data.mode,'privacy');
 await page.back();
 assert.equal(page.data.mode,'account');
 await page.back();
 assert.equal(page.data.mode,'main');
 assert.equal(page.sectionScrollTop,420);
 await page.openClosure();
 assert.equal(page.data.requestKindIndex,3);
 assert.equal(page.data.settingsSection,'data');
 assert.equal(state.session,true);
});

test('returning to favorites rejects older requests for the same account and view',async()=>{
 const first=deferred(),second=deferred();let calls=0;
 const {page}=client(()=>++calls===1?first.promise:second.promise);
 const a=page.showFavorites();
 const b=page.showFavorites();
 second.resolve({items:[{id:'newer'}],hasMore:false});await b;
 first.resolve({items:[{id:'older'}],hasMore:false});await a;
 assert.equal(page.data.items.length,1);
 assert.equal(page.data.items[0].id,'newer');
});

test('favorite removal prevents duplicate writes and restores the control after failure',async()=>{
 const gate=deferred(),calls=[];
 const {page}=client(async(method,url)=>{calls.push([method,url]);return gate.promise;});
 page.data.mode='saved';page.data.items=[{id:'saved-1',isSaved:true}];
 const pending=page.removeSaved({detail:{id:'saved-1'}});
 await page.removeSaved({detail:{id:'saved-1'}});
 assert.equal(calls.length,1);
 assert.equal(page.data.items[0].favoriteBusy,true);
 gate.reject(Error('网络不可用'));await pending;
 assert.equal(page.data.items.length,1);
 assert.equal(page.data.items[0].favoriteBusy,false);
});

test('history revalidates all thirty local records and ignores stale clear confirmations',async()=>{
 const calls=[],{page,state,modals}=client(async(method,url)=>{calls.push(url);return {item:{id:url.split('/').at(-1)}};});
 state.recentIds=Array.from({length:30},(_,index)=>'record-'+index);
 await page.showHistory();
 assert.equal(calls.length,30);assert.equal(page.data.items.length,30);
 page.clearHistory();state.owner='two:token';modals.at(-1).success({confirm:true});
 assert.equal(state.historyCleared,undefined);
 state.owner='one:token';page.clearHistory();page.openHelp();modals.at(-1).success({confirm:true});
 assert.equal(state.historyCleared,undefined);
});

test('removing a favorite repairs the last loaded page before offset pagination continues',async()=>{
 const records=Array.from({length:25},(_,index)=>({id:'saved-'+index}));
 const {page}=client(async(method,url)=>{
  if(method==='DELETE'){records.splice(records.findIndex(item=>url.includes(item.id+'/saved')),1);return {saved:false};}
  if(url.includes('/me/saved?')){const offset=(Number(new URL(url,'http://test').searchParams.get('page'))-1)*20;return {items:records.slice(offset,offset+20),hasMore:offset+20<records.length};}
  return responses(url);
 });
 await page.refresh();await page.showFavorites();
 assert.equal(page.data.items.length,20);
 await page.removeSaved({detail:{id:'saved-5'}});
 assert.ok(page.data.items.some(item=>item.id==='saved-20'),'the shifted item is recovered');
 await page.loadSaved();
 assert.deepEqual(Array.from(page.data.items,item=>item.id),records.map(item=>item.id));
});
