'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {Pool}=require('../backend/node_modules/pg');
const connect=require('./devtools_connection');
const base='http://127.0.0.1:3100';
async function request(route,method='GET',body,auth={}) {
 const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();assert.ok(r.ok,route+': '+r.status);return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function poll(read,accept){for(let i=0;i<50;i++){const value=await read();if(accept(value))return value;await new Promise(r=>setTimeout(r,200));}throw Error('UI state did not arrive');}
(async()=>{
 console.log('Connecting to existing simulator');
 const mini=await connect(),pool=new Pool({connectionString:process.env.DATABASE_URL}),errors=[];
 const keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode'],original=[];
 for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));
 mini.on('exception',e=>errors.push(e));let repo;const checks=[];
 try {
  console.log('Creating explicitly marked development acceptance fixture');
  const owner=(await request('/api/v1/dev/login','POST',{devUser:'expiry-ui-acceptance'})).data;
  for(const [i,value] of [owner.token,owner.userId,true].entries())await mini.callWxMethod('setStorageSync',keys[i],value);
  const config=(await request('/api/v1/config')).data;
  const post=(await request('/api/v1/publications','POST',{type:'used',title:'到期提醒开发验收记录',detail:'仅用于本地到期提醒和页面跳转验收，不是真实交易供给。',district:config.areas[0],price:'面议'},owner)).data.publication;
  const login=await request('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD});
  await request('/admin/api/review','POST',{target:'publication',id:post.id,status:'published'},{cookie:login.cookie,csrf:login.data.csrf});
  const fixture=await pool.query("UPDATE publications SET expires_at=now()-interval '1 second' WHERE id=$1 AND is_test=true RETURNING id",[post.id]);
  assert.equal(fixture.rowCount,1,'acceptance fixture must be explicitly test-only');
  repo=require('../backend/src/pg-repository').createPgRepository(process.env.DATABASE_URL);
  await repo.sendExpiryReminders();
  const notifications=(await request('/api/v1/me/notifications','GET',undefined,owner)).data.items;
  const notice=notifications.find(x=>x.targetId===post.id&&x.targetKind==='publication-expiry');assert.ok(notice);checks.push('real PostgreSQL expiry notification');
  console.log('Opening messages and checking actual notification');
  await mini.reLaunch('/pages/messages/index');
  const messageData=await poll(async()=>{const p=await mini.currentPage();return p.data();},d=>d.items?.some(x=>x.id===notice.id));
  console.log('Opening expiry notice');
  const messagePage=await mini.currentPage();
  const cards=await messagePage.$$('.notice-card');
  const selected=cards[messageData.items.findIndex(x=>x.id===notice.id)];
  assert.ok(selected,'expiry notification has a rendered tap target');
  console.log('Tapping rendered notification');
  await selected.tap();
  console.log('Waiting for management route');
  // The simulator does not answer getCurrentPage during its native route transition.
  await new Promise(r=>setTimeout(r,3000));
  await poll(()=>mini.currentPage(),p=>p.path==='pages/my-posts/index');checks.push('notification opens own publication management');
  const page=await mini.currentPage();
  const data=await poll(()=>page.data(),d=>d.items?.some(x=>x.id===post.id&&x.statusLabel==='已过期'&&x.expiryText));
  assert.ok(data.items.find(x=>x.id===post.id).canEdit);checks.push('expired status, date guidance and resubmission action');
  console.log('Capturing actual expired publication page');
  await mini.screenshot({path:path.join(__dirname,'../docs/product-expiry.png')});
  const refreshed=(await request('/api/v1/me/notifications','GET',undefined,owner)).data.items;
  assert.ok(refreshed.find(x=>x.id===notice.id).readAt);checks.push('opening notification persists read state');
  assert.equal(errors.length,0);checks.push('no captured simulator runtime exceptions');
  fs.writeFileSync(path.join(__dirname,'../docs/expiry-ui-result.json'),JSON.stringify({passed:checks.length,failed:0,checks,publicationId:post.id},null,2));
  for(const check of checks)console.log('PASS '+check);
 } finally {
  if(repo)await repo.close();await pool.end();
  for(let i=0;i<keys.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]);
  await mini.reLaunch('/pages/home/index');await mini.disconnect();
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
