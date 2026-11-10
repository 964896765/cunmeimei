'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {content}=require('../src/home-content');
const state=require('../../miniprogram/utils/publication-readiness'),catalog=require('../../miniprogram/utils/classification-contract');
const template=()=>({kind:'news',cityCode:'441900',title:'隔离验收资讯',summary:'测试来源与公开边界',body:'正文第一段\n正文第二段',sourceName:'隔离测试来源',sourceUrl:'https://example.org/local-source',startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),priority:10});
test('all 418 publication projects have explicit readiness without granting new permissions',()=>{
 const entries=catalog.projects.map(p=>({id:p.id,...state.state(p.id)}));assert.equal(entries.length,418);assert.equal(entries.filter(p=>p.canStart).length,43);
 assert.ok(entries.every(p=>p.label&&p.reason));assert.equal(state.state('C03G01S01').label,'发布需求');
 assert.equal(state.state('C04G01S01',[{id:'used',enabled:false}]).canStart,false);
 assert.equal(state.state('C04G01S01',undefined,{publishingApproved:false}).canStart,false);
 assert.equal(state.state('C23G01S01').canStart,false);assert.equal(state.state('C23G01S01').label,'平台指引');
});
test('home content requires actual sources, finite scheduling and complete ad references',()=>{
 assert.ok(content(template()).body.includes('\n'));
 for(const sourceUrl of ['http://example.org','https://127.0.0.1/a','https://api.internal/a','https://secret:password@example.org/a'])assert.throws(()=>content({...template(),sourceUrl}));
 for(const change of [{sourceName:''},{body:''},{endsAt:'invalid'},{priority:101},{cityCode:'999999'},{kind:'ad'},{kind:'banner'}])assert.throws(()=>content({...template(),...change}));
});
test('real PostgreSQL whole-product polish: home publishing, review, ads, reports, points and message pagination',{skip:!process.env.PG_TEST_DATABASE_URL&&'PG_TEST_DATABASE_URL not configured'},async t=>{
 const dsn=process.env.PG_TEST_DATABASE_URL;require('../src/test-database-guard').assertIsolatedDatabase(dsn);
 const {Pool}=require('pg'),{createPgRepository}=require('../src/pg-repository'),{createApp}=require('../src/server');
 const schema='product_polish_it_'+crypto.randomBytes(6).toString('hex'),control=new Pool({connectionString:dsn});let pool,repo,app;
 try{
  await control.query('CREATE SCHEMA "'+schema+'"');const options='-c search_path='+schema;pool=new Pool({connectionString:dsn,options});await require('../src/schema-migrations').applyMigrations(pool);
  repo=createPgRepository(dsn,{options});await repo.seedRegions(['中心街道']);
  app=createApp({repo,areas:['中心街道'],allowDevLogin:true,adminPassword:'local-polish-operator-secret',verificationAdminPassword:'local-polish-verifier-secret'});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.address().port;
  async function req(route,method='GET',body,auth={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  const login=async devUser=>(await req('/api/v1/dev/login','POST',{devUser})).data;
  const owner=await login('polish-content-owner'),reader=await login('polish-content-reader'),other=await login('polish-content-outsider');
  const operatorLogin=await req('/admin/api/login','POST',{password:'local-polish-operator-secret'}),operator={cookie:operatorLogin.cookie,csrf:operatorLogin.data.csrf};
  const verifierLogin=await req('/admin/api/login','POST',{role:'verifier',password:'local-polish-verifier-secret'}),verifier={cookie:verifierLogin.cookie,csrf:verifierLogin.data.csrf};
  const checks={textReviewed:true,imagesReviewed:true,sourceReviewed:true,advertisingReviewed:true,reason:'隔离测试：已核对夹具来源和适用范围'};
  const publish=async entry=>{const r=await req('/admin/api/home-content/'+entry.id+'/review','POST',{...checks,status:'published',revision:entry.revision},operator);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
  let article,reportId,advertiser,ad,pubId,imageId;
  await t.test('content management requires role and CSRF; draft is private until explicitly reviewed',async()=>{
   assert.equal((await req('/admin/api/home-content','POST',template())).status,401);
   assert.equal((await req('/admin/api/home-content','POST',template(),{cookie:operator.cookie,csrf:'invalid'})).status,403);
   assert.equal((await req('/admin/api/home-content','POST',template(),verifier)).status,403);
   const created=await req('/admin/api/home-content','POST',template(),operator);assert.equal(created.status,201);article=created.data;
   assert.equal((await req('/api/v1/home/content/'+article.id)).status,404);
   assert.equal((await req('/admin/api/home-content/'+article.id+'/review','POST',{status:'published',revision:1,reason:'缺少核查确认的夹具审核'},operator)).status,400);
   await publish(article);assert.equal((await req('/api/v1/home?cityCode=441900')).data.news[0].id,article.id);
   assert.equal((await req('/api/v1/home?cityCode=310100')).data.news.length,0);
   assert.ok((await req('/admin/api/home-cities','GET',undefined,operator)).data.items.length>300);
  });
  await t.test('editing withdraws public content and stale review cannot approve the new revision',async()=>{
   const updated=await req('/admin/api/home-content/'+article.id,'PUT',{...template(),title:'修改后须重新审核的资讯',revision:2},operator);assert.equal(updated.status,200);article=updated.data;
   assert.equal((await req('/api/v1/home/content/'+article.id)).status,404);
   assert.equal((await req('/admin/api/home-content/'+article.id+'/review','POST',{...checks,status:'published',revision:2},operator)).status,409);
   const task=await repo.reviewTask('homecontent',article.id,'operator');assert.equal(task.detail.title,article.title);
   await publish(article);
  });
  await t.test('news pagination remains distinct and inactive schedules are hidden',async()=>{
   for(let i=0;i<24;i++){const row=await repo.saveHomeContent(null,{...template(),title:'分页资讯 '+i},'fixture');await repo.reviewHomeContent(row.id,{...checks,status:'published',revision:row.revision},'fixture');}
   const first=(await req('/api/v1/home/news?cityCode=441900&page=1')).data,second=(await req('/api/v1/home/news?cityCode=441900&page=2')).data;
   assert.equal(first.items.length,20);assert.equal(first.hasMore,true);assert.equal(second.items.length,5);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,25);
   await pool.query("UPDATE home_content SET ends_at=now()-interval '1 minute',starts_at=now()-interval '1 day' WHERE id=$1",[article.id]);
   assert.equal((await req('/api/v1/home/content/'+article.id)).status,404);await pool.query("UPDATE home_content SET ends_at=now()+interval '1 day' WHERE id=$1",[article.id]);
  });
  await t.test('ads require a valid advertiser, same-owner public target, city and reviewed image',async()=>{
   const bytes=await require('sharp')({create:{width:180,height:100,channels:3,background:'#eeeeee'}}).png().toBuffer();imageId=(await repo.uploadContentImage(owner.userId,bytes)).id;
   pubId=(await pool.query("INSERT INTO publications(user_id,type,title,description,district,status,attributes,image_ids) VALUES($1,'used','隔离广告落地信息','明确标记的测试商品，非真实供给','中心街道','published',$2,$3) RETURNING id",[owner.userId,{cityCode:'441900'},[imageId]])).rows[0].id;
   advertiser=(await req('/admin/api/home-advertisers','POST',{userId:owner.userId,name:'隔离广告主',reference:'EVIDENCE:AD-001'},operator)).data;
   const draft=await req('/admin/api/home-content','POST',{...template(),kind:'ad',body:'',sourceName:'',sourceUrl:'',targetId:pubId,imageId,advertiserId:advertiser.id},operator);assert.equal(draft.status,201);ad=draft.data;
   assert.equal((await req('/admin/api/home-content/'+ad.id+'/review','POST',{...checks,status:'published',revision:ad.revision},operator)).status,409);
   const proof={revision:1,status:'verified',validUntil:new Date(Date.now()+7*86400000).toISOString(),manuallyVerified:true,reason:'隔离夹具主体材料已核对，不代表真实主体'};
   assert.equal((await req('/admin/api/home-advertisers/'+advertiser.id,'POST',proof,operator)).status,403);
   assert.equal((await req('/admin/api/home-advertisers/'+advertiser.id,'POST',proof,verifier)).status,200);
   assert.equal((await req('/admin/api/home-targets')).status,401);
   const candidates=(await req('/admin/api/home-targets?cityCode=441900&q='+encodeURIComponent('隔离广告'),'GET',undefined,operator)).data;
   assert.equal(candidates.items[0].id,pubId);assert.deepEqual(candidates.items[0].image_ids,[imageId]);assert.equal(candidates.items[0].advertisers[0].id,advertiser.id);
   assert.equal((await req('/admin/api/home-targets?cityCode=310100','GET',undefined,operator)).data.items.length,0);
   await publish(ad);const banner=(await req('/api/v1/home?cityCode=441900')).data.banners[0];assert.equal(banner.id,ad.id);assert.equal(banner.label,'广告');assert.equal(banner.advertiserId,undefined);
   await pool.query("UPDATE advertisers SET status='revoked' WHERE id=$1",[advertiser.id]);assert.equal((await req('/api/v1/home?cityCode=441900')).data.banners.length,0);assert.equal((await req('/api/v1/home/content/'+ad.id)).status,404);assert.equal((await req('/admin/api/home-targets?cityCode=441900','GET',undefined,operator)).data.items[0].advertisers.length,0);
   await pool.query("UPDATE advertisers SET status='verified' WHERE id=$1",[advertiser.id]);await pool.query("UPDATE publications SET status='closed' WHERE id=$1",[pubId]);assert.equal((await req('/api/v1/home?cityCode=441900')).data.banners.length,0);await pool.query("UPDATE publications SET status='published' WHERE id=$1",[pubId]);
  });
  await t.test('home reports deduplicate, enter the common workbench and notify only their author',async()=>{
   const first=await req('/api/v1/home/content/'+article.id+'/reports','POST',{reason:'隔离测试：来源日期需要重新核查'},reader);assert.equal(first.status,201);reportId=first.data.id;
   const replay=await req('/api/v1/home/content/'+article.id+'/reports','POST',{reason:'隔离测试：来源日期需要重新核查'},reader);assert.equal(replay.data.id,reportId);
   assert.ok((await repo.reviewWorkbench({kind:'homereport'})).items.some(r=>r.id===reportId));
   assert.equal((await req('/api/v1/me/home-reports/'+reportId,'GET',undefined,other)).status,404);
   assert.equal((await req('/admin/api/home-reports/'+reportId,'POST',{status:'resolved',revision:1,response:'隔离夹具已核对来源并补充说明'},verifier)).status,403);
   assert.equal((await req('/admin/api/home-reports/'+reportId,'POST',{status:'resolved',revision:1,response:'隔离夹具已核对来源并补充说明'},operator)).status,200);
   assert.ok((await repo.notifications(reader.userId,0)).items.some(n=>n.targetKind==='home-report'&&n.targetId===reportId));
   assert.equal((await repo.exportOwnData(reader.userId,'home_reports')).items[0].id,reportId);
  });
  await t.test('discovery saved-state batches are private and reflect existing bookmarks',async()=>{
   assert.equal((await req('/api/v1/items/'+pubId+'/saved','PUT',{},reader)).status,200);
   const saved=await req('/api/v1/me/saved-state?ids='+pubId,'GET',undefined,reader);assert.deepEqual(saved.data.savedIds,[pubId]);
   assert.deepEqual((await req('/api/v1/me/saved-state?ids='+pubId,'GET',undefined,other)).data.savedIds,[]);
   assert.equal((await req('/api/v1/me/saved-state?ids=not-an-id','GET',undefined,reader)).status,400);
  });
  await t.test('points notify once per ledger event and target lookup can read an older own entry',async()=>{
   let first;for(let i=0;i<25;i++){const entry=await repo.postPoints(owner.userId,{kind:'earn',amount:1,key:'polish_points_event_000'+i,source:'ticket:POLISH-'+i,reason:'隔离测试：贡献账本与消息联动',actor:'fixture'});if(i===0)first=entry;}
   const count=async()=>(await pool.query("SELECT count(*)::int n FROM user_notifications WHERE user_id=$1 AND target_kind='points-ledger'",[owner.userId])).rows[0].n;assert.equal(await count(),25);
   await repo.postPoints(owner.userId,{kind:'earn',amount:1,key:'polish_points_event_0000',source:'ticket:POLISH-0',reason:'隔离测试：贡献账本与消息联动',actor:'fixture'});assert.equal(await count(),25);
   const own=await req('/api/v1/points/ledger/'+first.id,'GET',undefined,owner);assert.equal(own.status,200);assert.equal(own.data.item.id,first.id);
   assert.equal((await req('/api/v1/points/ledger/'+first.id,'GET',undefined,other)).status,404);
  });
  await t.test('contact history loads beyond 100 and pending counts do not silently truncate',async()=>{
   await pool.query("WITH p AS (INSERT INTO publications(user_id,type,title,description,district,status) SELECT $1,'used','联系分页夹具'||g,'用于验证分页，非真实供给','中心街道','published' FROM generate_series(1,101) g RETURNING id) INSERT INTO contact_requests(publication_id,requester_id,owner_id,message) SELECT id,$2,$1,'本机隔离验证联系记录' FROM p",[owner.userId,reader.userId]);
   const first=(await req('/api/v1/me/contacts','GET',undefined,owner)).data,second=(await req('/api/v1/me/contacts?page=2','GET',undefined,owner)).data;
   assert.equal(first.items.length,100);assert.equal(first.hasMore,true);assert.equal(first.pendingCount,101);assert.equal(second.items.length,1);assert.equal(second.hasMore,false);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,101);
   assert.equal((await req('/api/v1/me/contacts','GET',undefined,other)).data.items.length,0);
  });
 }finally{if(app){app.closeAllConnections();await new Promise(resolve=>app.close(resolve));}if(repo)await repo.close();if(pool)await pool.end();try{await control.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}finally{await control.end();}}
});
