'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const report=path.join(__dirname,'../docs/draft-persistence-result.json');
async function request(route,method='GET',body,token){const r=await fetch('http://127.0.0.1:3100'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,'API returned '+r.status);return r.json();}
(async()=>{
 const identity='draft-restart-acceptance';
 const login=await request('/api/v1/dev/login','POST',{devUser:identity});
 if(process.argv.includes('--seed')){
  const current=await request('/api/v1/me/draft','GET',undefined,login.token);
  const payload={kind:'community',title:'重启持久化草稿验收',detail:'仅用于本地开发数据库重启持久化校验，不公开展示。',price:'',district:'',attributes:{topic:'开发验收'},imageIds:[],clientKey:'restart_draft_'+Date.now()};
  const saved=await request('/api/v1/me/draft','PUT',{expectedRevision:current.revision,payload},login.token);
  fs.writeFileSync(report,JSON.stringify({userId:login.userId,revision:saved.revision,payload,verifiedAfterRestart:false},null,2));
  console.log('PASS: private acceptance draft written before restart');
 }else{
  const expected=JSON.parse(fs.readFileSync(report,'utf8'));
  const actual=await request('/api/v1/me/draft','GET',undefined,login.token);
  assert.equal(login.userId,expected.userId);assert.equal(actual.revision,expected.revision);assert.deepEqual(actual.payload,expected.payload);
  expected.verifiedAfterRestart=true;expected.assertions=3;fs.writeFileSync(report,JSON.stringify(expected,null,2));
  console.log('PASS: identity, revision and full draft payload persist after restart (3 assertions)');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
