'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function client(handler){
 let owner='one:token';const calls=[],modals=[];
 const api={hasSession:()=>true,request:async(method,url,payload)=>{calls.push({method,url,payload});return handler?handler(method,url,payload):reply(url);}};
 const context={module:{exports:{}},require:name=>name==='./api'?api:{context:()=>owner},wx:{showModal:v=>modals.push(v)},console};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/points-workspace.js'),'utf8'),context);
 const ui=context.module.exports,page={disposed:false,pointsVersion:0,data:{...structuredClone(ui.initialState),mode:'main'},setData:v=>Object.assign(page.data,v),signin:async()=>{}};
 return {ui,page,calls,modals,switchOwner:value=>{owner=value;}};
}
const row={id:'reward-1',amount:5,status:'rejected',revision:3,rule_code:'publication_approved',rule_revision:2,can_appeal:true,reason:'核查后未通过，可申请复核',created_at:'2026-10-31T01:00:00Z'};
test('notification targets can fetch a specific older record outside the first page',async()=>{
 const c=client(async(m,u)=>u.endsWith('/ledger/old-entry')?{item:{id:'old-entry',kind:'earn',available_delta:2,held_delta:0}}:reply(u));await c.ui.open.call(c.page,'ledger','old-entry');assert.equal(c.page.data.pointsRows[0].id,'old-entry');assert.equal(c.page.data.pointsFocusId,'old-entry');
});
function reply(url){
 if(url==='/api/v1/points/account')return {available:0,held:0,pending:5};
 if(url==='/api/v1/points/rules')return {items:[{code:'publication_approved',enabled:false,amount:5,dailyLimit:10,publicationDailyLimit:5,settlementHours:48,revision:2}]};
 if(url.includes('/rewards?'))return {items:[row]};
 if(url.includes('/ledger?'))return {items:[{id:'ledger-1',kind:'hold',amount:3,available_delta:-3,held_delta:3,available_after:0,held_after:3,created_at:'2026-10-31T01:00:00Z'}]};
 return {items:[]};
}
test('points balances stay unknown until loaded; real zero and Beijing timestamps are preserved',async()=>{
 const gate=deferred(),a=client(async(method,url)=>{if(url.endsWith('/account'))await gate.promise;return reply(url);});const pending=a.ui.open.call(a.page,'rewards');assert.equal(a.page.data.pointsAccount,null);assert.equal(a.page.data.pointsBusy,true);gate.resolve();await pending;assert.equal(a.page.data.pointsAccount.available,0);assert.equal(a.page.data.pointsRulesEnabled,false);assert.equal(a.page.data.pointsRows[0].dateLabel,'2026-10-31 09:00');assert.equal(a.page.data.pointsRows[0].canAppeal,true);
});
test('account switches, page exits and newer views reject late points responses',async()=>{
 const gate=deferred(),a=client(async(method,url)=>{if(url.endsWith('/account'))await gate.promise;return reply(url);});const pending=a.ui.open.call(a.page,'rewards');a.switchOwner('two:token');a.page.data.mode='main';gate.resolve();await pending;assert.equal(a.page.data.pointsAccount,null);assert.equal(a.page.data.pointsRows.length,0);
 const old=deferred();let accounts=0;const b=client(async(method,url)=>{if(url.endsWith('/account')&&++accounts===1)await old.promise;return reply(url);});const first=b.ui.open.call(b.page,'rewards');await b.ui.open.call(b.page,'ledger');old.resolve();await first;assert.equal(b.page.data.pointsView,'ledger');assert.equal(b.page.data.pointsRows[0].id,'ledger-1');assert.ok(b.page.data.pointsRows[0].subtitle.includes('-3'));
});
test('pagination deduplicates records and keeps loaded data on a failed next page',async()=>{
 let fail=false;const a=client(async(method,url)=>{if(url.includes('/rewards?offset=')){if(fail)throw Error('网络中断');const start=url.endsWith('=0')?0:19;return {items:Array.from({length:20},(_,i)=>({...row,id:'reward-'+(start+i)}))};}return reply(url);});await a.ui.open.call(a.page);await a.ui.load.call(a.page);assert.equal(a.page.data.pointsRows.length,39);assert.equal(a.page.data.pointsOffset,40);fail=true;await a.ui.load.call(a.page);assert.equal(a.page.data.pointsRows.length,39);assert.equal(a.page.data.pointsError,'网络中断');
});
test('appeal retries keep their idempotency key and cannot issue duplicate in-flight submissions',async()=>{
 const gate=deferred();let first=true;const a=client(async(method,url,payload)=>{if(method==='POST'){if(first){first=false;await gate.promise;throw Error('返回结果前网络中断');}return {appeal:{id:'appeal-1'}};}return reply(url);});await a.ui.open.call(a.page);a.ui.beginAppeal.call(a.page,{currentTarget:{dataset:{id:row.id}}});a.ui.appealReason.call(a.page,{detail:{value:'提供原始材料引用，申请复核该笔贡献'}});const pending=a.ui.submitAppeal.call(a.page);await a.ui.submitAppeal.call(a.page);assert.equal(a.calls.filter(x=>x.method==='POST').length,1);gate.resolve();await pending;const key=a.page.data.pointsDraft.clientKey;await a.ui.submitAppeal.call(a.page);const posts=a.calls.filter(x=>x.method==='POST');assert.equal(posts[1].payload.clientKey,key);assert.equal(a.page.data.pointsView,'appeals');assert.equal(a.page.data.pointsDraft,null);
});
test('withdrawal confirmation cannot act on a different identity and old submission cannot replace a newer view',async()=>{
 const a=client();await a.ui.open.call(a.page,'appeals');const pending=a.ui.withdrawAppeal.call(a.page,{currentTarget:{dataset:{id:'appeal-1'}}});a.switchOwner('two:token');a.modals[0].success({confirm:true});await pending;assert.equal(a.calls.filter(x=>x.method==='POST').length,0);
 const gate=deferred(),b=client(async(method,url)=>{if(method==='POST'){await gate.promise;return {appeal:{id:'appeal-1'}};}return reply(url);});await b.ui.open.call(b.page);b.ui.beginAppeal.call(b.page,{currentTarget:{dataset:{id:row.id}}});b.ui.appealReason.call(b.page,{detail:{value:'已准备原始材料，申请复核积分事件'}});const submitted=b.ui.submitAppeal.call(b.page);await b.ui.open.call(b.page,'ledger');gate.resolve();await submitted;assert.equal(b.page.data.pointsView,'ledger');
});
test('failed points summary does not fabricate balances and the panel keeps rule and empty states distinct',async()=>{
 const a=client(async()=>{throw Error('服务暂不可用');});await a.ui.open.call(a.page);assert.equal(a.page.data.pointsAccount,null);assert.equal(a.page.data.pointsError,'服务暂不可用');assert.equal(a.page.data.pointsBusy,false);
 const main=fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/me/index.wxml'),'utf8'),panel=fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/me/points-panel.wxml'),'utf8');assert.ok(main.includes('points-panel.wxml'));assert.ok(panel.includes('bindtap="openCommerce"'));assert.ok(panel.includes('!pointsBusy&&!pointsError&&!pointsRows.length'));assert.ok(panel.includes('bindtap="submitRewardAppeal"'));
});
