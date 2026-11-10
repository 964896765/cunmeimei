'use strict';
const legalConfig={operatorName:'Isolated operator',contactEmail:'privacy@example.test'},legal=require('../src/legal-documents').documents(legalConfig),accepted={consent:true,termsVersion:legal.termsVersion,privacyVersion:legal.privacyVersion,legalHash:legal.hash};
const test=require('node:test'),assert=require('node:assert/strict');
const {makeClientAddress,canonicalIp,parseTrustedProxyIps}=require('../src/client-address');
const {validateDeployment}=require('../src/deployment-check');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');

async function start(t,options={}){
 const app=createApp({legalConfig,repo:createMemoryRepository(),areas:['中心街道'],...options});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 return `http://127.0.0.1:${app.address().port}`;
}
const post=async(base,path,payload,headers={})=>{
 const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
 return {status:r.status,body:await r.json()};
};

test('V0.24 canonical IP and trusted proxy allowlist reject invalid values',()=>{
 assert.equal(canonicalIp('::ffff:127.0.0.1'),'127.0.0.1');
 assert.equal(canonicalIp('198.51.100.3'),'198.51.100.3');
 assert.equal(canonicalIp('bad'), '');
 assert.deepEqual(parseTrustedProxyIps('127.0.0.1,::1'),['127.0.0.1','::1']);
 for(const bad of ['not-an-ip','127.0.0.1,','10.0.0.0/8',Array(17).fill('127.0.0.1')])assert.throws(()=>parseTrustedProxyIps(bad),/TRUSTED_PROXY_IPS_INVALID/);
 assert.ok(validateDeployment({TRUSTED_PROXY_IPS:'abc'}).errors.includes('TRUSTED_PROXY_IPS_INVALID'));
});

test('V0.24: spoofed X-Real-IP / X-Forwarded-For ignored without explicit trust',async t=>{
 let calls=0;
 const base=await start(t,{wechatAppId:'wx1234567890abcdef',wechatSecret:'test-only-secret-for-mock',fetchWechat:async()=>{calls++;return {ok:true,json:async()=>({openid:'fake-id-123456'})};}});
 for(let i=0;i<20;i++){
  const r=await post(base,'/api/v1/auth/wechat',{...accepted,code:'abcde'}, {'X-Real-IP':'198.51.100.'+(i+1),'X-Forwarded-For':'203.0.113.'+(i+1)});
  assert.equal(r.status,200);
 }
 const r=await post(base,'/api/v1/auth/wechat',{...accepted,code:'abcde'}, {'X-Real-IP':'203.0.113.100'});
 assert.equal(r.status,429);
 assert.equal(calls,20,'spoofed headers cannot bypass rate limit');
});

test('V0.24: trusted local reverse proxy isolates client login quotas by validated X-Real-IP',async t=>{
 let calls=0;
 const base=await start(t,{trustedProxyIps:['127.0.0.1'],wechatAppId:'wx1234567890abcdef',wechatSecret:'test-only-secret-for-mock',fetchWechat:async()=>{calls++;return {ok:true,json:async()=>({openid:'fake-id-123456'})};}});
 for(let i=0;i<20;i++)assert.equal((await post(base,'/api/v1/auth/wechat',{...accepted,code:'abcde'},{'X-Real-IP':'198.51.100.7'})).status,200);
 assert.equal((await post(base,'/api/v1/auth/wechat',{...accepted,code:'abcde'},{'X-Real-IP':'198.51.100.7'})).status,429);
 assert.equal((await post(base,'/api/v1/auth/wechat',{...accepted,code:'abcde'},{'X-Real-IP':'198.51.100.8'})).status,200);
 assert.equal(calls,21);
 const address=makeClientAddress('127.0.0.1');
 assert.equal(address({socket:{remoteAddress:'::ffff:127.0.0.1'},headers:{'x-real-ip':'198.51.100.8'}}),'198.51.100.8');
 assert.equal(address({socket:{remoteAddress:'::ffff:127.0.0.1'},headers:{'x-real-ip':'198.51.100.8, 203.0.113.1'}}),'127.0.0.1');
 assert.equal(address({socket:{remoteAddress:'192.0.2.5'},headers:{'x-real-ip':'198.51.100.8'}}),'192.0.2.5');
});

test('V0.24: admin login limiter uses trusted visitor IP; peer itself stays authoritative when untrusted',async t=>{
 const pass='super-safe-test-admin-password-123';
 const base=await start(t,{trustedProxyIps:['127.0.0.1'],adminPassword:pass});
 for(let i=0;i<5;i++)assert.equal((await post(base,'/admin/api/login',{password:'wrong'},{'X-Real-IP':'198.51.100.1'})).status,401);
 assert.equal((await post(base,'/admin/api/login',{password:pass},{'X-Real-IP':'198.51.100.1'})).status,429);
 assert.equal((await post(base,'/admin/api/login',{password:pass},{'X-Real-IP':'198.51.100.2'})).status,200);
});

test('V0.24: forwarded request headers never enable development login through a proxy',async t=>{
 const base=await start(t,{allowDevLogin:true,trustedProxyIps:['127.0.0.1']});
 assert.equal((await post(base,'/api/v1/dev/login',{devUser:'tester-one'})).status,200);
 for(const h of [{'X-Real-IP':'198.51.100.9'},{'X-Forwarded-For':'198.51.100.9'},{Forwarded:'for=198.51.100.9'}]){
  assert.equal((await post(base,'/api/v1/dev/login',{devUser:'tester-one'},h)).status,404);
 }
});
