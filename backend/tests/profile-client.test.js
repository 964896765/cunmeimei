'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(request=async()=>({items:[]})){
 const state={owner:'one:token'},modals=[],routes=[],writes=[],themeWrites=[];
 const page={data:{mode:'main',hasSession:true,displayName:'街坊',bio:'',myUserId:'one',profileBusy:false,summaryLoading:false},setData(v){Object.assign(this.data,v);},async refresh(){},async signin(){}};
 const api={hasSession:()=>true,request,uploadImage:async()=>({id:'image'}),showError(){}};
 const sandbox={module:{exports:{}},wx:{showModal:v=>modals.push(v),showToast(){},navigateTo:v=>routes.push(v),getStorageSync:()=> 'one'},require:name=>name==='./api'?api:name==='./tab-bar'?{context:()=>state.owner}:name==='./theme'?{store:p=>themeWrites.push(p),apply(){}}:name==='./geography'?{findCity:code=>code==='310100'?{name:'上海市'}:null}:name==='./avatar-cache'?{size:()=>1024,clear:id=>writes.push(id)}:{}};
 function load(file){sandbox.module={exports:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils',file),'utf8'),sandbox);return sandbox.module.exports;}
 return {state,modals,routes,writes,themeWrites,page,api,load};
}
test('profile editors preserve empty bio and prevent late account-switch writes',async()=>{
 const calls=[],a=setup(async(...args)=>{calls.push(args);return {}}),profile=a.load('personal-profile.js');
 profile.editProfileField.call(a.page,{currentTarget:{dataset:{field:'bio'}}});await a.modals[0].success({confirm:true,content:''});await new Promise(r=>setImmediate(r));
 assert.equal(calls[0][2].bio,'');
 profile.editProfileField.call(a.page,{currentTarget:{dataset:{field:'displayName'}}});a.state.owner='two:token';await a.modals[1].success({confirm:true,content:'另一个账号'});assert.equal(calls.length,1);
});
test('late avatar upload cannot attach to another identity',async()=>{
 const gate=deferred(),calls=[],a=setup(async(...args)=>calls.push(args)),profile=a.load('personal-profile.js');a.api.uploadImage=()=>gate.promise;
 const pending=profile.chooseAvatar.call(a.page,{detail:{avatarUrl:'local-image'}});a.state.owner='two:token';gate.resolve({id:'old-image'});await pending;assert.equal(calls.length,0);
});
test('profile city selection uses its own purpose and ignores an old identity callback',async()=>{
 const calls=[],a=setup(async(...args)=>calls.push(args)),profile=a.load('personal-profile.js');profile.selectProfileCity.call(a.page);
 assert.match(a.routes[0].url,/purpose=profile/);a.state.owner='two:token';a.routes[0].events.citySelected({cityCode:'310100'});assert.equal(calls.length,0);
});
test('cache confirmation is based on actual size and does not clear account storage',()=>{
 const a=setup(),profile=a.load('personal-profile.js');profile.inspectCache.call(a.page);assert.match(a.modals[0].content,/1.0 KB/);assert.match(a.modals[0].content,/草稿、发布、收藏/);
 a.modals[0].success({confirm:false});assert.equal(a.writes.length,0);a.modals[0].success({confirm:true});assert.deepEqual(a.writes,['one']);
});
test('late privacy response cannot store another account preferences or overwrite a newer section',async()=>{
 const gate=deferred(),a=setup(()=>gate.promise),privacy=a.load('privacy-settings.js');
 const pending=privacy.openPrivacy.call(a.page,'data');a.state.owner='two:token';gate.resolve({items:[]});await pending;assert.equal(a.themeWrites.length,0);
 const other=deferred(),b=setup(()=>other.promise),prefs=b.load('privacy-settings.js');const request=prefs.openPrivacy.call(b.page,'privacy');b.page.settingsVersion++;b.page.data.mode='main';other.resolve({items:[]});await request;assert.equal(b.themeWrites.length,0);
});
test('profile patch rejects unsupported identity changes, invalid cities and long input',()=>{
 const {profilePatch}=require('../src/profile');assert.deepEqual(profilePatch({bio:'',cityCode:'',avatarImageId:null}),{bio:'',cityCode:'',avatarImageId:null});
 for(const p of [{userId:'x'},{cityCode:'310101'},{displayName:'x'},{bio:'a'.repeat(121)},{}])assert.throws(()=>profilePatch(p));
});
