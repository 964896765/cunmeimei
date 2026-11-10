'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function client(){
 const store=new Map(),pending=[];let sandbox;const broker=require('./helpers/accepted-login')(()=>sandbox.module.exports);sandbox={module:{exports:{}},require:name=>name==='./auth-intent'?broker:({mode:'server',apiBaseUrl:'http://127.0.0.1:3101',devLogin:false}),wx:{getStorageSync:k=>store.get(k)||'',setStorageSync:(k,v)=>store.set(k,v),removeStorageSync:k=>store.delete(k),login:({success})=>success({code:'isolated-ui-code'}),request:options=>pending.push(options)}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/api.js'),'utf8'),sandbox);
 const set=(uid,token)=>{store.set('city_life_user_id',uid);store.set('city_life_v2_auth_token',token);};
 const answer=(i,status,data)=>pending[i].success({statusCode:status,data});
 return {api:sandbox.module.exports,store,pending,set,answer};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('logging out while login is pending cannot resurrect the old login',async()=>{
 const c=client(),login=c.api.login(),outcome=login.then(()=>null,e=>e);await c.api.logout();await tick();c.answer(0,200,{token:'old-token-0123456789',userId:'old-owner'});assert.equal((await outcome)?.code,'AUTH_CANCELLED');assert.equal(c.api.hasSession(),false);assert.equal(c.store.has('city_life_user_id'),false);
});
test('late 401 from a previous account cannot clear or replace the new session',async()=>{
 const c=client();c.set('owner-a','token-a');const request=c.api.request('POST','/api/v1/me/profile',{bio:'old-account-payload'},true),outcome=request.then(()=>null,e=>e);c.set('owner-b','token-b');c.answer(0,401,{error:'SESSION_EXPIRED'});await tick();
 // Resolve every unintended refresh/retry too so a regression cannot hang this test.
 for(let i=1;i<c.pending.length;i++){c.answer(i,200,c.pending[i].url.endsWith('/auth/wechat')?{token:'refreshed-old',userId:'owner-a'}:{ok:true});await tick();}
 assert.equal((await outcome)?.code,'ACCOUNT_CHANGED');assert.equal(c.store.get('city_life_user_id'),'owner-b');assert.equal(c.store.get('city_life_v2_auth_token'),'token-b');assert.equal(c.pending.length,1);
});
test('late logout response cannot clear another account that signed in meanwhile',async()=>{
 const c=client();c.set('owner-a','token-a');const logout=c.api.logout();c.set('owner-b','token-b');c.answer(0,200,{ok:true});await logout;assert.equal(c.store.get('city_life_user_id'),'owner-b');assert.equal(c.store.get('city_life_v2_auth_token'),'token-b');
});
test('an obsolete login completion cannot unlock a newer single-flight login',async()=>{
 const c=client(),old=c.api.login(),oldResult=old.then(()=>null,e=>e);await c.api.logout();const next=c.api.login();await tick();c.answer(0,200,{token:'old-token-0123456789',userId:'old-owner'});await oldResult;const joined=c.api.login();assert.equal(c.pending.length,2);c.answer(1,200,{token:'next-token-0123456789',userId:'next-owner'});assert.equal(await next,'next-token-0123456789');assert.equal(await joined,'next-token-0123456789');
});
test('a successful but obsolete private response is rejected after an account switch',async()=>{
 const c=client();c.set('owner-a','token-a');const p=c.api.request('GET','/api/v1/me/profile',null,true),outcome=p.then(()=>null,e=>e);c.set('owner-b','token-b');c.answer(0,200,{displayName:'previous account private profile'});assert.equal((await outcome)?.code,'ACCOUNT_CHANGED');
});
test('parallel expired requests in the same account share a single refresh',async()=>{
 const c=client();c.set('owner-a','expired-token');const a=c.api.request('GET','/api/v1/me/profile',null,true),b=c.api.request('GET','/api/v1/me/summary',null,true);
 c.answer(0,401,{error:'SESSION_EXPIRED'});await tick();c.answer(1,401,{error:'SESSION_EXPIRED'});await tick();assert.equal(c.pending.length,3);assert.ok(c.pending[2].url.endsWith('/auth/wechat'));
 c.answer(2,200,{token:'fresh-token-0123456789',userId:'owner-a'});await tick();assert.equal(c.pending.length,5);c.answer(3,200,{ok:'one'});c.answer(4,200,{ok:'two'});assert.ok((await a).ok);assert.ok((await b).ok);assert.equal(c.store.get('city_life_v2_auth_token'),'fresh-token-0123456789');
});
