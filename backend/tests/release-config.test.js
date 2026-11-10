'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {checkWxRelease}=require('../../scripts/check_wx_release');
// Explicit fixtures keep this unit test independent of a developer's active AppID/mode.
const config={appid:'touristappid',setting:{urlCheck:false}};
const runtime={mode:'demo',devLogin:false,apiBaseUrl:''};
test('V0.8 release checker blocks the intentional demo configuration',()=>{
 const report=checkWxRelease(config,runtime);
 assert.equal(report.ok,false);
 for(const key of ['REAL_APPID_REQUIRED','DOMAIN_CHECK_MUST_BE_ENABLED','SERVER_MODE_REQUIRED'])assert.ok(report.errors.includes(key));
});
test('release checks reject IPs, local hosts and private domain-check overrides',()=>{
 const project={appid:'wx1234567890abcdef',setting:{urlCheck:true}};
 const runtime={mode:'server',devLogin:false,apiBaseUrl:'https://api.example.cn'};
 for(const host of ['localhost','127.0.0.2','10.0.0.1','192.168.1.2','[::1]','[::ffff:127.0.0.1]','2130706433','api.local','api.internal','api.test','api.invalid','api','api.example.cn.','-api.example.cn']){
  assert.ok(checkWxRelease(project,{...runtime,apiBaseUrl:'https://'+host}).errors.includes('HTTPS_PUBLIC_API_REQUIRED'),host);
 }
 assert.ok(checkWxRelease(project,runtime,{setting:{urlCheck:false}}).errors.includes('PRIVATE_DOMAIN_CHECK_MUST_BE_ENABLED'));
 assert.equal(checkWxRelease(project,runtime,{setting:{urlCheck:true}}).ok,true);
});
test('V0.8 release checker requires real HTTPS API and forbids dev login',()=>{
 const base={appid:'wx1234567890abcdef',setting:{urlCheck:true}};
 const ok={mode:'server',devLogin:false,apiBaseUrl:'https://api.example.cn'};
 assert.deepEqual(checkWxRelease(base,ok),{ok:true,errors:[]});
 assert.ok(checkWxRelease(base,{...ok,apiBaseUrl:'http://127.0.0.1:3100'}).errors.includes('HTTPS_PUBLIC_API_REQUIRED'));
 assert.ok(checkWxRelease(base,{...ok,devLogin:true}).errors.includes('DEV_LOGIN_MUST_BE_DISABLED'));
 assert.ok(checkWxRelease({...base,setting:{urlCheck:false}},ok).errors.includes('DOMAIN_CHECK_MUST_BE_ENABLED'));
});
