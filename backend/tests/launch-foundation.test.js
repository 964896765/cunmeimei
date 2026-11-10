'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {queryOptions}=require('../src/review-workbench');
test('workbench validates paging and task categories',()=>{
 assert.deepEqual(queryOptions(new URLSearchParams()),{kind:'',page:1,size:20});
 for(const q of ['page=0','size=51','kind=arbitrary','page=NaN','page=1.5'])assert.throws(()=>queryOptions(new URLSearchParams(q)));
});
test('real PostgreSQL launch foundation: workbench, immutable consent, points concurrency and ad inventory',{skip:!process.env.PG_TEST_DATABASE_URL&&'isolated PostgreSQL required'},async t=>{
 const dsn=process.env.PG_TEST_DATABASE_URL;require('../src/test-database-guard').assertIsolatedDatabase(dsn);
 const {Pool}=require('pg'),control=new Pool({connectionString:dsn}),schema='launch_'+crypto.randomBytes(6).toString('hex');let pool,repo,app;
 try{
  await control.query(`CREATE SCHEMA "${schema}"`);const options='-c search_path='+schema;pool=new Pool({connectionString:dsn,options});await require('../src/schema-migrations').applyMigrations(pool);
  repo=require('../src/pg-repository').createPgRepository(dsn,{options});await repo.seedRegions(['中心街道']);
  const users=(await pool.query("INSERT INTO app_users(display_name) VALUES('测试发布者'),('测试读者') RETURNING id")).rows.map(x=>x.id),[owner,reader]=users;
  const pubs=(await pool.query("INSERT INTO publications(user_id,type,title,description,district,status,expires_at) SELECT $1,'used','待办验证'||g,'完整测试正文','中心街道','pending',now()+interval '60 days' FROM generate_series(1,25) g RETURNING id",[owner])).rows.map(x=>x.id);
  await t.test('all tasks are paged with counts and a stable ordering; changed tasks reject detail reads',async()=>{
   const first=await repo.reviewWorkbench({page:1,size:20}),next=await repo.reviewWorkbench({page:2,size:20});assert.equal(first.total,25);assert.equal(first.counts.publication,25);assert.equal(first.items.length,20);assert.equal(next.items.length,5);assert.equal(new Set([...first.items,...next.items].map(x=>x.id)).size,25);
   assert.equal((await repo.reviewTask('publication',pubs[0],'operator')).detail.revision,1);
   await repo.emergencyRemove(pubs[0],'已核实风险，立即停止展示','operator');assert.equal((await repo.reviewWorkbench({kind:'publication'})).total,24);await assert.rejects(repo.reviewTask('publication',pubs[0],'operator'),e=>e.code==='TASK_CHANGED');
  });
  await t.test('risk, duplicate, qualification and overdue contact queues need no separate page',async()=>{
   await pool.query("INSERT INTO risk_cases(user_id,target_type,target_id,signals) VALUES($1,'publication',$2,'[\"duplicate_content\"]')",[owner,pubs[1]]);
   await pool.query("UPDATE publications SET type='housing' WHERE id=$1",[pubs[2]]);
   await pool.query("INSERT INTO contact_requests(publication_id,requester_id,owner_id,message,created_at) VALUES($1,$2,$3,'联系测试',now()-interval '3 days')",[pubs[1],reader,owner]);
   const q=await repo.reviewWorkbench({page:1,size:50});assert.equal(q.counts.risk,1);assert.equal(q.counts.qualification,1);assert.equal(q.counts.contact,1);assert.equal(q.items[0].kind,'risk');assert.ok(!JSON.stringify(q).includes('联系测试'));
  });
  await t.test('public details never decrypt; phone access is rate limited, blocked and withdrawn with retained consent evidence',async()=>{
   const key=crypto.randomBytes(32).toString('base64');repo.configureTrust({phoneKey:key,enabled:false});
   await repo.verifyPhone(owner,'13900000001','wechat_phone','mock-provider-case');await pool.query("UPDATE publications SET status='published' WHERE id=$1",[pubs[1]]);
   await repo.saveContactSettings(owner,pubs[1],{publicPhone:true,phoneConsent:true});const detail=await repo.getItem(pubs[1]);assert.equal(detail.contact.publicPhone,'');assert.equal(detail.contact.phoneAvailable,true);assert.ok(!JSON.stringify(detail).includes('13900000001'));
   assert.equal(await repo.accessPhone(reader,pubs[1]),'13900000001');
   await pool.query('INSERT INTO user_blocks(user_id,blocked_user_id) VALUES($1,$2)',[owner,reader]);await assert.rejects(repo.accessPhone(reader,pubs[1]),e=>e.code==='CONTACT_BLOCKED');await pool.query('DELETE FROM user_blocks');
   for(let i=0;i<19;i++)await repo.accessPhone(reader,pubs[1]);await assert.rejects(repo.accessPhone(reader,pubs[1]),e=>e.code==='PHONE_ACCESS_LIMIT');
   await repo.saveContactSettings(owner,pubs[1],{publicPhone:false});await assert.rejects(repo.accessPhone(reader,pubs[1]),e=>e.code==='PHONE_NOT_PUBLIC');
   const events=(await pool.query('SELECT granted FROM phone_consent_events WHERE publication_id=$1 ORDER BY created_at',[pubs[1]])).rows;assert.deepEqual(events.map(x=>x.granted),[true,false]);await assert.rejects(pool.query('DELETE FROM phone_consent_events'),/immutable/);
  });
  const event=(kind,amount,key,extra={})=>({kind,amount,key,source:'review-ticket:CASE-001',reason:'真实核查完成的测试积分事件',actor:'operator',...extra});
  await t.test('concurrent events award once, mismatched retries fail and immutable ledger reconciles',async()=>{
   const results=await Promise.all(Array.from({length:12},()=>repo.postPoints(owner,event('earn',100,'launch_earn_event_001'))));assert.equal(new Set(results.map(x=>x.id)).size,1);assert.equal((await repo.pointsAccount(owner)).available,100);
   await assert.rejects(repo.postPoints(owner,event('earn',99,'launch_earn_event_001')),e=>e.code==='POINTS_KEY_CONFLICT');
   await assert.rejects(pool.query("UPDATE points_ledger SET amount=99 WHERE id=$1",[results[0].id]),/immutable/);assert.deepEqual(await repo.reconcilePoints(),[]);
  });
  await t.test('holds cannot overspend; spend/release/reversal preserve complete history',async()=>{
   const outcomes=await Promise.allSettled(Array.from({length:3},(_,i)=>repo.postPoints(owner,event('hold',60,'launch_hold_race_00'+i,{expiresAt:new Date(Date.now()+86400e3).toISOString()}))));assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
   const held=outcomes.find(x=>x.status==='fulfilled').value;await repo.postPoints(owner,event('release',60,'launch_release_event_001',{originalId:held.id}));
   const hold=await repo.postPoints(owner,event('hold',30,'launch_hold_event_002',{expiresAt:new Date(Date.now()+86400e3).toISOString()}));const spend=await repo.postPoints(owner,event('spend',30,'launch_spend_event_001',{originalId:hold.id}));assert.equal((await repo.pointsAccount(owner)).available,70);
   await repo.postPoints(owner,event('reversal',30,'launch_reverse_event_001',{originalId:spend.id}));await assert.rejects(repo.postPoints(owner,event('reversal',30,'launch_reverse_event_002',{originalId:spend.id})),e=>e.code==='ALREADY_REVERSED');assert.equal((await repo.pointsAccount(owner)).available,100);assert.deepEqual(await repo.reconcilePoints(),[]);
  });
  await t.test('verified advertisers, human review, inventory locking, labeling, pause and archive are enforced',async()=>{
   const img=(await pool.query("INSERT INTO content_images(user_id,data,thumbnail,width,height) VALUES($1,'x','x',1,1) RETURNING id",[owner])).rows[0].id;
   const advertiser=await repo.createAdvertiser(owner,{name:'隔离测试广告主体',reference:'advertiser-evidence:CASE-001'});
   const campaigns=[];for(let i=0;i<2;i++)campaigns.push(await repo.createAdCampaign(owner,{advertiserId:advertiser.id,imageId:img,publicationId:pubs[1],title:'隔离测试广告'+i}));
   const review={status:'approved',revision:1,reason:'已核查真实主体和广告素材证明',textReviewed:true,imagesReviewed:true,documentsReviewed:true};await assert.rejects(repo.reviewAd(campaigns[0].id,review,'operator'),e=>e.code==='ADVERTISER_NOT_VERIFIED');
   await repo.verifyAdvertiser(advertiser.id,{revision:1,manuallyVerified:true,validUntil:new Date(Date.now()+30*86400e3).toISOString(),reason:'已实际核验主体经营资料及授权'},'verifier');
   for(const campaign of campaigns)await repo.reviewAd(campaign.id,review,'operator');
   const slot=(await pool.query("INSERT INTO ad_slots(placement,region,starts_at,ends_at,capacity) VALUES('home','中心街道',now()+interval '1 hour',now()+interval '2 hours',1) RETURNING id")).rows[0].id;
   const results=await Promise.allSettled(campaigns.map(x=>repo.reserveAd(owner,x.id,slot)));assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'AD_INVENTORY_FULL');
   const id=campaigns[results.findIndex(x=>x.status==='fulfilled')].id;assert.equal((await repo.deliverAds('中心街道','home')).length,0);
   await pool.query("UPDATE ad_slots SET starts_at=now()-interval '1 hour' WHERE id=$1",[slot]);const ad=(await repo.deliverAds('中心街道','home'))[0];assert.equal(ad.label,'广告');
   await repo.setAdStatus(id,{status:'paused',revision:3,reason:'测试紧急停止本次广告投放'},'operator');assert.equal((await repo.deliverAds('中心街道','home')).length,0);assert.ok((await pool.query('SELECT 1 FROM ad_archive WHERE campaign_id=$1',[id])).rows.length>=3);await assert.rejects(pool.query('DELETE FROM ad_archive'),/immutable/);
  });
  await t.test('HTTP workbench rejects ordinary users, validates parameters and enforces CSRF for emergency removal',async()=>{
   app=require('../src/server').createApp({repo,areas:['中心街道'],allowDevLogin:true,adminPassword:'isolated-launch-password'});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
   assert.equal((await fetch(base+'/admin/api/workbench')).status,401);const login=await fetch(base+'/admin/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'isolated-launch-password'})}),cookie=login.headers.get('set-cookie').split(';')[0],auth=await login.json();
   assert.equal((await fetch(base+'/admin/api/workbench?size=999',{headers:{Cookie:cookie}})).status,400);assert.equal((await fetch(base+'/admin/api/workbench',{headers:{Cookie:cookie}})).status,200);
   assert.equal((await fetch(base+'/admin/api/workbench/publication/'+pubs[3],{headers:{Cookie:cookie}})).status,200);
   assert.equal((await fetch(base+'/admin/api/emergency-remove',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({id:pubs[1],reason:'核实风险后下架测试内容'})})).status,403);
   assert.equal((await fetch(base+'/admin/api/emergency-remove',{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':auth.csrf,'Content-Type':'application/json'},body:JSON.stringify({id:pubs[1],reason:'核实风险后下架测试内容'})})).status,200);assert.equal(await repo.getItem(pubs[1]),null);
  });
  await t.test('actual admin script renders the unified queue and opens a review without changing pages',async()=>{
   const fs=require('node:fs'),vm=require('node:vm');
   class Element{constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.value='';}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return (this.text||'')+this.children.map(x=>x.textContent||'').join('');}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}addEventListener(k,f){this.listeners[k]=f;}scrollIntoView(){}querySelector(){return null;}}
   const html=fs.readFileSync(require.resolve('../admin/index.html'),'utf8'),elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(x=>[x[1],new Element('div')]));
   let cookie='';const routes=[],base='http://127.0.0.1:'+app.address().port;
   const context=vm.createContext({document:{getElementById:id=>{assert.ok(elements.has(id),'real HTML contains '+id);return elements.get(id);},createElement:tag=>new Element(tag),createTextNode:t=>({textContent:t})},fetch:async(route,options={})=>{routes.push(route);const r=await fetch(base+route,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{})}});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;},confirm:()=>false,prompt:()=>null,console});
   vm.runInContext(fs.readFileSync(require.resolve('../admin/app.js'),'utf8'),context);await new Promise(r=>setTimeout(r,50));
   elements.get('password').value='isolated-launch-password';elements.get('admin-role').value='operator';await elements.get('login-form').listeners.submit({preventDefault(){}});
   assert.equal(elements.get('dashboard').hidden,false);assert.ok(elements.get('task-counts').textContent.includes('联系超时 1'));assert.ok(elements.get('task-list').children.length);assert.ok(routes.some(x=>x.startsWith('/admin/api/workbench?')));
   assert.equal(elements.get('points-rules').children.length,5);assert.ok(elements.get('points-rules').textContent.includes('保存并启用'));assert.ok(routes.includes('/admin/api/points/rules'));
   await vm.runInContext(`openTask('publication','${pubs[3]}')`,context);assert.ok(elements.get('task-detail').textContent.includes('审核通过'));assert.ok(elements.get('task-detail').textContent.includes('紧急下架'));assert.equal(elements.get('password').value,'');
  });
 }finally{if(app){app.closeAllConnections();await new Promise(r=>app.close(r));}if(repo)await repo.close();if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await control.end();}
});
