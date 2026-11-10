'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function client(){
 const store=new Map(),requests=[],reads=[],downloads=[],deleted=[];
 const config={mode:'server',apiBaseUrl:'http://127.0.0.1:3101',devLogin:false};
 const wx={getStorageSync:key=>store.get(key)||'',setStorageSync:(key,value)=>store.set(key,value),removeStorageSync:key=>store.delete(key),login:({success})=>success({code:'isolated-media-code'}),request:o=>requests.push(o),downloadFile:o=>downloads.push(o),getFileSystemManager:()=>({readFile:o=>reads.push(o),unlink:o=>deleted.push(o.filePath)})};
 const context=()=>[store.get('city_life_user_id')||'',store.get('city_life_v2_auth_token')||''].join(':');
 let sandbox;const broker=require('./helpers/accepted-login')(()=>sandbox.module.exports);sandbox={module:{exports:{}},require:name=>name==='./runtime'?config:name==='./auth-intent'?broker:{context},wx,Uint8Array,ArrayBuffer};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/api.js'),'utf8'),sandbox);
 const set=(uid,token)=>{store.set('city_life_user_id',uid);store.set('city_life_v2_auth_token',token);};
 const answer=(i,statusCode,data)=>requests[i].success({statusCode,data});
 const jpeg=()=>new Uint8Array([255,216,255,224,0,16,74,70,73,70]).buffer;
 return {api:sandbox.module.exports,config,store,requests,reads,downloads,deleted,set,answer,jpeg,context};
}
function outcome(p){return p.then(value=>({value}),error=>({error}));}
test('late license 401 cannot clear a newer account or replay its binary payload',async()=>{
 const c=client();c.set('one','token-one');const p=outcome(c.api.uploadLicense('application',c.jpeg(),'image/jpeg'));await tick();c.set('two','token-two');c.answer(0,401,{error:'SESSION_EXPIRED'});await tick();
 // Resolve an accidental refresh/replay as well, so old behavior fails rather than hangs.
 for(let i=1;i<c.requests.length;i++){c.answer(i,200,c.requests[i].url.endsWith('/auth/wechat')?{userId:'one',token:'wrong-refresh'}:{ok:true});await tick();}
 assert.equal((await p).error?.code,'ACCOUNT_CHANGED');assert.equal(c.store.get('city_life_v2_auth_token'),'token-two');assert.equal(c.requests.length,1);
});
test('account change during local image read prevents dispatch even without explicit owner',async()=>{
 const c=client();c.set('one','token-one');const p=outcome(c.api.uploadImage('chosen-file'));c.set('two','token-two');c.reads[0].success({data:c.jpeg()});await tick();for(let i=0;i<c.requests.length;i++){c.answer(i,200,{image:{id:'wrong-image'}});await tick();}
 assert.equal((await p).error?.code,'ACCOUNT_CHANGED');assert.equal(c.requests.length,0);
});
test('successful old image upload cannot return an image for a new account form',async()=>{
 const c=client();c.set('one','token-one');const p=outcome(c.api.uploadImage('chosen-file'));c.reads[0].success({data:c.jpeg()});await tick();c.set('two','token-two');c.answer(0,201,{image:{id:'old-private-image'}});assert.equal((await p).error?.code,'ACCOUNT_CHANGED');
});
test('old session chooser context rejects before any file read',async()=>{
 const c=client();c.set('two','token-two');const p=outcome(c.api.uploadImage('chosen-file','one:token-one'));assert.equal((await p).error?.code,'ACCOUNT_CHANGED');assert.equal(c.reads.length,0);assert.equal(c.requests.length,0);
});
test('image expiry obtains a fresh token and retries once for the same owner',async()=>{
 const c=client();c.set('one','expired');const p=outcome(c.api.uploadImage('chosen-file'));c.reads[0].success({data:c.jpeg()});await tick();c.answer(0,401,{error:'SESSION_EXPIRED'});await tick();assert.ok(c.requests[1].url.endsWith('/auth/wechat'));c.answer(1,200,{userId:'one',token:'fresh-0123456789abcdef'});await tick();assert.equal(c.requests[2].header.Authorization,'Bearer fresh-0123456789abcdef');c.answer(2,201,{image:{id:'uploaded'}});assert.equal((await p).value.id,'uploaded');assert.equal(c.requests.length,3);
});
test('license and JSON expiry share the existing single-flight refresh',async()=>{
 const c=client();c.set('one','expired');const a=outcome(c.api.uploadLicense('application',c.jpeg(),'image/jpeg')),b=outcome(c.api.request('GET','/api/v1/me',null,true));await tick();c.answer(0,401,{error:'SESSION_EXPIRED'});await tick();c.answer(1,401,{error:'SESSION_EXPIRED'});await tick();assert.equal(c.requests.length,3);c.answer(2,200,{userId:'one',token:'fresh-0123456789abcdef'});await tick();assert.equal(c.requests.length,5);c.answer(3,200,{ok:true});c.answer(4,200,{ok:true});assert.ok((await a).value);assert.ok((await b).value);
});
test('reauthentication into a different user never resends the original image',async()=>{
 const c=client();c.set('one','expired');const p=outcome(c.api.uploadImage('chosen-file'));c.reads[0].success({data:c.jpeg()});await tick();c.answer(0,401,{error:'SESSION_EXPIRED'});await tick();c.answer(1,200,{userId:'two',token:'new-owner-0123456789'});await tick();for(let i=2;i<c.requests.length;i++)c.answer(i,201,{image:{id:'wrong'}});
 assert.equal((await p).error?.code,'ACCOUNT_CHANGED');assert.equal(c.requests.length,2);
});
test('late private download is refused and only its downloaded temporary file is discarded',async()=>{
 const c=client();c.set('one','token-one');const p=outcome(c.api.privateImage('image'));await tick();c.set('two','token-two');c.downloads[0].success({statusCode:200,tempFilePath:'wxfile://late-private-download'});assert.equal((await p).error?.code,'ACCOUNT_CHANGED');assert.deepEqual(c.deleted,['wxfile://late-private-download']);
});
test('private download refreshes once after 401 and discards the failed response file',async()=>{
 const c=client();c.set('one','expired');const p=outcome(c.api.privateImage('image'));await tick();c.downloads[0].success({statusCode:401,tempFilePath:'wxfile://expired-body'});await tick();assert.equal(c.requests.length,1);c.answer(0,200,{userId:'one',token:'fresh-0123456789abcdef'});await tick();assert.equal(c.downloads[1].header.Authorization,'Bearer fresh-0123456789abcdef');c.downloads[1].success({statusCode:200,tempFilePath:'wxfile://authorized-image'});assert.equal((await p).value,'wxfile://authorized-image');assert.deepEqual(c.deleted,['wxfile://expired-body']);
});
test('private image 403 does not prompt reauthentication or keep its response body',async()=>{
 const c=client();c.set('one','valid');const p=outcome(c.api.privateImage('image'));await tick();c.downloads[0].success({statusCode:403,tempFilePath:'wxfile://denied-body'});assert.ok((await p).error);assert.equal(c.requests.length,0);assert.deepEqual(c.deleted,['wxfile://denied-body']);
});
test('media transports validate HTTPS and apply finite upload/download timeouts',async()=>{
 const c=client();c.set('one','valid');const p=outcome(c.api.uploadLicense('application',c.jpeg(),'image/jpeg'));await tick();assert.equal(c.requests[0].timeout,15000);c.answer(0,201,{ok:true});await p;
 const d=outcome(c.api.privateImage('image/with?query'));await tick();assert.equal(c.downloads[0].timeout,15000);assert.ok(c.downloads[0].url.endsWith('image%2Fwith%3Fquery'));c.downloads[0].success({statusCode:200,tempFilePath:'wxfile://good'});await d;
 c.config.apiBaseUrl='http://unsafe.example';const denied=await outcome(c.api.privateImage('image'));assert.ok(denied.error);assert.equal(c.downloads.length,1);
});
test('oversized, empty and unsupported images never reach the network',async()=>{
 for(const data of [new ArrayBuffer(2*1024*1024+1),new ArrayBuffer(0),new Uint8Array([71,73,70,56,57,97]).buffer]){
  const c=client();c.set('one','valid');const p=outcome(c.api.uploadImage('file'));c.reads[0].success({data});await tick();for(let i=0;i<c.requests.length;i++)c.answer(i,201,{image:{id:'bad'}});assert.ok((await p).error);assert.equal(c.requests.length,0);
 }
});
test('logout invalidates a pending private download even if the same user signs in again',async()=>{
 const c=client();c.set('one','old-token');const p=outcome(c.api.privateImage('private-image'));await tick();const leaving=c.api.logout();c.set('one','new-token');c.answer(0,200,{ok:true});await leaving;c.downloads[0].success({statusCode:200,tempFilePath:'wxfile://old-session-private'});assert.equal((await p).error?.code,'ACCOUNT_CHANGED');assert.equal(c.store.get('city_life_v2_auth_token'),'new-token');assert.deepEqual(c.deleted,['wxfile://old-session-private']);
});
