'use strict';
const {residentFields}=require('./helpers/resident-fields');
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp} = require('../src/server');
const {createMemoryRepository} = require('../src/memory-repository');
const {createGracefulShutdown} = require('../src/graceful-shutdown');

async function fixture(t) {
  const repo = createMemoryRepository();
  const server = createApp({repo,areas:['中心街道','北城区'],allowDevLogin:true,superAdminPassword:'local-end-to-end-password'});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const {stop} = createGracefulShutdown(server, repo);
  t.after(stop);
  const base = `http://127.0.0.1:${server.address().port}`;
  const request=async(route, method='GET', body, credentials={})=>{
    const response=await fetch(base+route,{
      method,
      headers:{'Content-Type':'application/json', ...(credentials.token?{Authorization:'Bearer '+credentials.token}:{}), ...(credentials.cookie?{Cookie:credentials.cookie}:{}), ...(credentials.csrf?{'X-CSRF-Token':credentials.csrf}:{})},
      body:body===undefined?undefined:JSON.stringify(body)
    });
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]||''};
  };
  const login=async name=>{
    const response=await request('/api/v1/dev/login','POST',{devUser:name});
    assert.equal(response.status,200);
    return {token:response.data.token,userId:response.data.userId};
  };
  return {request,login,repo,stop,server};
}

test('V0.18 real HTTP rehearsal: publication moderation, CSRF, report removal and region guard',async t=>{
  const {request,login}=await fixture(t);
  const owner=await login('v18-publisher');
  const other=await login('v18-other');
  const create={...residentFields(),type:'used',district:'北城区',title:'二手书桌和椅子',detail:'保存完好的桌椅，同城自取，欢迎咨询',price:'90'};
  assert.equal((await request('/api/v1/publications','POST',create)).status,401);
  const pub=await request('/api/v1/publications','POST',create,owner);
  assert.equal(pub.status,201);
  const id=pub.data.publication.id;
  assert.equal((await request('/api/v1/items/'+id)).status,404);
  const adminLogin=await request('/admin/api/login','POST',{role:'superadmin',password:'local-end-to-end-password'});
  assert.equal(adminLogin.status,200);
  const admin={cookie:adminLogin.cookie,csrf:adminLogin.data.csrf};
  assert.equal((await request('/admin/api/review','POST',{target:'publication',id,status:'published'},{cookie:admin.cookie})).status,403);
  assert.equal((await request('/admin/api/review','POST',{target:'publication',id,status:'published'},admin)).status,200);
  assert.equal((await request('/api/v1/items/'+id)).status,200);
  assert.equal((await request('/api/v1/feed?area='+encodeURIComponent('北城区'))).data.items.length,1);
  assert.equal((await request('/api/v1/me/publications/'+id,'PUT',{...create,expectedRevision:1},other)).status,404);
  const report=await request('/api/v1/reports','POST',{targetType:'publication',targetId:id,reason:'spam',description:'测试举报'},other);
  assert.equal(report.status,201);
  assert.equal((await request('/admin/api/review-report','POST',{id:report.data.report.id,decision:'removed',note:'本地闭环模拟下架'},admin)).status,200);
  assert.equal((await request('/api/v1/items/'+id)).status,404);
  assert.equal((await request('/api/v1/feed')).data.items.length,0);
  assert.equal((await request('/admin/api/regions/status','POST',{name:'北城区',enabled:false},admin)).status,200);
  assert.equal((await request('/api/v1/publications','POST',create,owner)).status,400);
  assert.equal((await request('/api/v1/auth/logout','POST',{},owner)).status,200);
  assert.equal((await request('/api/v1/me','GET',undefined,owner)).status,401);
});

test('V0.18 real HTTP rehearsal: verified merchant, service review, concurrent booking, fulfillment',async t=>{
  const {request,login}=await fixture(t);
  const owner=await login('v18-shop-owner'),customer=await login('v18-customer'),competitor=await login('v18-competitor');
  const created=await request('/api/v1/merchant-applications','POST',{name:'街坊维修服务部',category:'家电维修',district:'中心街道'},owner);
  assert.equal(created.status,201);
  const aid=created.data.application.id;
  const adminLogin=await request('/admin/api/login','POST',{role:'superadmin',password:'local-end-to-end-password'});
  const admin={cookie:adminLogin.cookie,csrf:adminLogin.data.csrf};
  assert.equal((await request('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'模拟人工核验已完成'},admin)).status,409);
  assert.equal((await request('/api/v1/merchant-applications/'+aid+'/evidence','POST',{registrationCode:'TEST-CODE-2026-88888888',licenseHolder:'街坊维修服务部',evidenceReference:'local-manual-review-only'},owner)).status,200);
  const approved=await request('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'模拟人工检查材料合格'},admin);
  assert.equal(approved.status,200);
  const mid=approved.data.merchant.id;
  const service=await request('/api/v1/merchants/'+mid+'/services','POST',{title:'家用电器维修',description:'模拟上门维修服务预约测试，非真实商家',price:'50'},owner);
  assert.equal(service.status,201);
  const sid=service.data.service.id;
  assert.equal((await request('/api/v1/items/'+sid)).status,404);
  assert.equal((await request('/admin/api/review-service','POST',{id:sid,status:'published'},admin)).status,200);
  assert.equal((await request('/api/v1/items/'+sid)).status,200);
  const date='2099-11-01',time='10:00';
  const slots=await request('/api/v1/services/'+sid+'/slots?date='+date);
  assert.equal(slots.status,200);
  assert.equal(slots.data.slots.find(s=>s.time===time).available,true);
  const two=await Promise.all([
    request('/api/v1/bookings','POST',{serviceId:sid,date,time,remark:'预约上门维修'},customer),
    request('/api/v1/bookings','POST',{serviceId:sid,date,time,remark:'另一位用户同时抢占'},competitor)
  ]);
  assert.deepEqual(two.map(x=>x.status).sort((a,b)=>a-b),[201,409]);
  const winningIndex=two.findIndex(x=>x.status===201);
  const winningUser=winningIndex===0?customer:competitor;
  const booking=two[winningIndex].data.booking;
  assert.equal((await request('/api/v1/bookings','POST',{serviceId:sid,date,time},winningUser)).status,200);
  assert.equal((await request('/api/v1/bookings','POST',{serviceId:sid,date,time},winningIndex===0?competitor:customer)).status,409);
  assert.equal((await request('/api/v1/merchants/'+mid+'/bookings','GET',undefined,owner)).status,200);
  const action='/api/v1/merchants/'+mid+'/bookings/'+booking.id+'/action';
  assert.equal((await request(action,'POST',{action:'confirm'},owner)).status,200);
  assert.equal((await request('/api/v1/bookings/'+booking.id+'/cancel','POST',{},winningUser)).status,409);
  assert.equal((await request(action,'POST',{action:'complete'},owner)).status,200);
  const appointments=(await request('/api/v1/me/bookings','GET',undefined,winningUser)).data.items;
  assert.equal(appointments.find(x=>x.id===booking.id).status,'completed');
});

test('V0.18 graceful shutdown closes actual listening server and pool exactly once',async()=>{
  const repo=createMemoryRepository();let closes=0;
  const original=repo.close.bind(repo);
  repo.close=async()=>{closes++;return original();};
  const app=createApp({repo,areas:['中心街道']});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const {stop}=createGracefulShutdown(app,repo,{drainTimeoutMs:2000});
  const first=stop(),second=stop();
  assert.equal(first,second);
  await Promise.all([first,second]);
  assert.equal(closes,1);
  assert.equal(app.listening,false);
});
