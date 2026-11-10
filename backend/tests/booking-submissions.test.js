'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createMemoryRepository}=require('../src/memory-repository'),{createApp}=require('../src/server');
test('keyed HTTP booking retries preserve the original outcome and account boundary',async t=>{
 const repo=createMemoryRepository();await repo.seedRegions(['中心街道']);
 const service=await repo.addTestService({title:'恢复测试服务',district:'中心街道',description:'本机夹具',price:'100'});
 const app=createApp({repo,areas:['中心街道'],allowDevLogin:true});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{app.closeAllConnections();app.close(resolve);}));
 const base='http://127.0.0.1:'+app.address().port;
 const call=async(route,method='GET',value,token)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:value?JSON.stringify(value):undefined});return {status:r.status,data:await r.json()};};
 const login=async name=>(await call('/api/v1/dev/login','POST',{devUser:name})).data;
 const a=await login('booking-key-owner'),b=await login('booking-key-other');
 const payload={serviceId:service.id,date:'2099-11-01',time:'10:00',remark:'原始申请',clientKey:'http_booking_recovery_0001'};
 const lookup=key=>'/api/v1/me/booking-submissions/'+key;let id;
 await t.test('concurrent same-key requests make one booking and disclose no foreign result',async()=>{
  const result=await Promise.all(Array.from({length:8},()=>call('/api/v1/bookings','POST',payload,a.token)));
  assert.equal(result.filter(r=>r.status===201).length,1);assert.ok(result.every(r=>[200,201].includes(r.status)));
  assert.equal(new Set(result.map(r=>r.data.booking.id)).size,1);id=result[0].data.booking.id;
  assert.equal((await call(lookup(payload.clientKey))).status,401);
  assert.equal((await call(lookup(payload.clientKey),'GET',null,b.token)).status,404);
  assert.equal((await call(lookup(payload.clientKey),'GET',null,a.token)).data.booking.id,id);
 });
 await t.test('same key cannot change a remark or time',async()=>{
  for(const change of [{remark:'替换原备注'},{time:'11:00'}]){
   const r=await call('/api/v1/bookings','POST',{...payload,...change},a.token);assert.equal(r.status,409);assert.equal(r.data.error,'REQUEST_KEY_REUSED');
  }
  assert.equal((await repo.myBookings(a.userId)).length,1);
 });
 await t.test('cancellation and paused service do not turn an old retry into a new booking',async()=>{
  assert.equal((await call('/api/v1/bookings/'+id+'/cancel','POST',{},a.token)).status,200);service.status='disabled';
  const replay=await call('/api/v1/bookings','POST',payload,a.token);
  assert.equal(replay.status,200);assert.equal(replay.data.booking.id,id);assert.equal(replay.data.booking.status,'cancelled');assert.equal(replay.data.replayed,true);
  assert.equal((await repo.myBookings(a.userId)).length,1);service.status='published';
 });
 await t.test('a valid key never permits a new claim in the past',async()=>{
  const r=await call('/api/v1/bookings','POST',{...payload,date:'2020-01-01',clientKey:'http_booking_past_key_0001'},a.token);
  assert.equal(r.status,409);assert.equal(r.data.error,'SLOT_EXPIRED');
  const found=await call(lookup('http_booking_past_key_0001'),'GET',null,a.token);assert.equal(found.status,200);assert.equal(found.data.rejected,true);assert.equal(found.data.errorCode,'SLOT_EXPIRED');
 });
 await t.test('different keys can map to one exact active booking, and stay bound after cancellation',async()=>{
  const one={...payload,time:'11:00',clientKey:'http_booking_same_slot_001'},two={...one,clientKey:'http_booking_same_slot_002'};
  const first=await call('/api/v1/bookings','POST',one,a.token),second=await call('/api/v1/bookings','POST',two,a.token);
  assert.equal(first.data.booking.id,second.data.booking.id);
  const mismatch=await call('/api/v1/bookings','POST',{...one,remark:'另一份需求',clientKey:'http_booking_different_001'},a.token);
  assert.equal(mismatch.status,409);assert.equal(mismatch.data.error,'EXISTING_BOOKING_DIFFERENT');
  await call('/api/v1/bookings/'+first.data.booking.id+'/cancel','POST',{},a.token);
  assert.equal((await call('/api/v1/bookings','POST',two,a.token)).data.booking.status,'cancelled');
 });
 await t.test('a key is scoped to its owner, with strict syntax validation',async()=>{
  const other=await call('/api/v1/bookings','POST',{...payload,time:'12:00'},b.token);assert.equal(other.status,201);assert.notEqual(other.data.booking.id,id);
  for(const clientKey of ['',null,'short','bad/key_1234567890',123])assert.equal((await call('/api/v1/bookings','POST',{...payload,clientKey},a.token)).status,400);
 });
 await t.test('a rejected key remains rejected when a competing booking releases the slot',async()=>{
  const occupied={...payload,time:'13:00',clientKey:'http_occupying_request_001'},loser={...occupied,clientKey:'http_rejected_request_001'};
  const created=await call('/api/v1/bookings','POST',occupied,a.token);
  assert.equal((await call('/api/v1/bookings','POST',loser,b.token)).data.error,'SLOT_TAKEN');
  await call('/api/v1/bookings/'+created.data.booking.id+'/cancel','POST',{},a.token);
  assert.equal((await call('/api/v1/bookings','POST',loser,b.token)).data.error,'SLOT_TAKEN');
  const result=await call(lookup(loser.clientKey),'GET',null,b.token);assert.equal(result.data.rejected,true);assert.equal(result.data.errorCode,'SLOT_TAKEN');
 });
});

test('real PostgreSQL booking submission keys survive restarts, terminal states, contention and rollback',{skip:!process.env.PG_TEST_DATABASE_URL&&'PG_TEST_DATABASE_URL not configured'},async t=>{
 const dsn=process.env.PG_TEST_DATABASE_URL;require('../src/test-database-guard').assertIsolatedDatabase(dsn);
 const {Pool}=require('pg'),{createPgRepository}=require('../src/pg-repository');
 const schema='booking_key_it_'+crypto.randomBytes(6).toString('hex'),control=new Pool({connectionString:dsn});let pool,repo,secondRepo;
 try{
  await control.query('CREATE SCHEMA "'+schema+'"');const options='-c search_path='+schema;
  pool=new Pool({connectionString:dsn,options});await require('../src/schema-migrations').applyMigrations(pool);
  repo=createPgRepository(dsn,{options});await repo.seedRegions(['中心街道']);
  const uid=await repo.upsertIdentity('dev_local','booking-key-owner'),other=await repo.upsertIdentity('dev_local','booking-key-other');
  const sid=(await pool.query("INSERT INTO service_catalog(title,description,district,price,status) VALUES('恢复测试服务','隔离数据库夹具','中心街道','100','published') RETURNING id")).rows[0].id;
  const payload={serviceId:sid,requestedAt:'2099-11-10T02:00:00.000Z',remark:'原始需求',clientKey:'pg_booking_submission_0001'};let original;
  await t.test('concurrent key replays have one durable mapping',async()=>{
   const replies=await Promise.all(Array.from({length:12},()=>repo.createBooking(uid,payload)));
   assert.equal(new Set(replies.map(b=>b.id)).size,1);assert.equal(replies.filter(b=>!b.replayed).length,1);original=replies[0];
   assert.equal((await pool.query('SELECT count(*)::int n FROM booking_requests')).rows[0].n,1);
   assert.equal((await pool.query('SELECT count(*)::int n FROM booking_submissions')).rows[0].n,1);
   await assert.rejects(repo.createBooking(uid,{...payload,remark:'另一份内容'}),{code:'REQUEST_KEY_REUSED'});
  });
  await t.test('a new repository resolves the original key even when the service is paused',async()=>{
   secondRepo=createPgRepository(dsn,{options});await pool.query("UPDATE service_catalog SET status='draft' WHERE id=$1",[sid]);
   assert.equal((await secondRepo.createBooking(uid,payload)).id,original.id);assert.equal((await secondRepo.readBookingSubmission(uid,payload.clientKey)).id,original.id);
   assert.equal(await secondRepo.readBookingSubmission(other,payload.clientKey),null);
   await pool.query("UPDATE service_catalog SET status='published' WHERE id=$1",[sid]);
  });
  await t.test('cancelled, expired and completed outcomes do not reserve another slot',async()=>{
   assert.equal(await repo.cancelBooking(uid,original.id),true);
   assert.equal((await repo.createBooking(uid,payload)).status,'cancelled');
   const next={...payload,clientKey:'pg_booking_submission_0002'},created=await repo.createBooking(uid,next);assert.notEqual(created.id,original.id);
   await pool.query("UPDATE booking_requests SET hold_expires_at=now()-interval '1 minute' WHERE id=$1",[created.id]);
   const expired=await repo.createBooking(uid,next);assert.equal(expired.id,created.id);assert.equal(expired.status,'expired');
   await pool.query("UPDATE booking_requests SET status='completed' WHERE id=$1",[original.id]);
   assert.equal((await repo.createBooking(uid,payload)).status,'completed');
   assert.equal((await pool.query('SELECT count(*)::int n FROM booking_requests')).rows[0].n,2);
  });
  await t.test('distinct keys with identical payloads share a booking; a changed remark does not',async()=>{
   const value={...payload,requestedAt:'2099-11-11T02:00:00.000Z'},requests=Array.from({length:6},(_,i)=>({...value,clientKey:'pg_same_slot_key_000'+i}));
   const replies=await Promise.all(requests.map(v=>repo.createBooking(uid,v)));assert.equal(new Set(replies.map(b=>b.id)).size,1);
   assert.equal((await repo.createBooking(uid,{...value,remark:'替换需求',clientKey:'pg_same_slot_changed_0001'})).error,'existing_booking_different');
   assert.equal((await repo.readBookingSubmission(uid,'pg_same_slot_changed_0001')).errorCode,'EXISTING_BOOKING_DIFFERENT');
  });
  await t.test('cross-account contention has one winner and never returns the other booking',async()=>{
   const value={...payload,requestedAt:'2099-11-12T02:00:00.000Z',clientKey:'pg_cross_account_key_0001'};
   const replies=await Promise.all([repo.createBooking(uid,value),repo.createBooking(other,value)]);
   assert.equal(replies.filter(b=>b.id).length,1);assert.equal(replies.filter(b=>b.error==='slot_taken').length,1);
   const winner=replies[0].id?uid:other,loser=winner===uid?other:uid;
   await repo.cancelBooking(winner,replies.find(b=>b.id).id);
   const retry=await repo.createBooking(loser,value);assert.equal(retry.error,'slot_taken');assert.equal(retry.replayed,true);
   assert.equal((await repo.readBookingSubmission(loser,value.clientKey)).errorCode,'SLOT_TAKEN');
  });
  await t.test('a paused-service rejection cannot later create a booking after publication resumes',async()=>{
   const value={...payload,requestedAt:'2099-11-14T02:00:00.000Z',clientKey:'pg_unavailable_request_001'};
   await pool.query("UPDATE service_catalog SET status='draft' WHERE id=$1",[sid]);
   assert.equal((await repo.createBooking(uid,value)).error,'service_unavailable');
   await pool.query("UPDATE service_catalog SET status='published' WHERE id=$1",[sid]);
   assert.equal((await repo.createBooking(uid,value)).error,'service_unavailable');
   assert.equal((await pool.query('SELECT count(*)::int n FROM booking_requests WHERE requested_at=$1',[value.requestedAt])).rows[0].n,0);
   await assert.rejects(repo.createBooking(uid,{...value,remark:'更换需求'}),{code:'REQUEST_KEY_REUSED'});
  });
  await t.test('booking and submission mapping roll back together if mapping persistence fails',async()=>{
   await pool.query("CREATE FUNCTION fail_booking_mapping_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_MAPPING_FAILURE'; END $$");
   await pool.query('CREATE TRIGGER fail_booking_mapping_fixture BEFORE INSERT ON booking_submissions FOR EACH ROW EXECUTE FUNCTION fail_booking_mapping_fixture()');
   const value={...payload,requestedAt:'2099-11-13T02:00:00.000Z',clientKey:'pg_atomic_submission_0001'};
   try{await assert.rejects(repo.createBooking(uid,value));assert.equal((await pool.query('SELECT count(*)::int n FROM booking_requests WHERE requested_at=$1',[value.requestedAt])).rows[0].n,0);}
   finally{await pool.query('DROP TRIGGER fail_booking_mapping_fixture ON booking_submissions');await pool.query('DROP FUNCTION fail_booking_mapping_fixture()');}
   assert.ok((await repo.createBooking(uid,value)).id);
  });
  await t.test('owner export contains bookings and their submission keys, with no foreign rows',async()=>{
   const result=await repo.exportOwnData(uid,'bookings');assert.ok(result.items.some(b=>b.id===original.id&&b.submission_keys.includes(payload.clientKey)));
   assert.ok(result.items.every(b=>b.id!==undefined));assert.equal((await repo.exportOwnData(other,'bookings')).items.some(b=>b.id===original.id),false);
   assert.ok((await repo.exportOwnData(uid,'booking_submissions')).items.some(row=>row.failure_code==='SERVICE_NOT_AVAILABLE'));
  });
 }finally{if(secondRepo)await secondRepo.close();if(repo)await repo.close();if(pool)await pool.end();try{await control.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}finally{await control.end();}}
});
