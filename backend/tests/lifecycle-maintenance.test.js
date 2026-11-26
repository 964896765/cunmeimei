'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {CLOSURE_CONSENT}=require('../src/account-lifecycle');
test('maintenance scheduler waits for in-flight work and does not overlap',async()=>{
 let release,started=0,finished=0;const pending=new Promise(r=>{release=r;});
 const stop=require('../src/maintenance').startMaintenance({runMaintenance:async()=>{started++;await pending;finished++;}},{intervalMs:5});
 await new Promise(r=>setTimeout(r,25));assert.equal(started,1);const stopped=stop();assert.equal(finished,0);release();await stopped;assert.equal(finished,1);
});
test('real PostgreSQL lifecycle and maintenance',{skip:!process.env.PG_TEST_DATABASE_URL&&'isolated PostgreSQL required'},async t=>{
 const dsn=process.env.PG_TEST_DATABASE_URL;require('../src/test-database-guard').assertIsolatedDatabase(dsn);
 const {Pool}=require('pg'),control=new Pool({connectionString:dsn}),schema='lifecycle_'+crypto.randomBytes(6).toString('hex');let pool,repo,app;
 try{
  await control.query(`CREATE SCHEMA "${schema}"`);const options='-c search_path='+schema;pool=new Pool({connectionString:dsn,options});await require('../src/schema-migrations').applyMigrations(pool);
  repo=require('../src/pg-repository').createPgRepository(dsn,{options});await repo.seedRegions(['中心街道']);repo.configureTrust({enabled:false});
  const owner=await repo.upsertIdentity('dev_local','lifecycle-owner'),reader=await repo.upsertIdentity('dev_local','lifecycle-reader');
  const pub=async(uid,title='生命周期测试物品')=>(await pool.query("INSERT INTO publications(user_id,type,title,description,district,status,expires_at) VALUES($1,'used',$2,'完整的生命周期测试内容','中心街道','published',now()+interval '60 days') RETURNING id",[uid,title])).rows[0].id;
  const publication=await pub(owner),otherPub=await pub(reader,'别人的秘密测试内容');
  const contact=(await pool.query("INSERT INTO contact_requests(publication_id,requester_id,owner_id,message,response,status) VALUES($1,$2,$3,'读者自己写的消息','发布者自己写的回复','accepted') RETURNING id",[publication,reader,owner])).rows[0].id;
  await pool.query("INSERT INTO contact_messages(contact_id,sender_id,body,client_key) VALUES($1,$2,'对方私密消息','reader_message_key_001'),($1,$3,'本人发出的消息','owner_message_key_001')",[contact,reader,owner]);
  await t.test('export is owner scoped, paged, audited and contains no credentials or peer-authored text',async()=>{
   await pool.query("INSERT INTO publications(user_id,type,title,description,district) SELECT $1,'used','导出分页'||g,'分页测试内容','中心街道' FROM generate_series(1,51) g",[owner]);
   const first=await repo.exportOwnData(owner,'publications'),next=await repo.exportOwnData(owner,'publications',first.nextCursor);assert.equal(first.items.length,50);assert.equal(next.items.length,2);assert.equal(new Set([...first.items,...next.items].map(x=>x.id)).size,52);assert.ok(!JSON.stringify([...first.items,...next.items]).includes(otherPub));
   const messages=await repo.exportOwnData(owner,'messages'),contacts=await repo.exportOwnData(owner,'contacts');assert.equal(messages.items.length,1);assert.equal(messages.items[0].body,'本人发出的消息');assert.equal(contacts.items[0].authored_text,'发布者自己写的回复');assert.ok(!JSON.stringify(contacts).includes('读者自己写的消息'));
   const profile=JSON.stringify(await repo.exportOwnData(owner,'profile'));assert.ok(!profile.includes('lifecycle-owner'));assert.ok(!profile.includes('provider_id'));await assert.rejects(repo.exportOwnData(owner,'app_sessions'),e=>e.code==='INVALID_EXPORT_SECTION');assert.equal((await pool.query('SELECT count(*)::int n FROM data_export_events WHERE user_id=$1',[owner])).rows[0].n,5);
  });
  await t.test('withdrawn requests and ordinary deletion requests cannot execute account closure',async()=>{
   const deletion=await repo.createPrivacyRequest(reader,'deletion','只删除一条过期草稿的数据');await assert.rejects(repo.executeAccountClosure(deletion.id,{revision:1,confirmed:true,reason:'不能把删除草稿解释为注销账号'},'operator'),e=>e.code==='CLOSURE_CHANGED');
   await assert.rejects(repo.createPrivacyRequest(reader,'closure','申请关闭测试账号'),e=>e.code==='CLOSURE_CONSENT_REQUIRED');const request=await repo.createPrivacyRequest(reader,'closure','申请关闭此测试账号',CLOSURE_CONSENT);await repo.cancelPrivacyRequest(reader,request.id);await assert.rejects(repo.executeAccountClosure(request.id,{revision:2,confirmed:true,reason:'用户已经撤回，不能继续执行'},'operator'),e=>e.code==='CLOSURE_CHANGED');
  });
  const event=(kind,amount,key,extra={})=>({kind,amount,key,source:'lifecycle-ticket:CASE-001',reason:'测试生命周期积分余额和冻结',actor:'test_operator',...extra});
  await t.test('expired holds release exactly once under concurrent workers and reconciliation stays clean',async()=>{
   await repo.postPoints(owner,event('earn',100,'lifecycle_earn_key_001'));const hold=await repo.postPoints(owner,event('hold',30,'lifecycle_hold_key_001',{expiresAt:new Date(Date.now()+86400e3).toISOString()}));
   await pool.query("UPDATE points_holds SET expires_at=now()-interval '1 minute' WHERE id=$1",[hold.id]);await Promise.all([repo.releaseExpiredPointsHolds(),repo.releaseExpiredPointsHolds()]);assert.deepEqual(await repo.pointsAccount(owner),{available:100,held:0,earned:100,spent:0});assert.equal((await pool.query("SELECT count(*)::int n FROM points_ledger WHERE original_id=$1 AND kind='release'",[hold.id])).rows[0].n,1);assert.deepEqual(await repo.reconcilePoints(),[]);
  });
  await t.test('maintenance failures enter the unified queue and recover without altering the ledger',async()=>{
   await pool.query('UPDATE points_accounts SET available=available+1 WHERE user_id=$1',[owner]);const failed=await repo.runMaintenance();assert.equal(failed.points_reconciliation.ok,false);const q=await repo.reviewWorkbench({kind:'operations'});assert.equal(q.total,1);assert.equal(q.items[0].metadata.code,'POINTS_RECONCILIATION_FAILED');assert.ok(!(JSON.stringify(q).includes(owner)));
   await pool.query('UPDATE points_accounts SET available=available-1 WHERE user_id=$1',[owner]);const recovered=await repo.runMaintenance();assert.equal(recovered.points_reconciliation.ok,true);assert.equal(recovered.expired_sms.ok,true);assert.equal((await repo.reviewWorkbench({kind:'operations'})).total,0);assert.equal((await repo.operationsHealth()).jobs.length,8);
  });
  await t.test('ad retries never expose another owner reservation; cancellation refunds once and frees stock',async()=>{
   const image=(await pool.query("INSERT INTO content_images(user_id,data,thumbnail,width,height) VALUES($1,'x','x',1,1) RETURNING id",[owner])).rows[0].id;
   const advertiser=await repo.createAdvertiser(owner,{name:'生命周期测试广告主体',reference:'advertiser-test:CASE-002'});await repo.verifyAdvertiser(advertiser.id,{revision:1,manuallyVerified:true,validUntil:new Date(Date.now()+30*86400e3).toISOString(),reason:'已实际核查主体材料和投放授权'},'verifier');
   const createAd=async()=>{const ad=await repo.createAdCampaign(owner,{advertiserId:advertiser.id,imageId:image,publicationId:publication,title:'生命周期测试广告'});await repo.reviewAd(ad.id,{status:'approved',revision:1,textReviewed:true,imagesReviewed:true,documentsReviewed:true,reason:'完成文字图片及广告证明文件核验'},'operator');return ad;};
   const a=await createAd(),b=await createAd(),slot=(await pool.query("INSERT INTO ad_slots(placement,region,starts_at,ends_at,capacity) VALUES('home','中心街道',now()+interval '1 hour',now()+interval '2 hours',1) RETURNING id")).rows[0].id;
   const hold=await repo.postPoints(owner,event('hold',20,'lifecycle_ad_hold_001',{expiresAt:new Date(Date.now()+86400e3).toISOString()}));await repo.reserveAd(owner,a.id,slot,hold.id);await assert.rejects(repo.reserveAd(reader,a.id,slot,hold.id),e=>e.code==='AD_NOT_OWNED');await assert.rejects(repo.reserveAd(owner,b.id,slot),e=>e.code==='AD_INVENTORY_FULL');
   await Promise.all([repo.cancelAd(owner,a.id,{revision:3,reason:'投放前取消并退还全部冻结消费'}),repo.cancelAd(owner,a.id,{revision:3,reason:'投放前取消并退还全部冻结消费'})]);assert.equal((await repo.pointsAccount(owner)).available,100);assert.equal((await pool.query("SELECT count(*)::int n FROM points_ledger WHERE kind='reversal'",[])).rows[0].n,1);await repo.reserveAd(owner,b.id,slot);
   await pool.query("UPDATE ad_slots SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1",[slot]);assert.equal((await repo.expireAdCampaigns()).processed,1);assert.equal((await repo.expireAdCampaigns()).processed,0);
   // Move a slot across its start while an operation waits on its inventory lock.
   // Transaction-start now() alone would incorrectly allow a late reservation/refund.
   const lockRace=async(slotId,startOperation,code)=>{
    const lock=await pool.connect();let operation;
    try{
     await lock.query('BEGIN');const blocker=(await lock.query('SELECT pg_backend_pid() id')).rows[0].id;await lock.query('SELECT id FROM ad_slots WHERE id=$1 FOR UPDATE',[slotId]);
     operation=startOperation().then(value=>({value}),error=>({error}));
     let waiting=false;
     for(let i=0;i<100;i++){waiting=(await pool.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) waiting',[blocker])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,5));}
     assert.equal(waiting,true,'operation reached the held inventory lock');
     await lock.query("UPDATE ad_slots SET starts_at=clock_timestamp()-interval '1 millisecond' WHERE id=$1",[slotId]);await lock.query('COMMIT');assert.equal((await operation).error?.code,code);
    }finally{await lock.query('ROLLBACK');lock.release();if(operation)await operation;}
   };
   const c=await createAd(),lateSlot=(await pool.query("INSERT INTO ad_slots(placement,region,starts_at,ends_at,capacity) VALUES('late','中心街道',now()+interval '1 hour',now()+interval '2 hours',1) RETURNING id")).rows[0].id;
   await lockRace(lateSlot,()=>repo.reserveAd(owner,c.id,lateSlot),'SLOT_UNAVAILABLE');
   const cancelSlot=(await pool.query("INSERT INTO ad_slots(placement,region,starts_at,ends_at,capacity) VALUES('cancel','中心街道',now()+interval '1 hour',now()+interval '2 hours',1) RETURNING id")).rows[0].id;
   await repo.reserveAd(owner,c.id,cancelSlot);await lockRace(cancelSlot,()=>repo.cancelAd(owner,c.id,{revision:3,reason:'取消时等待锁跨越了广告开始时间'}),'AD_ALREADY_STARTED');
   await pool.query("UPDATE ad_slots SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1",[cancelSlot]);await repo.expireAdCampaigns();
  });
  await t.test('closure checks obligations, atomically revokes access, and retries cannot close twice',async()=>{
   const hold=await repo.postPoints(owner,event('hold',10,'lifecycle_closure_hold_001',{expiresAt:new Date(Date.now()+86400e3).toISOString()}));assert.ok((await repo.closureReadiness(owner)).blockers.includes('holds'));
   const request=await repo.createPrivacyRequest(owner,'closure','本人申请注销测试账号并确认保留范围',CLOSURE_CONSENT);await assert.rejects(repo.executeAccountClosure(request.id,{revision:1,confirmed:true,reason:'冻结积分尚未结清不能执行注销'},'operator'),e=>e.code==='CLOSURE_OBLIGATIONS_PENDING');
   await assert.rejects(repo.reviewPrivacyRequest(request.id,'responded','没有实际注销不能记录成已完成',1),e=>e.code==='CLOSURE_EXECUTION_REQUIRED');
   await repo.postPoints(owner,event('release',10,'lifecycle_closure_release_001',{originalId:hold.id}));const hash=crypto.createHash('sha256').update('token-test-closure').digest('hex');await repo.newSession(owner,hash,new Date(Date.now()+3600e3));
   const results=await Promise.all([repo.executeAccountClosure(request.id,{revision:1,confirmed:true,reason:'已核对本人申请并完成未结事项检查'},'operator'),repo.executeAccountClosure(request.id,{revision:1,confirmed:true,reason:'已核对本人申请并完成未结事项检查'},'operator')]);assert.equal(results.filter(x=>!x.replayed).length,1);assert.equal(await repo.authenticate(hash),null);assert.equal(await repo.getItem(publication),null);assert.equal((await repo.chat(reader,contact)).canSend,false);
   assert.equal((await pool.query('SELECT status,display_name,bio,avatar_image_id FROM app_users WHERE id=$1',[owner])).rows[0].status,'closed');assert.equal((await pool.query('SELECT 1 FROM app_identities WHERE user_id=$1',[owner])).rows.length,0);
   await assert.rejects(repo.upsertIdentity('dev_local','lifecycle-owner'),e=>e.code==='ACCOUNT_CLOSED');await assert.rejects(repo.newSession(owner,hash,new Date()),e=>e.code==='ACCOUNT_INACTIVE');await assert.rejects(pub(owner),/ACCOUNT_INACTIVE/);await assert.rejects(repo.updateProfile(owner,{bio:'注销后迟到的修改'}),/ACCOUNT_CLOSED/);await assert.rejects(repo.exportOwnData(owner,'profile'),e=>e.code==='ACCOUNT_INACTIVE');assert.deepEqual(await repo.reconcilePoints(),[]);assert.equal((await pool.query('SELECT 1 FROM account_closure_executions WHERE request_id=$1',[request.id])).rows.length,1);
  });
  await t.test('HTTP export enforces login; closure requires explicit consent and admin execution requires CSRF',async()=>{
   app=require('../src/server').createApp({repo,areas:['中心街道'],allowDevLogin:true,operatorPermissions:['privacy'],adminPassword:'isolated-lifecycle-password',verificationAdminPassword:'isolated-verifier-password'});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
   const req=async(path,method='GET',body,headers={})=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
   assert.equal((await req('/api/v1/me/data-export')).status,401);const login=await req('/api/v1/dev/login','POST',{devUser:'lifecycle-http-user'}),headers={Authorization:'Bearer '+login.data.token};assert.equal((await req('/api/v1/me/data-export?section=profile','GET',undefined,headers)).status,200);
   assert.equal((await req('/api/v1/me/privacy-requests','POST',{kind:'closure',reason:'没有明确同意不允许创建注销'},headers)).status,400);const request=(await req('/api/v1/me/privacy-requests','POST',{kind:'closure',reason:'已明确确认账号注销范围与保留',closureAcknowledged:true,consentVersion:CLOSURE_CONSENT},headers)).data.request;
   const admin=await req('/admin/api/login','POST',{password:'isolated-lifecycle-password'}),route='/admin/api/privacy-requests/'+request.id+'/execute-closure',body={revision:1,confirmed:true,reason:'已核验用户的明确注销申请和执行范围'};
   const verifier=await req('/admin/api/login','POST',{password:'isolated-verifier-password',role:'verifier'});assert.equal((await req(route,'POST',body,{Cookie:verifier.cookie,'X-CSRF-Token':verifier.data.csrf})).status,403);
   assert.equal((await req(route,'POST',body,{Cookie:admin.cookie})).status,403);assert.equal((await req(route,'POST',body,{Cookie:admin.cookie,'X-CSRF-Token':admin.data.csrf})).status,200);assert.equal((await req('/api/v1/me/data-export?section=profile','GET',undefined,headers)).status,401);
  });
 }finally{if(app){app.closeAllConnections();await new Promise(r=>app.close(r));}if(repo)await repo.close();if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await control.end();}
});
