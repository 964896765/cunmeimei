'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');
const {validCalendarDate,booking}=require('../src/rules');

async function setup(t){
 const repo=createMemoryRepository();
 const server=createApp({repo,areas:['中心街道'],allowDevLogin:true,adminPassword:'long-private-admin-pass'});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 t.after(()=>new Promise(ok=>server.close(ok)));
 const base='http://127.0.0.1:'+server.address().port;
 const call=async(path,{method='GET',body,token,cookie,csrf}={})=>{
  const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]||''};
 };
 return {repo,call};
}
const publication={type:'used',title:'测试闲置桌椅',detail:'同城用户转让闲置桌椅，仅做审核回归测试',district:'中心街道',price:'¥100'};
async function login(call,key){return (await call('/api/v1/dev/login',{method:'POST',body:{devUser:key}})).data.token;}
async function admin(call){const r=await call('/admin/api/login',{method:'POST',body:{password:'long-private-admin-pass'}});return {cookie:r.cookie,csrf:r.data.csrf};}

test('V0.8 pending withdrawal is private, audit-safe, cannot be approved later',async t=>{
 const {call}=await setup(t),owner=await login(call,'user-owner'),other=await login(call,'user-other');
 const created=await call('/api/v1/publications',{method:'POST',body:publication,token:owner});
 assert.equal(created.status,201);const id=created.data.publication.id;
 const path=`/api/v1/me/publications/${id}/withdraw`;
 assert.equal((await call(path,{method:'POST',body:{}})).status,401);
 assert.equal((await call(path,{method:'POST',body:{},token:other})).status,404,'never disclose others\' content');
 const x=await call(path,{method:'POST',body:{},token:owner});assert.equal(x.status,200);assert.equal(x.data.status,'closed');
 assert.equal((await call(path,{method:'POST',body:{},token:owner})).status,404,'double withdrawal disallowed');
 const own=(await call('/api/v1/me/publications',{token:owner})).data.items;
 assert.equal(own[0].status,'closed','owner can still see history');
 assert.equal((await call('/api/v1/feed')).data.items.length,0);
 assert.equal((await call(`/api/v1/items/${id}`)).status,404);
 const credentials=await admin(call);
 assert.equal((await call('/admin/api/review',{method:'POST',body:{id,target:'publication',status:'published'},...credentials})).status,409,'cannot publish after withdrawal');
});
test('V0.8 withdrawal removes published content from listing and details immediately',async t=>{
 const {call}=await setup(t),owner=await login(call,'author');
 const id=(await call('/api/v1/publications',{method:'POST',body:publication,token:owner})).data.publication.id;
 const credentials=await admin(call);
 assert.equal((await call('/admin/api/review',{method:'POST',body:{id,target:'publication',status:'published'},...credentials})).status,200);
 assert.equal((await call(`/api/v1/items/${id}`)).status,200);
 assert.equal((await call(`/api/v1/me/publications/${id}/withdraw`,{method:'POST',body:{},token:owner})).status,200);
 assert.equal((await call(`/api/v1/items/${id}`)).status,404);
 assert.equal((await call('/api/v1/feed')).data.items.length,0);
});
test('V0.8 booking calendar rejects normalized dates, including leap years',async t=>{
 const {repo,call}=await setup(t);
 assert.equal(validCalendarDate('2028-02-29'),true);
 for(const s of ['2027-02-29','2027-02-30','2099-04-31','2101-01-01','0000-01-01','2099-13-01','2099-00-10','hello'])assert.equal(validCalendarDate(s),false,s);
 const service=await repo.addTestService({title:'演示保洁服务',description:'用于接口回归的服务',district:'中心街道',price:'¥0'});
 assert.equal((await call(`/api/v1/services/${service.id}/slots?date=2099-02-30`)).status,400);
 const token=await login(call,'calendar-user');
 assert.equal((await call('/api/v1/bookings',{method:'POST',body:{serviceId:service.id,date:'2099-02-30',time:'10:00'},token})).status,400);
 assert.equal((await call(`/api/v1/services/${service.id}/slots?date=2099-02-28`)).status,200);
});
