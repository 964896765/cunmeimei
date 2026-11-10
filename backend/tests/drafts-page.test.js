'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function client(request=async()=>({payload:null})){
 let definition,uid='owner-a';const storage={},modals=[],routes=[];
 const wx={getStorageSync:k=>k==='city_life_user_id'?uid:structuredClone(storage[k]),setStorageSync:(k,v)=>storage[k]=structuredClone(v),removeStorageSync:k=>delete storage[k],showModal:v=>modals.push(v),navigateTo:v=>routes.push(v.url),switchTab:v=>routes.push(v.url),navigateBack:()=>routes.push('back')};
 const sandbox={module:{exports:{}},wx};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/local-drafts.js'),'utf8'),sandbox);const drafts=sandbox.module.exports;
 const api={online:()=>true,hasSession:()=>true,request,privateImage:async()=>''};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/drafts/index.js'),'utf8'),{Page:d=>definition=d,wx,getCurrentPages:()=>[{route:'pages/publish/index'},{route:'pages/drafts/index'}],require:n=>n.endsWith('/local-drafts')?drafts:n.endsWith('/api')?api:require('../../miniprogram/utils/'+n.split('/').pop())});
 const page={data:structuredClone(definition.data),setData(v){Object.assign(this.data,structuredClone(v));}};for(const [k,v]of Object.entries(definition))if(typeof v==='function')page[k]=v.bind(page);
 return {page,drafts,storage,modals,routes,api,changeOwner:()=>uid='owner-b'};
}
const local=(id,savedAt=1)=>({kind:'used',title:'草稿'+id,photos:[],attributes:{categoryId:'C04G01S01'},clientKey:id,savedAt});
test('refusing expired-account login never reads or exposes its local drafts',async()=>{
 const c=client();c.api.hasSession=()=>false;c.api.login=async()=>{throw Object.assign(Error('cancelled'),{code:'AUTH_CANCELLED'});};let reads=0;c.drafts.list=()=>{reads++;return [local('private')];};await c.page.refresh();assert.equal(reads,0);assert.equal(c.page.data.items.length,0);assert.equal(c.page.data.loading,false);assert.equal(c.page.data.requiresLogin,true);
});
test('independent draft page merges and orders source-labelled records without hiding divergent account data',async()=>{
 const c=client(async()=>({payload:{...local('same'),imageIds:[]},revision:7,updatedAt:'2026-10-20T10:00:00Z'}));c.storage['city_life_drafts_owner-a']=[local('same',2),local('older',1)];await c.page.refresh();assert.equal(c.page.data.items.length,3);assert.equal(c.page.data.items[0].source,'account');assert.equal(c.page.data.items[0].revision,7);assert.equal(c.page.data.items[1].sourceText,'本机保存');assert.equal(c.page.data.items[1].category,'二手闲置 · 二手手机');c.page.goBack();assert.ok(c.routes.includes('back'));
});
test('failed account reads retain local rows and expose retry instead of falsely reporting an empty draft box',async()=>{
 const c=client(async()=>{throw Error('offline');});c.storage['city_life_drafts_owner-a']=[local('local-only')];await c.page.refresh();assert.equal(c.page.data.items.length,1);assert.match(c.page.data.cloudError,/offline/);assert.equal(c.page.data.hasItems,true);
});
test('per-card deletion requires confirmation and rejects stale local records',async()=>{
 const c=client();c.storage['city_life_drafts_owner-a']=[local('delete-this')];await c.page.refresh();const event={currentTarget:{dataset:{id:c.page.data.items[0].id}}};c.page.deleteDraft(event);await c.modals[0].success({confirm:false});assert.equal(c.drafts.list('owner-a').length,1);
 c.page.deleteDraft(event);c.storage['city_life_drafts_owner-a'][0].title='确认期间的新内容';await c.modals[1].success({confirm:true});assert.match(c.page.data.error,/变化/);assert.equal(c.drafts.list('owner-a')[0].title,'确认期间的新内容');await c.page.refresh();c.page.deleteDraft(event);await c.modals[2].success({confirm:true});assert.equal(c.drafts.list('owner-a').length,0);assert.equal(c.page.data.hasItems,false);
});
test('account deletion sends the observed revision and a conflict leaves the existing row visible',async()=>{
 const calls=[],c=client(async(method,url,body)=>{calls.push({method,body});if(method==='DELETE')throw Error('revision conflict');return {payload:{...local('cloud'),imageIds:[]},revision:5,updatedAt:null};});await c.page.refresh();c.page.deleteDraft({currentTarget:{dataset:{id:c.page.data.items[0].id}}});await c.modals[0].success({confirm:true});assert.equal(calls.find(x=>x.method==='DELETE').body.expectedRevision,5);assert.equal(c.page.data.items.length,1);assert.match(c.page.data.error,/conflict/);
});
test('late reads and old deletion confirmations cannot reveal or delete drafts after an account switch',async()=>{
 let finish;const c=client(()=>new Promise(r=>finish=r));const loading=c.page.refresh();c.changeOwner();finish({payload:{...local('private'),imageIds:[]},revision:1});await loading;assert.equal(c.page.data.items.length,0);
 const d=client();d.storage['city_life_drafts_owner-a']=[local('private')];await d.page.refresh();d.page.deleteDraft({currentTarget:{dataset:{id:d.page.data.items[0].id}}});d.changeOwner();await d.modals[0].success({confirm:true});assert.equal(d.storage['city_life_drafts_owner-a'].length,1);
});
test('preview and actual detail share price units, public geography and allowed attribute fields',()=>{
 const display=require('../../miniprogram/utils/publication-display'),a={templateVersion:'3',categoryId:'C05G01S03',cityCode:'310100',districtCode:'310101',intent:'出租',area:'65',layout:'两室一厅',secret:'must-not-appear'},facts=display.describe('housing',a,'2800','旧平台范围');assert.equal(facts.priceText,'¥2800 /月');assert.match(facts.locationText,/上海市/);assert.ok(!facts.locationText.includes('旧平台范围'));assert.ok(!JSON.stringify(facts).includes('must-not-appear'));assert.equal(display.describe('used',{},'面议').priceText,'面议');assert.equal(display.describe('used',{},0).priceText,'¥0');
});
