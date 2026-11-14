'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const notice = require('../src/publication-notice');
const rules = require('../../miniprogram/utils/publication-review-rules');
const {acceptedConsent,completedSectorChecks} = require('./helpers/publication-confirmation');
const {residentFields} = require('./helpers/resident-fields');

test('publication notice preserves all twelve supplied chapters and requires the current explicit confirmation',()=>{
 const document=notice.document();
 assert.equal((document.content.match(/^## /gm)||[]).length,12);
 assert.ok(document.content.includes('以上说明不免除平台依法应当承担的信息审核'));
 assert.ok(document.content.includes('东莞市石排青方睐软件中心（个体工商户）'));
 for(const value of [undefined,{},false,{...acceptedConsent(),accepted:false},{...acceptedConsent(),version:'old'},{...acceptedConsent(),hash:'forged'}])assert.throws(()=>notice.validate(value),{code:'PUBLICATION_CONSENT_REQUIRED'});
 assert.deepEqual(notice.validate(acceptedConsent()),acceptedConsent());
});

test('special industry rules resolve independently while preserving all existing category admission policies',()=>{
 const catalog=require('../../miniprogram/utils/classification-contract');
 const expected={C01:'food',C02:'recruitment',C05:'housing',C13:'education',C15:'medical'};
 for(const [projectId,code]of Object.entries(expected))assert.equal(rules.resolve({projectId}).code,code);
 assert.equal(catalog.projects.length,418);
 for(const id of ['C02G01S01','C13G01S01','C15G01S01'])assert.deepEqual(catalog.kindsFor(id),[]);
 const guard=require('../src/publication-records');
 for(const projectId of Object.keys(expected)){
  const rule=rules.resolve({projectId});
  assert.throws(()=>guard.assertReview(rule,{textReviewed:true,imagesReviewed:true}),{code:'CATEGORY_REVIEW_REQUIRED'});
  assert.doesNotThrow(()=>guard.assertReview(rule,completedSectorChecks()));
 }
});

test('native form confirmation remains unchecked until the checkbox changes and content edits clear it',()=>{
 const vm=require('node:vm');let component;
 const source=fs.readFileSync(path.resolve(__dirname,'../../miniprogram/components/publication-confirmation/index.js'),'utf8');
 vm.runInNewContext(source,{require:()=>({}),Component:value=>component=value});
 assert.equal(component.data.checked,false);
 const events=[];
 const instance={data:{...component.data,document:notice.document(),loading:false},setData(value){Object.assign(this.data,value);},triggerEvent(name,value){events.push(value);}};
 component.methods.change.call(instance,{detail:{value:['publication']}});
 assert.equal(events[0].consent.accepted,true);
 component.methods.reset.call(instance);
 assert.equal(instance.data.checked,false);assert.equal(events.at(-1).consent,null);
 let reloaded=false;
 const page={data:{title:'保留原始表单',publicationConsent:acceptedConsent()},setData(value){Object.assign(this.data,value);},selectComponent(){return {load(){reloaded=true;}};}};
 require('../../miniprogram/utils/publication-consent').recover(page,{code:'PUBLICATION_CONSENT_REQUIRED'});
 assert.equal(page.data.publicationConsent,null);assert.equal(page.data.title,'保留原始表单');assert.equal(reloaded,true);
});

test('PostgreSQL publication consent, content snapshots, independent reviews and later enforcement are atomic',{
 skip:!process.env.PG_TEST_DATABASE_URL&&'PG_TEST_DATABASE_URL not configured'
},async t=>{
 const dsn=process.env.PG_TEST_DATABASE_URL;
 require('../src/test-database-guard').assertIsolatedDatabase(dsn);
 const {Pool}=require('pg');const control=new Pool({connectionString:dsn});
 const schema='publication_consent_'+crypto.randomBytes(6).toString('hex');
 let pool,repo,server;
 try{
  await control.query('CREATE SCHEMA "'+schema+'"');const options='-c search_path='+schema;
  pool=new Pool({connectionString:dsn,options});await require('../src/schema-migrations').applyMigrations(pool);
  repo=require('../src/pg-repository').createPgRepository(dsn,{options});await repo.seedRegions(['中心街道']);
  server=require('../src/server').createApp({repo,areas:['中心街道'],allowDevLogin:true,adminPassword:'publication-isolated-operator',verificationAdminPassword:'publication-isolated-verifier'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  async function request(route,method='GET',body,auth={}){
   const response=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
   return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const owner=(await request('/api/v1/dev/login','POST',{devUser:'confirmation-owner'})).data;
  const other=(await request('/api/v1/dev/login','POST',{devUser:'confirmation-reader'})).data;
  const login=async(role,password)=>{const r=await request('/admin/api/login','POST',{role,password});return {cookie:r.cookie,csrf:r.data.csrf};};
  const operator=await login('operator','publication-isolated-operator');
  const verifier=await login('verifier','publication-isolated-verifier');
  const image=await repo.uploadContentImage(owner.userId,await require('sharp')({create:{width:24,height:24,channels:3,background:'#eadde3'}}).png().toBuffer());
  const value={...residentFields('used',[image.id]),clientKey:'publication_consent_fixture_001',type:'used',title:'隔离验收二手物品',detail:'隔离回归使用的发布内容，不是真实物品或实际供给。',price:'80',district:'中心街道'};
  let publication;
  await t.test('missing, unchecked and stale confirmation cannot insert content or fabricate a record',async()=>{
   for(const publicationConsent of [undefined,{...acceptedConsent(),accepted:false},{...acceptedConsent(),version:'old'}]){
    const result=await request('/api/v1/publications','POST',{...value,publicationConsent},owner);
    assert.equal(result.status,400);assert.equal(result.data.error,'PUBLICATION_CONSENT_REQUIRED');
   }
   assert.equal((await pool.query('SELECT count(*)::int n FROM publications')).rows[0].n,0);
   assert.equal((await pool.query('SELECT count(*)::int n FROM publication_confirmations')).rows[0].n,0);
  });
  await t.test('concurrent retries commit one content record and one immutable server-timed confirmation',async()=>{
   const races=await Promise.all([1,2,3].map(()=>request('/api/v1/publications','POST',value,owner)));
   assert.ok(races.every(r=>r.status===201),JSON.stringify(races));publication=races[0].data.publication;
   assert.ok(races.every(r=>r.data.publication.id===publication.id));
   const records=await repo.publicationRecords(publication.id);assert.equal(records.confirmations.length,1);
   const confirmation=records.confirmations[0];assert.equal(confirmation.userId,owner.userId);assert.equal(confirmation.publicationId,publication.id);
   assert.equal(confirmation.noticeVersion,notice.document().version);assert.equal(confirmation.noticeContent,notice.document().content);
   assert.equal(confirmation.content.title,value.title);assert.equal(confirmation.content.media[0].id,image.id);assert.ok(confirmation.content.media[0].hash);
   assert.ok(Date.parse(confirmation.confirmedAt));assert.equal(confirmation.contentHash,require('../src/publication-records').hash(confirmation.content));
   await assert.rejects(pool.query("UPDATE publication_confirmations SET notice_version='forged' WHERE publication_id=$1",[publication.id]));
   assert.equal((await request('/api/v1/publications','POST',{...value,title:'另一次不同内容不能复用编号'},owner)).status,409);
  });
  await t.test('confirmation never grants automatic approval and the category checklist remains mandatory',async()=>{
   assert.equal((await pool.query('SELECT status FROM publications WHERE id=$1',[publication.id])).rows[0].status,'pending');
   const payload={target:'publication',id:publication.id,status:'published',expectedRevision:1,textReviewed:true,imagesReviewed:true};
   assert.equal((await request('/admin/api/review','POST',payload,operator)).data.error,'CATEGORY_REVIEW_REQUIRED');
   assert.equal((await request('/admin/api/review','POST',{...payload,...completedSectorChecks()},operator)).status,200);
  });
  await t.test('editing requires a fresh confirmation, preserves the prior snapshot and prevents stale overwrites',async()=>{
   const replacement=await repo.uploadContentImage(owner.userId,await require('sharp')({create:{width:24,height:24,channels:3,background:'#dfc0cf'}}).png().toBuffer());
   const next={...value,imageIds:[replacement.id],title:'隔离验收已修改物品',expectedRevision:1};
   assert.equal((await request('/api/v1/me/publications/'+publication.id,'PUT',{...next,publicationConsent:null},owner)).status,400);
   assert.equal((await request('/api/v1/me/publications/'+publication.id,'PUT',next,owner)).status,200);
   assert.equal((await request('/api/v1/me/publications/'+publication.id,'PUT',next,owner)).status,409);
   const records=await repo.publicationRecords(publication.id);assert.equal(records.confirmations.length,2);
   assert.equal(records.confirmations[0].content.title,value.title);assert.equal(records.confirmations[1].content.title,next.title);
   assert.equal(records.item.status,'pending');assert.ok(records.history.some(row=>row.previousStatus==='published'&&row.status==='pending'));
   assert.equal(await repo.deleteContentImage(owner.userId,image.id),false);
  });
  await t.test('record reads enforce admin roles and connect later report, moderation and account actions',async()=>{
   const route='/admin/api/publication-records/'+publication.id;
   assert.equal((await request(route)).status,401);assert.equal((await request(route,'GET',undefined,other)).status,401);
   assert.equal((await request(route,'GET',undefined,verifier)).status,403);
   await repo.reviewPublication(publication.id,'published','隔离人工复审完成',2);
   const report=await repo.createReport(other.userId,{targetType:'publication',targetId:publication.id,reason:'false_info',description:'隔离验收后续违规处理关联记录'});
   await repo.reportDecision(report.id,'removed','隔离核查后下架该条信息');
   const result=await request(route,'GET',undefined,operator);assert.equal(result.status,200);
   assert.equal(result.data.confirmations.length,2);assert.ok(result.data.reports.some(row=>row.id===report.id&&row.status==='removed'));
   assert.ok(result.data.history.some(row=>row.status==='closed'));assert.ok(result.data.audit.some(row=>row.action==='report_removed'));
  });
  await t.test('receipt storage failure rolls back the new publication and its status history',async()=>{
   await pool.query("CREATE FUNCTION reject_fixture_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.content_snapshot->>'title'='隔离确认落库失败' THEN RAISE EXCEPTION 'fixture receipt failure'; END IF; RETURN NEW; END $$");
   await pool.query('CREATE TRIGGER reject_fixture_confirmation BEFORE INSERT ON publication_confirmations FOR EACH ROW EXECUTE FUNCTION reject_fixture_confirmation()');
   try{
    const result=await request('/api/v1/publications','POST',{...value,clientKey:'receipt_rollback_fixture_001',title:'隔离确认落库失败'},owner);assert.equal(result.status,500);
    assert.equal((await pool.query("SELECT count(*)::int n FROM publications WHERE title='隔离确认落库失败'")).rows[0].n,0);
   }finally{await pool.query('DROP TRIGGER reject_fixture_confirmation ON publication_confirmations');await pool.query('DROP FUNCTION reject_fixture_confirmation()');}
  });
  await t.test('historical content remains manageable without inventing prior user confirmation',async()=>{
   const row=(await pool.query("INSERT INTO publications(user_id,type,title,description,district,status) VALUES($1,'used','隔离历史发布记录','历史记录不补造用户须知确认','中心街道','rejected') RETURNING id",[owner.userId])).rows[0];
   const records=await repo.publicationRecords(row.id);assert.equal(records.legacy,true);assert.deepEqual(records.confirmations,[]);
  });
  await t.test('merchant services retain separate confirmations for creation, edits and resubmission',async()=>{
   const application=await repo.createMerchant(owner.userId,{name:'隔离确认验收商家',category:'家政维修',district:'中心街道'});
   await repo.submitMerchantEvidence(owner.userId,application.id,{registrationCode:'ISOLATED-PUBLICATION-001',licenseHolder:'隔离验收主体',evidenceReference:'仅用于隔离材料测试'});
   const merchant=await repo.approveMerchantApplication(application.id,'隔离人工材料核验夹具',true);
   const input={title:'隔离服务确认验收',description:'仅用于验证商家服务确认记录，不是真实服务供给。',price:'80',publicationConsent:acceptedConsent()};
   const route='/api/v1/merchants/'+merchant.id+'/services';
   assert.equal((await request(route,'POST',{...input,publicationConsent:null},owner)).status,400);
   const created=await request(route,'POST',input,owner);assert.equal(created.status,201);
   const id=created.data.service.id;
   assert.equal((await repo.publicationRecords(id)).confirmations.length,1);
   assert.equal((await request(route+'/'+id,'PUT',{...input,title:'隔离服务已修改内容'},owner)).status,200);
   await repo.reviewService(id,'published');
   await repo.changeMerchantServiceStatus(owner.userId,merchant.id,id,'pause');
   await assert.rejects(repo.changeMerchantServiceStatus(owner.userId,merchant.id,id,'resubmit'),{code:'PUBLICATION_CONSENT_REQUIRED'});
   assert.equal((await pool.query('SELECT status FROM service_catalog WHERE id=$1',[id])).rows[0].status,'draft');
   await repo.changeMerchantServiceStatus(owner.userId,merchant.id,id,'resubmit',acceptedConsent());
   const records=await repo.publicationRecords(id);assert.equal(records.confirmations.length,3);
   assert.equal(records.confirmations[0].content.title,input.title);assert.equal(records.confirmations[1].content.title,'隔离服务已修改内容');
   assert.ok(records.confirmations.every(record=>record.kind==='service'&&record.userId===owner.userId));
  });
  await t.test('recruitment, housing, medical, education and food each enforce separate credential and content checks',async()=>{
   const catalog=require('../../miniprogram/utils/classification-contract');
   const workflows=require('../../miniprogram/utils/industry-workflows');
   for(const categoryId of ['C02','C05','C15','C13','C01']){
    const project=catalog.projects.find(p=>p.categoryId===categoryId&&workflows.workflow(p.id)?.credential);const workflow=workflows.workflow(project.id);
    const credential=await repo.applyIndustryCredential(owner.userId,{projectId:project.id,subject:'隔离行业核验主体',evidenceReference:'FIXTURE:PUBLICATION-'+categoryId});
    const review={status:'verified',revision:credential.revision,response:'隔离材料已逐项核查项目范围',validUntil:new Date(Date.now()+86400000).toISOString(),manuallyVerified:true};
    await assert.rejects(repo.reviewIndustryCredential(credential.id,review,'verifier'),{code:'CATEGORY_REVIEW_REQUIRED'});
    await repo.reviewIndustryCredential(credential.id,{...review,...completedSectorChecks()},'verifier');
    const fields={};for(const field of workflow.fields)fields[field.key]=field.type==='confirm'?true:field.type==='select'?field.options[0]:field.type==='number'?'5000':field.type==='decimal'?'80':field.type==='url'?'https://example.org/isolated-public-source':field.type==='date'?'2026-11-01':'隔离字段说明，不是真实业务供给';
    const entry=await repo.saveIndustryEntry(owner.userId,null,{projectId:project.id,title:'隔离行业须知 '+project.name,detail:'隔离回归，按实际项目审核规则检查，不是真实业务内容。',cityCode:'310100',districtCode:'310101',district:'中心街道',fields,imageIds:[],clientKey:'sector_'+crypto.randomBytes(12).toString('hex'),action:'submit',publicationConsent:acceptedConsent()});
    const checks={status:'published',revision:entry.revision,response:'隔离业务内容经独立人工复核',textReviewed:true,imagesReviewed:true,sourceReviewed:true,scopeReviewed:true};
    await assert.rejects(repo.reviewIndustryEntry(entry.id,checks,'operator'),{code:'CATEGORY_REVIEW_REQUIRED'});
    await repo.reviewIndustryEntry(entry.id,{...checks,...completedSectorChecks()},'operator');
    const records=await repo.publicationRecords(entry.id);assert.equal(records.confirmations.length,1);assert.equal(records.confirmations[0].kind,'industry');assert.equal(records.reviewRule.code,workflow.reviewRule.code);
   }
  });
 }finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(repo)await repo.close();if(pool)await pool.end();
  await control.query('DROP SCHEMA "'+schema+'" CASCADE');await control.end();
 }
});
