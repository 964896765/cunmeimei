'use strict';
const legalConfig={operatorName:'Isolated operator',contactEmail:'privacy@example.test'},legal=require('../src/legal-documents').documents(legalConfig),accepted={consent:true,termsVersion:legal.termsVersion,privacyVersion:legal.privacyVersion,legalHash:legal.hash};
const test=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');

test('V0.14: excessive WeChat code exchanges are rejected before calling WeChat again',async t=>{
 const repo=createMemoryRepository();let exchangeCount=0;
 const app=createApp({legalConfig,repo,areas:['中心街道'],wechatAppId:'wx-test-app',wechatSecret:'server-test-secret',
   fetchWechat:async()=>{exchangeCount++;return {ok:true,json:async()=>({openid:'same-test-id'})};}});
 await new Promise(ok=>app.listen(0,'127.0.0.1',ok));
 t.after(()=>new Promise(ok=>app.close(ok)));
 const base='http://127.0.0.1:'+app.address().port;
 const send=()=>fetch(base+'/api/v1/auth/wechat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...accepted,code:'safe-code'})});
 for(let i=0;i<20;i++){const res=await send();assert.equal(res.status,200);}
 const limited=await send();assert.equal(limited.status,429);assert.equal((await limited.json()).error,'LOGIN_RATE_LIMIT');
 assert.equal(exchangeCount,20,'rate-limited requests must not contact the remote WeChat API');
 const health=await fetch(base+'/api/v1/health');
 assert.equal((await health.json()).version,require('../package.json').version);
 assert.equal(app.requestTimeout,15000);
});
