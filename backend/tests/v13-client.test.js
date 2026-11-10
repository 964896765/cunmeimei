'use strict';
const {residentFields}=require('./helpers/resident-fields');
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');

// Node-only WeChat adapter: exercises actual mini program util/api.js over a real local HTTP server.
// It does NOT claim to simulate WeChat developer tools, OS permissions or real wx.login.
test('V0.13: miniprogram API login, publish, expired-token refresh, and explicit logout over HTTP', async t=>{
 const legalConfig={operatorName:'Isolated operator',contactEmail:'privacy@example.test'},legal=require('../src/legal-documents').documents(legalConfig),accepted={consent:true,termsVersion:legal.termsVersion,privacyVersion:legal.privacyVersion,legalHash:legal.hash};
 const repo=createMemoryRepository();
 const server=createApp({legalConfig,repo,areas:['中心街道'],wechatAppId:'test-wx-app',wechatSecret:'server-only-test-secret',
  fetchWechat:async ()=>({ok:true,json:async()=>({openid:'v13-test-wechat-openid'})})});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(()=>new Promise(ok=>server.close(ok)));
 const base='http://127.0.0.1:'+server.address().port;
 const runtime=require('../../miniprogram/utils/runtime');
 const old={...runtime};Object.assign(runtime,{mode:'server',apiBaseUrl:base,devLogin:false});
 let logins=0;const store=new Map();const previousWx=global.wx;
 global.wx={
  login({success}){logins++;queueMicrotask(()=>success({code:'test-temporary-wx-code'}));},
  setStorageSync(k,v){store.set(k,v);},getStorageSync(k){return store.get(k)||'';},removeStorageSync(k){store.delete(k);},
  request({url,method='GET',data,header,success,fail}){
   (async()=>{const response=await fetch(url,{method,headers:header,body:['GET','HEAD'].includes(method)?undefined:JSON.stringify(data||{})});
    const res={statusCode:response.status,data:await response.json()};success(res);
   })().catch(fail);
  }
 };
 t.after(()=>{Object.assign(runtime,old);global.wx=previousWx;delete require.cache[require.resolve('../../miniprogram/utils/api')];});
 delete require.cache[require.resolve('../../miniprogram/utils/api')];
 const api=require('../../miniprogram/utils/api'),broker=require('../../miniprogram/utils/auth-intent');
 const saved={...broker};Object.assign(broker,require('./helpers/accepted-login')(()=>api,accepted));t.after(()=>Object.assign(broker,saved));
 assert.equal(api.online(),true);
 const [tokenA,tokenB]=await Promise.all([api.login(),api.login()]);
 assert.equal(tokenA,tokenB);assert.equal(logins,1,'concurrent login is singleflight');
 assert.ok(api.hasSession());
 const first=await api.request('POST','/api/v1/publications',{...residentFields(),type:'used',title:'联调测试桌椅',detail:'小程序真实 HTTP 适配器写入后端',district:'中心街道',price:'50'},true);
 assert.equal(first.publication.status,'pending');
 assert.equal((await api.request('GET','/api/v1/me/publications',null,true)).items.length,1);
 assert.equal((await api.request('GET','/api/v1/feed')).items.length,0,'unreviewed stays private');
 assert.equal(await repo.revokeSession(crypto.createHash('sha256').update(tokenA).digest('hex')),true);
 const own=await api.request('GET','/api/v1/me',null,true);
 assert.ok(own.userId);assert.equal(logins,2,'expired token renews by reissuing wx.login');
 const freshToken=store.get('city_life_v2_auth_token');assert.notEqual(freshToken,tokenA);
 await api.logout();assert.equal(api.hasSession(),false);
 assert.equal(await repo.authenticate(crypto.createHash('sha256').update(freshToken).digest('hex')),null);
});
