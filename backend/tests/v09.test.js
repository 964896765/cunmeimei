'use strict';
const {acceptedConsent}=require('./helpers/publication-confirmation');
const {acceptedFixtureRequest}=require('./helpers/publication-confirmation');
const legalConfig={operatorName:'Isolated operator',contactEmail:'privacy@example.test'},legal=require('../src/legal-documents').documents(legalConfig),accepted={consent:true,termsVersion:legal.termsVersion,privacyVersion:legal.privacyVersion,legalHash:legal.hash};
const test=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');

async function fixture(t,overrides={}){
 const repo=overrides.repo||createMemoryRepository();
 const app=createApp({legalConfig,repo,areas:['中心街道','北城区'],adminPassword:'test-admin-password-secure',allowDevLogin:true,...overrides});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base='http://127.0.0.1:'+app.address().port;
 const call=async(path,method='GET',body,access={})=>{
  const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(access.token?{Authorization:'Bearer '+access.token}:{}),...(access.cookie?{Cookie:access.cookie}:{}),...(access.csrf?{'X-CSRF-Token':access.csrf}:{})},body:body===undefined?undefined:JSON.stringify(acceptedFixtureRequest(path,method,body))});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
 };
 return {repo,call};
}

test('V0.9 disabling a region hides prior approved listings and service detail; re-enable restores them',async t=>{
 const {repo,call}=await fixture(t);
 await repo.seedRegions(['中心街道','北城区']);
 const user=await repo.upsertIdentity('dev_local','region-test');
 const listing=await repo.createPublication(user,{publicationConsent:acceptedConsent(),type:'used',title:'区域回归测试商品',description:'地区停用可见性校验内容',district:'北城区',price:'20'});
 assert.equal(await repo.reviewPublication(listing.id,'published',''),true);
 const service=await repo.addTestService({district:'北城区',title:'区域测试维修服务',description:'已发布的服务项目示例',price:'50'});
 assert.ok((await call('/api/v1/feed')).data.items.some(x=>x.id===listing.id));
 assert.equal((await call('/api/v1/items/'+listing.id)).status,200);
 assert.equal((await call('/api/v1/services/'+service.id+'/slots?date=2099-11-01')).status,200);
 const login=await call('/admin/api/login','POST',{password:'test-admin-password-secure'});
 const admin={cookie:login.cookie,csrf:login.data.csrf};
 assert.equal((await call('/admin/api/regions/status','POST',{name:'北城区',enabled:false},admin)).status,200);
 assert.equal((await call('/api/v1/feed')).data.items.some(x=>x.id===listing.id),false);
 assert.equal((await call('/api/v1/feed?area='+encodeURIComponent('北城区'))).data.items.length,0);
 assert.equal((await call('/api/v1/items/'+listing.id)).status,404);
 assert.equal((await call('/api/v1/items/'+service.id)).status,404);
 const reporter=(await call('/api/v1/dev/login','POST',{devUser:'region-reporter'})).data.token;
 assert.equal((await call('/api/v1/reports','POST',{targetType:'publication',targetId:listing.id,reason:'spam',description:''},{token:reporter})).status,404);
 assert.equal((await call('/api/v1/services/'+service.id+'/slots?date=2099-11-01')).status,404);
 const token=(await call('/api/v1/dev/login','POST',{devUser:'booking-region-user'})).data.token;
 assert.equal((await call('/api/v1/bookings','POST',{serviceId:service.id,date:'2099-11-01',time:'09:00'},{token})).status,404);
 assert.equal((await call('/api/v1/me/publications','GET',undefined,{token:(await call('/api/v1/dev/login','POST',{devUser:'region-test'})).data.token})).data.items.some(x=>x.id===listing.id),true,'author still sees own content');
 assert.equal((await call('/admin/api/regions/status','POST',{name:'北城区',enabled:true},admin)).status,200);
 assert.equal((await call('/api/v1/items/'+listing.id)).status,200);
 assert.equal((await call('/api/v1/services/'+service.id+'/slots?date=2099-11-01')).status,200);
});

test('V0.9 readiness validates schema as well as connectivity',async t=>{
 const repo=createMemoryRepository();let healthy=true;
 repo.verifySchema=async()=>{if(!healthy)throw Error('migration drift');return {ok:true};};
 const {call}=await fixture(t,{repo});
 assert.equal((await call('/api/v1/ready')).status,200);
 healthy=false;
 assert.equal((await call('/api/v1/ready')).status,503);
 assert.equal((await call('/api/v1/health')).status,200);
 assert.equal((await call('/api/v1/health')).data.version,require('../package.json').version);
 healthy=true;
 assert.equal((await call('/api/v1/ready')).status,200);
});

test('V0.9 mock WeChat login binds stable identity and respects server-verification failure',async t=>{
 const {call}=await fixture(t,{wechatAppId:'wx1234567890abcdef',wechatSecret:'test-secret-server-only',fetchWechat:async u=>({ok:true,async json(){const code=new URL(u).searchParams.get('js_code');return code==='bad-code'?{errcode:40029,errmsg:'invalid code'}:{openid:'openid-stable-'+code};}})});
 const login=await call('/api/v1/auth/wechat','POST',{...accepted,code:'auth-good'});
 assert.equal(login.status,200);
 assert.equal((await call('/api/v1/me','GET',undefined,{token:login.data.token})).data.userId,login.data.userId);
 const same=await call('/api/v1/auth/wechat','POST',{...accepted,code:'auth-good'});
 assert.equal(same.data.userId,login.data.userId);
 assert.notEqual(same.data.token,login.data.token);
 const bad=await call('/api/v1/auth/wechat','POST',{...accepted,code:'bad-code'});
 assert.equal(bad.status,401);assert.equal(bad.data.error,'WECHAT_CODE_INVALID');
 assert.equal((await call('/api/v1/auth/logout','POST',{}, {token:login.data.token})).status,200);
 assert.equal((await call('/api/v1/me','GET',undefined,{token:login.data.token})).status,401);
 assert.equal((await call('/api/v1/me','GET',undefined,{token:same.data.token})).status,200);
});
