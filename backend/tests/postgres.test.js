'use strict';
// Opt-in integration suite. ONLY uses PG_TEST_DATABASE_URL; runs in disposable isolated schema.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const dsn=process.env.PG_TEST_DATABASE_URL;
test('real PostgreSQL: migration, concurrent slot claim, expiry and schema checks', {skip: !dsn && 'PG_TEST_DATABASE_URL not configured'}, async(t)=>{
 const {assertIsolatedDatabase}=require('../src/test-database-guard');
 assertIsolatedDatabase(dsn);
 const {Pool}=require('pg');
 const {applyMigrations,checkMigrations}=require('../src/schema-migrations');
 const {createPgRepository}=require('../src/pg-repository');
 const schema='citylife_it_'+crypto.randomBytes(6).toString('hex');
 const control=new Pool({connectionString:dsn,max:2,connectionTimeoutMillis:5000});
 let pool,repo;
 try {
   await control.query(`CREATE SCHEMA "${schema}"`);
   const options=`-c search_path=${schema}`;
   pool=new Pool({connectionString:dsn,options,max:12,connectionTimeoutMillis:5000});
   const run=await applyMigrations(pool);assert.equal(run.status.ok,true);
   assert.equal(run.appliedNow.length,require('../src/schema-migrations').manifest().length);
   assert.equal((await applyMigrations(pool)).appliedNow.length,0);
   repo=createPgRepository(dsn,{options});await repo.verifySchema();
   await repo.seedRegions(['中心街道','北城区']);assert.equal((await repo.listRegions()).length,2);
   assert.equal((await repo.addRegion('东城街道')).enabled,true);
   assert.equal(await repo.addRegion('东城街道'),null,'unique region');
   assert.equal((await repo.setRegionEnabled('东城街道',false)).enabled,false);
   const hiddenAuthor=await repo.upsertIdentity('dev_local','hidden-area-author');
   const hiddenService=(await pool.query("INSERT INTO service_catalog(title,description,district,price,status) VALUES('hidden','disabled location','东城街道','10','published') RETURNING id")).rows[0].id;
   assert.equal(await repo.availableSlots(hiddenService,'2099-11-01'),null);
   assert.equal(await repo.createBooking(hiddenAuthor,{serviceId:hiddenService,requestedAt:'2099-11-01T02:00:00.000Z',remark:'disabled'}),null);
   assert.equal((await repo.listCategories()).find(x=>x.id==='job').restricted,true);
   assert.equal((await repo.setCategoryEnabled('used',false)).enabled,false);
   assert.equal((await repo.setCategoryEnabled('used',true)).enabled,true);
   assert.equal(await repo.setCategoryEnabled('job',true),null);

   // V0.9: disabled regions must not expose previously approved content or bookable services.
   const hiddenItem=await repo.createPublication(hiddenAuthor,{type:'used',title:'hidden region sample',description:'kept for author, hidden from public feed',district:'东城街道',price:'10'});
   assert.equal(await repo.reviewPublication(hiddenItem.id,'published',''),true);
   assert.equal(await repo.getItem(hiddenItem.id),null);
   assert.equal((await repo.listFeed({area:'全部地区'})).some(x=>x.id===hiddenItem.id),false);
   assert.equal((await repo.setRegionEnabled('东城街道',true)).enabled,true);
   assert.equal((await repo.getItem(hiddenItem.id)).id,hiddenItem.id);
   assert.equal((await repo.setRegionEnabled('东城街道',false)).enabled,false);


   // Multiple concurrent WeChat logins for one openid must create exactly ONE app_user.
   const countBefore=Number((await pool.query('SELECT count(*) AS n FROM app_users')).rows[0].n);
   const concurrent=await Promise.all(Array.from({length:20},()=>repo.upsertIdentity('wechat_miniapp','parallel-openid')));
   assert.equal(new Set(concurrent).size,1);
   const countAfter=Number((await pool.query('SELECT count(*) AS n FROM app_users')).rows[0].n);
   assert.equal(countAfter-countBefore,1,'no orphan user from concurrent login');
   const identityId=concurrent[0];
   const persisted=await repo.upsertIdentity('wechat_miniapp','parallel-openid');
   assert.equal(identityId,persisted,'identity persists between calls');
   const oneTimeToken='f'.repeat(64);
   await repo.newSession(identityId,oneTimeToken,new Date(Date.now()+120000).toISOString());
   // Separate repository = separate connection pool, simulates an API restart/another worker.
   const secondPoolRepo=createPgRepository(dsn,{options});
   try {
     assert.equal(await secondPoolRepo.authenticate(oneTimeToken),identityId);
     assert.equal(await secondPoolRepo.revokeSession(oneTimeToken),true);
     assert.equal(await repo.authenticate(oneTimeToken),null);
   } finally { await secondPoolRepo.close(); }
   const first=await repo.upsertIdentity('dev_local','first'),second=await repo.upsertIdentity('dev_local','second');
   const note=await repo.createPublication(first,{type:'used',title:'回归用二手',description:'数据库撤回内容回归用描述',district:'中心街道',price:'¥10'});
   assert.equal(note.status,'pending');
   assert.equal(await repo.withdrawPublication(second,note.id),false,'non-owner cannot withdraw');
   assert.equal(await repo.withdrawPublication(first,note.id),true);
   assert.equal(await repo.withdrawPublication(first,note.id),false,'idempotency guard');
   assert.equal((await repo.myPublications(first)).find(x=>x.id===note.id).status,'closed');
   assert.equal(await repo.getItem(note.id),null,'withdrawn content never public');
   // V0.11: revised published content is invisible until reapproved; concurrent edits reject stale revisions.
   const revised=await repo.createPublication(first,{type:'used',title:'公开前旧标题',description:'需要在修改后重新审核的公开帖子',district:'中心街道',price:'100'});
   assert.equal(revised.revision,1);
   assert.equal(await repo.reviewPublication(revised.id,'published',''),true);
   assert.ok(await repo.getItem(revised.id));
   const changed=await repo.updatePublication(first,revised.id,{type:'used',title:'审核中新标题',description:'重新审核通过之前不可对外展示的正文',district:'中心街道',price:'90'},1);
   assert.equal(changed.status,'pending');assert.equal(changed.revision,2);
   assert.equal(await repo.getItem(revised.id),null);
   assert.deepEqual(await repo.updatePublication(first,revised.id,{type:'used',title:'覆盖',description:'不能由旧版本直接覆盖内容',district:'中心街道',price:'90'},1),{error:'revision_conflict'});
   assert.equal(await repo.updatePublication(second,revised.id,{type:'used',title:'不能编辑',description:'其他用户不应该编辑这些内容',district:'中心街道',price:'90'},2),false);
   assert.equal(await repo.reviewPublication(revised.id,'published',''),true);
   assert.equal((await repo.getItem(revised.id)).title,'审核中新标题');
   // V0.13: public service-demand posts are not bookable catalog services.
   const demand=await repo.createPublication(first,{type:'service',title:'请求附近维修师傅',description:'用户发布的是求助需求，不是商家提供的可预约服务',district:'中心街道',price:'100'});
   assert.equal(await repo.reviewPublication(demand.id,'published',''),true);
   assert.equal((await repo.getItem(demand.id)).kind,'listing');
   assert.equal((await repo.listFeed({type:'service'})).find(x=>x.id===demand.id).kind,'listing');
   const s=(await pool.query("INSERT INTO service_catalog(title,description,district,price,status) VALUES('服务','测试','中心街道','100','published') RETURNING id")).rows[0].id;
   assert.equal((await repo.getItem(s)).kind,'service');
   // V0.10: PostgreSQL pages are distinct and details work independently of pagination.
   for(let i=0;i<25;i++){
     const p=await repo.createPublication(first,{type:'used',title:'分页记录'+String(i).padStart(2,'0'),description:'用于测试 PostgreSQL 分页的完整内容',district:'中心街道',price:'5'});
     assert.equal(await repo.reviewPublication(p.id,'published',''),true);
   }
   const pgFirst=await repo.listFeed({type:'used',limit:12,offset:0});
   const pgSecond=await repo.listFeed({type:'used',limit:12,offset:12});
   assert.equal(pgFirst.length,12);assert.equal(pgSecond.length,12);
   assert.equal(new Set([...pgFirst,...pgSecond].map(p=>p.id)).size,24);
   assert.equal((await repo.getItem(pgFirst[0].id)).id,pgFirst[0].id);
   // V0.17: repository itself must refuse new stale slots even outside the HTTP API.
   assert.deepEqual(await repo.createBooking(first,{serviceId:s,requestedAt:'2025-11-01T02:00:00.000Z',remark:'past'}),{error:'slot_expired'});
   const requestedAt='2099-11-01T02:00:00.000Z';
   const claims=await Promise.all(Array.from({length:16},(_,i)=>repo.createBooking(i%2?first:second,{serviceId:s,requestedAt,remark:'并发预约'})));
   const successfulClaims=claims.filter(x=>x?.id);
   assert.ok(successfulClaims.length>=1,'one account must claim the slot');
   assert.equal(new Set(successfulClaims.map(x=>x.id)).size,1,'retries by the winning user share the same booking');
   assert.equal(claims.filter(x=>x?.error==='slot_taken').length,16-successfulClaims.length);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM booking_requests WHERE status IN ('pending_confirm','confirmed')")).rows[0].n,1);
   const winner=successfulClaims[0];
   const sameAccountRetry=await repo.createBooking(winner.userId,{serviceId:s,requestedAt,remark:'网络超时重复请求'});
   assert.equal(sameAccountRetry.replayed,true);
   assert.equal(sameAccountRetry.id,winner.id);
   const competitor=claims.find((_,i)=> (i%2 ? first : second)!==winner.userId);
   assert.equal(competitor.error,'slot_taken');
   assert.equal(await repo.cancelBooking(winner.userId,winner.id),true);
   const again=await repo.createBooking(second,{serviceId:s,requestedAt,remark:'取消后重新预约'});assert.ok(again.id);
   await pool.query("UPDATE booking_requests SET hold_expires_at=now()-interval '1 minute' WHERE id=$1",[again.id]);
   assert.equal(await repo.cancelBooking(second,again.id),false,'expired holds cannot be cancelled');
   const third=await repo.createBooking(first,{serviceId:s,requestedAt,remark:'过期后重新预约'});assert.ok(third.id);
   assert.equal((await pool.query('SELECT status FROM booking_requests WHERE id=$1',[again.id])).rows[0].status,'expired');
   // V0.20: a revoked merchant staff account must not mutate a booking after
   // a PostgreSQL worker has rechecked and locked its membership in the TX.
   // V0.23: multiple simultaneous submissions by the same resident must
   // create one pending application in the database, even across pool clients.
   const concurrentApplications=await Promise.all(Array.from({length:12},()=>
     repo.createMerchant(first,{name:'V20测试维修铺',category:'维修',district:'中心街道'})));
   assert.equal(new Set(concurrentApplications.map(x=>x.id)).size,1,
     'parallel applications must share the one pending record');
   const reqMerchant=concurrentApplications[0];
   assert.ok(reqMerchant?.id);
   const applicationCount=await pool.query(
     "SELECT count(*)::int AS n FROM merchant_applications WHERE user_id=$1 AND status IN ('pending','in_review','needs_documents')",[first]);
   assert.equal(applicationCount.rows[0].n,1,'only one active application for resident');
   assert.ok(await repo.submitMerchantEvidence(first,reqMerchant.id,{
     registrationCode:'V20-POSTGRES-TEST-123',licenseHolder:'V20测试维修铺',evidenceReference:'disposable-test-only'
   }));
   const verified=await repo.approveMerchantApplication(reqMerchant.id,'测试环境模拟人工核验',true);
   assert.ok(verified?.id);
   const worker=await repo.upsertIdentity('dev_local','v20-worker');
   assert.ok(await repo.addMerchantMember(first,verified.id,worker,'staff'));
   const merchantService=await repo.createMerchantService(first,verified.id,{title:'V20维修服务',description:'测试商家员工权限撤销后的订单安全性',price:'50'});
   assert.ok(merchantService?.id);
   assert.equal(await repo.reviewService(merchantService.id,'published'),true);
   const staffSlot=await repo.createBooking(second,{
     serviceId:merchantService.id,requestedAt:'2099-11-03T02:00:00.000Z',remark:'employee-revocation-test'
   });
   assert.ok(staffSlot?.id);
   assert.equal(await repo.removeMerchantMember(first,verified.id,worker),true);
   assert.equal(await repo.actOnMerchantBooking(worker,verified.id,staffSlot.id,'confirm'),null);
   assert.equal((await repo.actOnMerchantBooking(first,verified.id,staffSlot.id,'confirm')).status,'confirmed');
   assert.equal(await repo.actOnMerchantBooking(worker,verified.id,staffSlot.id,'complete'),null);
   assert.equal((await repo.actOnMerchantBooking(first,verified.id,staffSlot.id,'complete')).status,'completed');
   // A concurrently paused service may retain a reservation that won earlier,
   // but no new reservations may succeed after the pause has committed.
   const pausedService=await repo.createMerchantService(first,verified.id,{title:'V20并发暂停',description:'并发预约时立即暂停新请求的服务',price:'60'});
   assert.ok(pausedService?.id);
   assert.equal(await repo.reviewService(pausedService.id,'published'),true);
   const simultaneous=await Promise.all([
     repo.createBooking(second,{serviceId:pausedService.id,requestedAt:'2099-11-04T02:00:00.000Z',remark:'parallel-pause'}),
     repo.changeMerchantServiceStatus(first,verified.id,pausedService.id,'pause')
   ]);
   assert.equal(simultaneous[1].status,'draft');
   assert.ok(simultaneous[0]===null || !!simultaneous[0].id,
     'booking may precede the pause or be blocked by it');
   assert.equal(await repo.createBooking(first,{serviceId:pausedService.id,requestedAt:'2099-11-04T03:00:00.000Z',remark:'after-pause'}),null);
   // V0.21: revoking a manager must block resubmission, and the service
   // must remain paused until an authorized operator explicitly resubmits.
   const revokedManager=await repo.upsertIdentity('dev_local','v21-revoked-manager');
   assert.ok(await repo.addMerchantMember(first,verified.id,revokedManager,'manager'));
   assert.equal(await repo.removeMerchantMember(first,verified.id,revokedManager),true);
   assert.equal(await repo.changeMerchantServiceStatus(revokedManager,verified.id,pausedService.id,'resubmit'),null);
   assert.equal((await pool.query('SELECT status FROM service_catalog WHERE id=$1',[pausedService.id])).rows[0].status,'draft');
   assert.equal((await repo.changeMerchantServiceStatus(first,verified.id,pausedService.id,'resubmit')).status,'pending_review');
   assert.equal(await repo.changeMerchantServiceStatus(revokedManager,verified.id,pausedService.id,'pause'),null);
   await t.test('city code filtering precedes pagination and legacy rows are never guessed into a city',async()=>{
    for(const [cityCode,title]of [['441900','city geo one'],['440100','city geo other'],['','city geo legacy']]){
     const row=await repo.createPublication(first,{type:'used',title,description:'isolated geographic fixture only',district:'中心街道',price:'10',attributes:cityCode?{cityCode}:{}});await repo.reviewPublication(row.id,'published','');
    }
    const rows=await repo.listFeed({cityCode:'441900',type:'used',q:'city geo',limit:1});assert.equal(rows.length,1);assert.equal(rows[0].title,'city geo one');
    assert.equal((await repo.listFeed({cityCode:'441900',type:'used',q:'city geo',limit:1,offset:1})).length,0);
    assert.equal((await repo.listFeed({type:'used',q:'city geo'})).length,3);
   });
   await t.test('verified map points require public status, scope and test isolation on each read',async()=>{
    const ids=[];
    for(const [title,status,isTest,cityCode,approved]of [['geo visible one','published',false,'441900',true],['geo pending','pending_review',false,'441900',true],['geo test','published',true,'441900',true],['geo unapproved','published',false,'441900',false],['geo other city','published',false,'440100',true]]){
     const item=(await pool.query('INSERT INTO service_catalog(title,description,district,price,status,is_test) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[title,'isolated geographic fixture, no real location','中心街道','20',status,isTest])).rows[0];ids.push(item.id);
     await repo.setPublicLocation(item.id,{kind:'service',cityCode,districtCode:'',latitude:23,longitude:113,precision:'approximate',approved,verificationNote:'isolated geographic integration fixture',categoryId:'C03G02S01'});
    }
    const args={cityCode:'441900',west:112,east:114,south:22,north:24,q:'geo '};
    assert.deepEqual((await repo.listPublicLocations(args)).map(x=>x.id),[ids[0]]);
    assert.equal((await repo.listPublicLocations({...args,includeTest:true})).length,2);
    assert.equal((await repo.listPublicLocations({...args,categoryId:'C04'})).length,0);
    assert.equal((await repo.listPublicLocations({...args,west:114,east:115})).length,0);
    assert.equal((await repo.listFeed({cityCode:'441900',type:'service',q:'geo '})).length,1);
    await pool.query("UPDATE service_catalog SET status='draft' WHERE id=$1",[ids[0]]);
    assert.equal((await repo.listPublicLocations(args)).length,0,'pause immediately removes public pin');
   });
   await t.test('map filters apply before paging, count all matches and never equate public coordinates with publisher verification',async()=>{
    const photo=(await pool.query("INSERT INTO content_images(user_id,data,thumbnail,width,height) VALUES($1,$2,$2,1,1) RETURNING id",[first,Buffer.from('isolated-map-image-fixture')])).rows[0].id;
    const records=[];
    for(const [age,hasImage]of [['1 day',true],['3 days',false],['20 days',true]]){
     const row=(await pool.query("INSERT INTO service_catalog(title,description,district,status,created_at,image_ids,merchant_id) VALUES('map-filter-fixture','isolated fixture','中心街道','published',now()-$1::interval,$2,$3) RETURNING id",[age,hasImage?[photo]:[],verified.id])).rows[0];records.push(row.id);
     await repo.setPublicLocation(row.id,{kind:'service',cityCode:'441900',districtCode:'',latitude:23,longitude:113,precision:'approximate',approved:true,verificationNote:'isolated map filter fixture'});
    }
    const pictures={q:'map-filter-fixture',images:'with',sort:'latest',limit:1};
    assert.deepEqual((await repo.listFeed(pictures)).map(x=>x.id),[records[0]]);
    assert.deepEqual((await repo.listFeed({...pictures,offset:1})).map(x=>x.id),[records[2]],'picture filtering precedes pagination');
    assert.equal((await repo.listFeed({...pictures,offset:2})).length,0);
    assert.equal((await repo.listFeed({...pictures,days:7,limit:50})).length,1);
    const args={cityCode:'441900',west:112,east:114,south:22,north:24,q:'map-filter-fixture',sort:'latest'};
    let rows=await repo.listPublicLocations({...args,days:7,limit:1});assert.equal(rows[0].id,records[0]);assert.equal(rows[0].totalCount,2);assert.equal(rows[0].images.length,1);assert.equal(rows[0].publisherVerified,true);
    rows=await repo.listPublicLocations({...args,days:7,offset:1,limit:1});assert.equal(rows[0].id,records[1]);assert.equal(rows[0].totalCount,2);
    assert.equal((await repo.listPublicLocations({...args,days:7,images:'with'})).length,1);
    assert.equal((await repo.listPublicLocations({...args,days:30,images:'with'})).length,2);
    assert.equal((await repo.listPublicLocations({...args,publisher:'verified'})).length,3);
    const unverified=(await pool.query("INSERT INTO service_catalog(title,district,status,image_ids) VALUES('unverified-map-position-fixture','中心街道','published',$1) RETURNING id",[[photo]])).rows[0].id;
    await repo.setPublicLocation(unverified,{kind:'service',cityCode:'441900',districtCode:'',latitude:23,longitude:113,precision:'approximate',approved:true,verificationNote:'isolated unverified publisher map fixture'});
    const unverifiedArgs={...args,q:'unverified-map-position-fixture'};
    assert.equal((await repo.listPublicLocations({...unverifiedArgs,publisher:'verified'})).length,0);
    rows=await repo.listPublicLocations(unverifiedArgs);assert.equal(rows[0].publisherVerified,false);assert.equal(rows[0].images.length,0,'private images cannot leak as map thumbnails');
    assert.equal((await repo.listPublicLocations({...args,type:'housing'})).length,0);
    rows=await repo.listPublicLocations({...args,sort:'recommended'});assert.equal(rows.length,3,'recommendation changes order without hiding ordinary public points');
   });
   await t.test('search time and radius filters run before pagination, enforce public-location privacy and preserve city/test isolation',async()=>{
    const records={};
    for(const [title,age,latitude,status,isTest,cityCode,approved]of [
     ['filter near one','12 hours',23.01,'published',false,'441900',true],
     ['filter near two','2 days',23.02,'published',false,'441900',true],
     ['filter far','0 hours',24,'published',false,'441900',true],
     ['filter old','20 days',23.03,'published',false,'441900',true],
     ['filter pending','0 hours',23.01,'pending_review',false,'441900',true],
     ['filter test','0 hours',23.01,'published',true,'441900',true],
     ['filter city','0 hours',23.01,'published',false,'440100',true],
     ['filter unapproved','0 hours',23.01,'published',false,'441900',false]
    ]){
     const row=(await pool.query("INSERT INTO service_catalog(title,description,district,price,status,is_test,created_at) VALUES($1,'isolated search-filter fixture','中心街道','20',$2,$3,now()-$4::interval) RETURNING id",[title,status,isTest,age])).rows[0];records[title]=row.id;
     await repo.setPublicLocation(row.id,{kind:'service',cityCode,districtCode:'',latitude,longitude:113,precision:'approximate',approved,verificationNote:'isolated search filter fixture'});
    }
    const personal=await repo.createPublication(first,{type:'service',title:'filter private demand',description:'isolated private location must never appear',district:'中心街道',price:'20',attributes:{cityCode:'441900'}});await repo.reviewPublication(personal.id,'published','');
    await repo.setPublicLocation(personal.id,{kind:'service',cityCode:'441900',districtCode:'',latitude:23,longitude:113,precision:'approximate',approved:true,verificationNote:'synthetic malformed metadata for privacy boundary test'});
    const args={q:'filter ',cityCode:'441900',sort:'latest',days:7,radiusKm:50,latitude:23,longitude:113,limit:1};
    assert.deepEqual((await repo.listFeed(args)).map(x=>x.id),[records['filter near one']]);
    assert.deepEqual((await repo.listFeed({...args,offset:1})).map(x=>x.id),[records['filter near two']]);
    assert.equal((await repo.listFeed({...args,offset:2})).length,0);
    assert.equal((await repo.listFeed({...args,days:1,limit:50})).length,1);
    assert.equal((await repo.listFeed({...args,days:30,limit:50})).length,3);
    assert.equal((await repo.listFeed({...args,includeTest:true,limit:50})).length,3);
    assert.equal((await repo.listFeed({...args,days:30,limit:50})).some(x=>x.id===personal.id),false);
    assert.equal((await repo.listFeed({...args,radiusKm:100,days:7,limit:50})).length,2);
    const publicRows=await repo.listFeed({...args,radiusKm:0,publicOnly:true,limit:50});
    assert.equal(publicRows.length,3);assert.ok(publicRows.every(x=>x.id!==personal.id));
    assert.equal((await repo.listFeed({...args,radiusKm:0,publicOnly:true,days:30,limit:50})).length,4);
   });
   await t.test('map verification API rejects personal publications, absent CSRF and unknown cities',async()=>{
    const app=require('../src/server').createApp({repo,areas:['中心街道'],allowDevLogin:true,phoneEncryptionKey:crypto.randomBytes(32).toString('base64'),adminPassword:'isolated-geo-admin-password'});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
    try{
     const login=await fetch(base+'/admin/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'isolated-geo-admin-password'})});const cookie=login.headers.get('set-cookie').split(';')[0],csrf=(await login.json()).csrf;
     await repo.verifyPhone(first,'13900000001','wechat_phone','isolated-provider-fixture');await pool.query("UPDATE publications SET created_at=now()-interval '2 days' WHERE user_id=$1",[first]);
     const publication=await repo.createPublication(first,{type:'used',title:'private address must stay private',description:'isolated fixture content',district:'中心街道',price:'10'});await repo.reviewPublication(publication.id,'published','');
     const payload={kind:'service',cityCode:'441900',latitude:23,longitude:113,precision:'public_business',approved:true,verificationNote:'isolated map fixture validation'};
     const send=(id,data,token=csrf)=>fetch(base+'/admin/api/map-locations/'+id,{method:'PUT',headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':token},body:JSON.stringify(data)});
     assert.equal((await send(publication.id,payload,'')).status,403);assert.equal((await send(publication.id,payload)).status,409);
     const service=(await pool.query("INSERT INTO service_catalog(title,description,district,price,status) VALUES('geo http public','isolated fixture','中心街道','20','published') RETURNING id")).rows[0];
     assert.equal((await send(service.id,{...payload,cityCode:'999999'})).status,400);
     assert.equal((await send(service.id,{...payload,precision:'approximate',latitude:23.123456,longitude:113.123456})).status,200);
     const stored=(await pool.query('SELECT latitude,longitude FROM public_map_locations WHERE item_id=$1',[service.id])).rows[0];assert.equal(stored.latitude,23.12);assert.equal(stored.longitude,113.12);
     const result=await fetch(base+'/api/v1/map?cityCode=441900&west=112&east=114&south=22&north=24&q=geo%20http');assert.equal(result.status,200);const body=await result.json();assert.equal(body.items.length,1);assert.equal(body.items[0].verificationNote,undefined);
    }finally{await new Promise(r=>app.close(r));}
   });
   await t.test('discovery sorts use real favorites, global pagination and verified public distances without private point leakage',async()=>{
    const owner=await repo.upsertIdentity('dev_local','sort-fixture-owner'),fan=await repo.upsertIdentity('dev_local','sort-fixture-fan');
    const records=[];
    for(const [i,price]of ['100','20','面议'].entries()){
     const row=await repo.createPublication(owner,{type:'used',title:'sort-real-'+i,description:'isolated sorting fixture',district:'中心街道',price});
     await repo.reviewPublication(row.id,'published','');await pool.query("UPDATE publications SET created_at=now()-$2::interval WHERE id=$1",[row.id,(3-i)+' hours']);records.push(row);
    }
    await repo.saveItem(fan,records[0].id,true);
    assert.equal((await repo.listFeed({q:'sort-real-',sort:'popular',limit:1}))[0].id,records[0].id);
    assert.equal((await repo.listFeed({q:'sort-real-',sort:'latest',limit:1}))[0].id,records[2].id);
    assert.deepEqual((await repo.listFeed({q:'sort-real-',sort:'price_low'})).map(x=>x.id),[records[1].id,records[0].id,records[2].id]);
    assert.deepEqual((await repo.listFeed({q:'sort-real-',sort:'price_high'})).map(x=>x.id),[records[0].id,records[1].id,records[2].id]);
    const first=await repo.listFeed({q:'sort-real-',sort:'recommended',limit:1}),next=await repo.listFeed({q:'sort-real-',sort:'recommended',limit:1,offset:1});assert.equal(first[0].id,records[0].id);assert.notEqual(first[0].id,next[0].id);
    await pool.query("UPDATE app_users SET status='blocked' WHERE id=$1",[fan]);
    assert.equal((await repo.listFeed({q:'sort-real-',sort:'popular',limit:1}))[0].id,records[2].id,'inactive account favorites do not boost ranking');
    const points=[];
    for(const [i,lat]of [23.2,23.01,23.001].entries()){
     const s=(await pool.query("INSERT INTO service_catalog(title,description,district,price,status) VALUES($1,'sorting fixture','中心街道','20','published') RETURNING id",['sort-point-'+i])).rows[0];points.push(s.id);
     await repo.setPublicLocation(s.id,{kind:'service',cityCode:'441900',districtCode:'',latitude:lat,longitude:113,precision:'public_business',approved:i!==2,verificationNote:'isolated sorting fixture'});
    }
    let rows=await repo.listFeed({q:'sort-point-',sort:'distance',latitude:23,longitude:113,cityCode:'441900'});
    assert.deepEqual(rows.map(x=>x.id),[points[1],points[0]]);assert.ok(rows[0].distanceKm<rows[1].distanceKm);assert.equal(rows[0].latitude,undefined);
    await pool.query("UPDATE service_catalog SET status='disabled' WHERE id=$1",[points[1]]);
    rows=await repo.listFeed({q:'sort-point-',sort:'distance',latitude:23,longitude:113});assert.deepEqual(rows.map(x=>x.id),[points[0]]);
    await pool.query('DELETE FROM public_map_locations WHERE item_id=ANY($1::uuid[])',[points]);
    assert.equal((await repo.listFeed({q:'sort-real-',sort:'distance',latitude:23,longitude:113})).length,0,'personal publications never gain a public point');
   });
   assert.equal((await checkMigrations(pool)).ok,true);
 } finally {
   if(repo)await repo.close();if(pool)await pool.end();
   try {await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await control.end();}
 }
});
