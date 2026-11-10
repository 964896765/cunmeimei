'use strict';
const {residentFields}=require('./helpers/resident-fields');
const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {publicationExtras}=require('../src/product-repository');
test('product fields validate category-specific data and reject foreign/invalid fields',()=>{
 assert.deepEqual(publicationExtras({type:'used',attributes:{condition:'几乎全新'}}).attributes,{condition:'几乎全新'});
 for(const input of [{type:'used',attributes:{area:'60'}},{type:'housing',attributes:{area:'-1'}},{type:'used',imageIds:['fake']},{type:'housing',attributes:{intent:'出售'}}])assert.throws(()=>publicationExtras(input));
});
test('real PostgreSQL product capabilities: media, saved items, notifications, contact privacy and moderation',{skip:!process.env.PG_TEST_DATABASE_URL&&'PG_TEST_DATABASE_URL not configured'},async t=>{
 const dsn=process.env.PG_TEST_DATABASE_URL;require('../src/test-database-guard').assertIsolatedDatabase(dsn);
 const {Pool}=require('pg'),sharp=require('sharp');const {createPgRepository}=require('../src/pg-repository');const {createApp}=require('../src/server');
 const schema='product_it_'+crypto.randomBytes(6).toString('hex');const control=new Pool({connectionString:dsn});let pool,repo,app;
 try{
  await control.query(`CREATE SCHEMA "${schema}"`);const options='-c search_path='+schema;pool=new Pool({connectionString:dsn,options});
  await require('../src/schema-migrations').applyMigrations(pool);repo=createPgRepository(dsn,{options});await repo.seedRegions(['中心街道']);
  app=createApp({repo,areas:['中心街道'],allowDevLogin:true,superAdminPassword:'local-product-test-password'});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.address().port;
  async function req(route,method='GET',body,auth={}){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  const login=async name=>(await req('/api/v1/dev/login','POST',{devUser:name})).data;
  const owner=await login('product-owner'),buyer=await login('product-buyer'),other=await login('product-other');
  const adminLogin=await req('/admin/api/login','POST',{role:'superadmin',password:'local-product-test-password'});const admin={cookie:adminLogin.cookie,csrf:adminLogin.data.csrf};
  const bytes=await sharp({create:{width:120,height:90,channels:3,background:'#176b5b'}}).png().toBuffer();let image,publication,community,contact,comment;
  await t.test('actual image decode, thumbnail and anonymous access denial',async()=>{
   const response=await fetch(base+'/api/v1/media',{method:'POST',headers:{Authorization:'Bearer '+owner.token,'Content-Type':'image/png'},body:bytes});assert.equal(response.status,201);image=(await response.json()).image;assert.ok(image.id);
   assert.equal((await fetch(base+image.url)).status,404);assert.equal((await fetch(base+image.url,{headers:{Authorization:'Bearer '+other.token}})).status,404);
   const privateImage=await fetch(base+image.url,{headers:{Authorization:'Bearer '+owner.token}});assert.equal(privateImage.status,200);assert.equal(privateImage.headers.get('content-type'),'image/jpeg');assert.ok((await privateImage.arrayBuffer()).byteLength>0);
  });
  await t.test('spoofed and oversized uploads rejected',async()=>{
   assert.equal((await fetch(base+'/api/v1/media',{method:'POST',headers:{Authorization:'Bearer '+owner.token,'Content-Type':'image/jpeg'},body:bytes})).status,415);
   assert.equal((await fetch(base+'/api/v1/media',{method:'POST',headers:{Authorization:'Bearer '+owner.token,'Content-Type':'image/png'},body:Buffer.alloc(2097153)})).status,413);
  });
  const payload={...residentFields(),type:'used',title:'测试专用闲置书桌',detail:'真实数据库功能验证专用内容，不是实际交易商品。',district:'中心街道',price:'80',attributes:residentFields().attributes,imageIds:[image.id]};
  await t.test('foreign image ownership cannot be used in publication',async()=>{assert.equal((await req('/api/v1/publications','POST',payload,buyer)).status,400);});
  await t.test('pending publication and its image remain private',async()=>{
   const r=await req('/api/v1/publications','POST',payload,owner);assert.equal(r.status,201);publication=r.data.publication;
   assert.equal((await req('/api/v1/items/'+publication.id)).status,404);assert.equal((await fetch(base+image.url)).status,404);
   assert.equal((await fetch(base+'/admin/api/media/'+image.id,{headers:{Cookie:admin.cookie}})).status,200);
  });
  await t.test('review atomically sends notification and makes real image visible',async()=>{
   assert.equal((await req('/admin/api/review','POST',{target:'publication',id:publication.id,status:'published'},admin)).status,200);
   const item=(await req('/api/v1/items/'+publication.id)).data.item;assert.equal(item.attributes.condition,'正常使用');assert.equal(item.images[0],image.url);assert.equal(item.category,'二手闲置');assert.equal((await fetch(base+image.url+'?size=thumb')).status,200);
   assert.ok((await req('/api/v1/feed?type=used&images=with')).data.items.some(x=>x.id===publication.id),'published photos participate in picture-filtered search');
   assert.ok((await req('/api/v1/me/notifications','GET',undefined,owner)).data.items.some(x=>x.targetId===publication.id));
  });
  await t.test('saved state idempotent, private and survives another repository',async()=>{
   for(let i=0;i<2;i++)assert.equal((await req('/api/v1/items/'+publication.id+'/saved','PUT',{},buyer)).status,200);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM saved_items')).rows[0].n,1);
   assert.equal((await req('/api/v1/me/saved','GET',undefined,other)).data.items.length,0);
   const fresh=createPgRepository(dsn,{options});try{assert.equal(await fresh.isSaved(buyer.userId,publication.id),true);}finally{await fresh.close();}
  });
  await t.test('contact request repeat uses one pending row; owner and outsider protections',async()=>{
   const r=await req('/api/v1/items/'+publication.id+'/contact','POST',{message:'希望了解物品是否可以自取'},buyer);assert.equal(r.status,201);contact=r.data.request;
   assert.equal((await req('/api/v1/items/'+publication.id+'/contact','POST',{message:'再次联系同一条信息'},buyer)).data.request.id,contact.id);
   assert.equal((await req('/api/v1/me/contacts','GET',undefined,other)).data.items.length,0);
   assert.equal((await req('/api/v1/me/contacts/'+contact.id,'POST',{action:'accept',response:'非法冒充回复'},other)).status,409);
  });
  await t.test('consented reply visible only to participants',async()=>{
   assert.equal((await req('/api/v1/me/contacts/'+contact.id,'POST',{action:'accept',response:'我同意联系，请在周末到公共地点查看'},owner)).status,200);
   assert.equal((await req('/api/v1/me/contacts','GET',undefined,buyer)).data.items[0].status,'accepted');assert.equal((await req('/api/v1/me/contacts','GET',undefined,other)).data.items.length,0);
  });
  await t.test('contact blocking stops new requests without leaking another inbox',async()=>{
   assert.equal((await req('/api/v1/me/contacts/'+contact.id+'/block','POST',{},other)).status,404);
   assert.equal((await req('/api/v1/me/contacts/'+contact.id+'/block','POST',{},owner)).status,200);
   assert.equal((await req('/api/v1/items/'+publication.id+'/contact','POST',{message:'屏蔽后尝试再次联系'},buyer)).status,409);
  });
  await t.test('publication retry key creates one row and rejects changed payload',async()=>{
   const body={...payload,title:'重试幂等验收信息',clientKey:'product_retry_key_0001'};
   const first=await req('/api/v1/publications','POST',body,owner),again=await req('/api/v1/publications','POST',body,owner);assert.equal(first.status,201);assert.equal(first.data.publication.id,again.data.publication.id);
   assert.equal((await req('/api/v1/publications','POST',{...body,title:'不能覆盖原来提交内容'},owner)).status,409);
  });
  await t.test('development data hidden normally and explicitly available only in development mode',async()=>{
   const response=await fetch(base+'/api/v1/publications',{method:'POST',headers:{Authorization:'Bearer '+owner.token,'Content-Type':'application/json','X-Development-Test-Data':'true'},body:JSON.stringify({...payload,title:'开发数据隔离验收'})});assert.equal(response.status,201);const id=(await response.json()).publication.id;
   await req('/admin/api/review','POST',{target:'publication',id,status:'published'},admin);
   assert.equal((await req('/api/v1/items/'+id)).status,404);assert.equal((await fetch(base+'/api/v1/items/'+id,{headers:{'X-Development-Test-Data':'true'}})).status,200);
   assert.equal((await req('/api/v1/feed')).data.items.some(x=>x.id===id),false);
  });
  await t.test('profile updates only current user',async()=>{
   assert.equal((await req('/api/v1/me/profile','PUT',{displayName:'友善的街坊'},owner)).status,200);assert.equal((await req('/api/v1/me/profile','GET',undefined,owner)).data.displayName,'友善的街坊');assert.equal((await req('/api/v1/me/profile','GET',undefined,buyer)).data.displayName,null);
  });
  await t.test('profile fields persist independently and do not expose another identity',async()=>{
   assert.equal((await req('/api/v1/me/profile','PUT',{bio:'喜欢发现身边的好生活',cityCode:'310100'},owner)).status,200);
   const profile=(await req('/api/v1/me/profile','GET',undefined,owner)).data;
   assert.equal(profile.displayName,'友善的街坊');assert.equal(profile.bio,'喜欢发现身边的好生活');assert.equal(profile.cityCode,'310100');assert.deepEqual(profile.loginProviders,['dev_local']);assert.equal(profile.provider_id,undefined);
   for(const body of [{cityCode:'999999'},{cityCode:'310101'},{bio:'超'.repeat(121)},{userId:buyer.userId},{displayName:'x',bio:'不得部分保存'}])assert.equal((await req('/api/v1/me/profile','PUT',body,owner)).status,400);
   assert.equal((await req('/api/v1/me/profile','GET',undefined,owner)).data.bio,profile.bio);
   assert.equal((await req('/api/v1/me/profile','GET',undefined,buyer)).data.bio,'');
   assert.equal((await req('/api/v1/me/profile')).status,401);
   const fresh=createPgRepository(dsn,{options});try{assert.equal((await fresh.profile(owner.userId)).cityCode,'310100');}finally{await fresh.close();}
  });
  await t.test('avatar ownership, private download and referenced image deletion protections',async()=>{
   const response=await fetch(base+'/api/v1/media',{method:'POST',headers:{Authorization:'Bearer '+owner.token,'Content-Type':'image/png'},body:bytes}),avatar=(await response.json()).image;
   assert.equal((await req('/api/v1/me/profile','PUT',{avatarImageId:avatar.id},buyer)).status,400);
   assert.equal((await req('/api/v1/me/profile','PUT',{avatarImageId:image.id},owner)).status,400);
   assert.equal((await req('/api/v1/me/profile','PUT',{avatarImageId:avatar.id},owner)).status,200);
   assert.equal((await req('/api/v1/me/profile','GET',undefined,owner)).data.avatarImageId,avatar.id);
   assert.equal((await req('/api/v1/me/profile','GET',undefined,buyer)).data.avatarImageId,null);
   assert.equal((await fetch(base+avatar.url)).status,404);assert.equal((await fetch(base+avatar.url,{headers:{Authorization:'Bearer '+buyer.token}})).status,404);
   assert.equal((await fetch(base+avatar.url,{headers:{Authorization:'Bearer '+owner.token}})).status,200);
   assert.equal((await req('/api/v1/me/media/'+avatar.id,'DELETE',{},owner)).status,409);
   assert.equal((await req('/api/v1/me/profile','PUT',{avatarImageId:null,bio:'',cityCode:''},owner)).status,200);
   assert.equal((await req('/api/v1/me/profile','GET',undefined,owner)).data.bio,'');
   assert.equal((await req('/api/v1/me/media/'+avatar.id,'DELETE',{},owner)).status,200);
  });
  await t.test('blacklist reads and removal are scoped to the authenticated owner',async()=>{
   const blocks=(await req('/api/v1/me/blocks','GET',undefined,owner)).data.items;assert.ok(blocks.some(x=>x.id===buyer.userId));
   assert.equal((await req('/api/v1/me/blocks','GET',undefined,other)).data.items.length,0);
   await req('/api/v1/me/blocks/'+buyer.userId,'DELETE',{},other);
   assert.ok((await req('/api/v1/me/blocks','GET',undefined,owner)).data.items.some(x=>x.id===buyer.userId));
   await req('/api/v1/me/blocks/'+buyer.userId,'DELETE',{},owner);
   assert.equal((await req('/api/v1/me/blocks','GET',undefined,owner)).data.items.length,0);
  });
  await t.test('read marker cannot change another user notification',async()=>{
   const notice=(await req('/api/v1/me/notifications','GET',undefined,owner)).data.items[0];await req('/api/v1/me/notifications/read','POST',{id:notice.id},other);
   assert.equal((await pool.query('SELECT read_at FROM user_notifications WHERE id=$1',[notice.id])).rows[0].read_at,null);
   await req('/api/v1/me/notifications/read','POST',{id:notice.id},owner);assert.ok((await pool.query('SELECT read_at FROM user_notifications WHERE id=$1',[notice.id])).rows[0].read_at);
  });
  await t.test('community likes unique, comments hidden until authorized review',async()=>{
   community=(await req('/api/v1/publications','POST',{...payload,type:'community',title:'测试专用邻里交流',attributes:{...residentFields('community').attributes,topic:'邻里互助'},imageIds:[]},owner)).data.publication;
   await req('/admin/api/review','POST',{target:'publication',id:community.id,status:'published'},admin);
   for(let i=0;i<2;i++)await req('/api/v1/items/'+community.id+'/like','PUT',{},buyer);
   comment=(await req('/api/v1/items/'+community.id+'/comments','POST',{body:'这是一条友善的测试留言'},buyer)).data.comment;
   let state=(await req('/api/v1/items/'+community.id+'/interaction')).data;assert.equal(state.likes,1);assert.equal(state.comments.length,0);
   assert.equal((await req('/admin/api/comments/review','POST',{id:comment.id,status:'published'},{cookie:admin.cookie})).status,403);
   assert.equal((await req('/admin/api/comments/review','POST',{id:comment.id,status:'published'},admin)).status,200);
   state=(await req('/api/v1/items/'+community.id+'/interaction')).data;assert.equal(state.comments.length,1);
   assert.equal((await req('/api/v1/me/comments/'+comment.id,'DELETE',{},other)).status,404);
   assert.equal((await req('/api/v1/me/comments/'+comment.id,'DELETE',{},buyer)).status,200);
  });
  await t.test('replies are moderated, retry-safe and restricted to visible parent comments',async()=>{
   const parent=(await req('/api/v1/items/'+community.id+'/comments','POST',{body:'用于回复验证的原留言'},owner)).data.comment;
   await req('/admin/api/comments/review','POST',{id:parent.id,status:'published'},admin);
   const value={body:'友善回复这条街坊留言',parentId:parent.id,clientKey:'reply_request_key_0001'};
   const first=await req('/api/v1/items/'+community.id+'/comments','POST',value,buyer);assert.equal(first.status,201);
   const second=await req('/api/v1/items/'+community.id+'/comments','POST',value,buyer);assert.equal(first.data.comment.id,second.data.comment.id);
   await req('/admin/api/comments/review','POST',{id:first.data.comment.id,status:'published'},admin);
   const state=(await req('/api/v1/items/'+community.id+'/interaction','GET',undefined,buyer)).data;
   const reply=state.comments.find(x=>x.id===first.data.comment.id);assert.equal(reply.parentId,parent.id);assert.equal(reply.mine,true);
   await req('/api/v1/me/comments/'+parent.id,'DELETE',{},owner);
   assert.equal((await req('/api/v1/items/'+community.id+'/comments','POST',{body:'不允许回复已经删除的留言',parentId:parent.id},buyer)).status,409);
  });
  await t.test('service editing rechecks merchant role and requires a new platform review',async()=>{
   const application=(await req('/api/v1/merchant-applications','POST',{name:'数据库验收维修门店',category:'维修',district:'中心街道'},owner)).data.application;
   await req('/api/v1/merchant-applications/'+application.id+'/evidence','POST',{registrationCode:'LOCAL-PRODUCT-TEST-001',licenseHolder:'数据库验收维修门店',evidenceReference:'development-only-evidence'},owner);
   const verified=await req('/admin/api/approve-merchant','POST',{id:application.id,manuallyVerified:true,note:'本地数据库模拟人工核验通过'},admin);assert.equal(verified.status,200);const mid=verified.data.merchant.id;
   const value={title:'数据库验收维修服务',description:'本条服务仅用于开发环境数据库权限验收。',price:'50'};
   const service=(await req('/api/v1/merchants/'+mid+'/services','POST',value,owner)).data.service;
   await req('/admin/api/review-service','POST',{id:service.id,status:'published'},admin);
   assert.equal((await req('/api/v1/merchants/'+mid+'/services/'+service.id,'PUT',value,buyer)).status,403);
   assert.equal((await req('/api/v1/merchants/'+mid+'/services/'+service.id,'PUT',{...value,price:'60'},owner)).status,200);
   assert.equal((await req('/api/v1/items/'+service.id)).status,404);
   const metrics=(await req('/api/v1/me/merchants','GET',undefined,owner)).data.items[0];assert.equal(metrics.servicesCount,1);assert.equal(metrics.pendingBookings,0);
  });
  await t.test('service galleries enforce upload ownership, review visibility and deletion protection',async()=>{
   const mid=(await pool.query('SELECT merchant_id FROM merchant_members WHERE user_id=$1 AND role=$2',[owner.userId,'owner'])).rows[0].merchant_id;
   const upload=await fetch(base+'/api/v1/media',{method:'POST',headers:{Authorization:'Bearer '+owner.token,'Content-Type':'image/png'},body:bytes});const photo=(await upload.json()).image;
   const value={title:'带图服务数据库验收',description:'真实数据库图片审核和权限校验专用服务。',price:'80',imageIds:[photo.id]};
   assert.equal((await req('/api/v1/merchants/'+mid+'/services','POST',{...value,imageIds:[photo.id,photo.id]},owner)).status,400);
   assert.equal((await req('/api/v1/merchants/'+mid+'/services','POST',{...value,imageIds:Array(7).fill(photo.id)},owner)).status,400);
   await pool.query("INSERT INTO merchant_members(merchant_id,user_id,role) VALUES($1,$2,'manager')",[mid,buyer.userId]);
   assert.equal((await req('/api/v1/merchants/'+mid+'/services','POST',value,buyer)).status,400);
   const created=await req('/api/v1/merchants/'+mid+'/services','POST',value,owner);assert.equal(created.status,201);const sid=created.data.service.id;
   assert.deepEqual(created.data.service.imageIds,[photo.id]);
   assert.equal((await fetch(base+photo.url)).status,404);
   assert.equal((await fetch(base+photo.url,{headers:{Authorization:'Bearer '+buyer.token}})).status,200);
   assert.equal((await fetch(base+photo.url,{headers:{Authorization:'Bearer '+other.token}})).status,404);
   const queue=(await req('/admin/api/queue','GET',undefined,admin)).data;assert.deepEqual(queue.services.find(x=>x.id===sid).imageIds,[photo.id]);
   assert.equal((await req('/api/v1/me/media/'+photo.id,'DELETE',{},owner)).status,409);
   assert.equal((await req('/admin/api/review-service','POST',{id:sid,status:'published'},admin)).status,200);
   assert.equal((await fetch(base+photo.url+'?size=thumb')).status,200);
   assert.deepEqual((await req('/api/v1/items/'+sid)).data.item.images,[photo.url]);
   assert.deepEqual((await req('/api/v1/feed?type=service')).data.items.find(x=>x.id===sid).imageIds,[photo.id]);
   // A manager can retain this gallery, but cannot attach another owner's unrelated upload.
   assert.equal((await req('/api/v1/merchants/'+mid+'/services/'+sid,'PUT',{...value,imageIds:[image.id]},buyer)).status,400);
   assert.equal((await req('/api/v1/merchants/'+mid+'/services/'+sid,'PUT',value,buyer)).status,200);
   assert.equal((await fetch(base+photo.url)).status,404);
   await pool.query("UPDATE merchant_members SET status='removed' WHERE merchant_id=$1 AND user_id=$2",[mid,buyer.userId]);
   assert.equal((await fetch(base+photo.url,{headers:{Authorization:'Bearer '+buyer.token}})).status,404);
   assert.equal((await req('/api/v1/merchants/'+mid+'/services/'+sid,'PUT',value,buyer)).status,403);
   await req('/admin/api/review-service','POST',{id:sid,status:'published'},admin);
   await req('/api/v1/merchants/'+mid+'/services/'+sid+'/action','POST',{action:'pause'},owner);
   assert.equal((await fetch(base+photo.url)).status,404);assert.equal((await req('/api/v1/items/'+sid)).status,404);
   await req('/api/v1/merchants/'+mid+'/services/'+sid+'/action','POST',{action:'resubmit'},owner);
   await req('/admin/api/review-service','POST',{id:sid,status:'published'},admin);
   await pool.query("UPDATE verified_merchants SET status='suspended' WHERE id=$1",[mid]);
   assert.equal((await fetch(base+photo.url)).status,404);assert.equal((await req('/api/v1/items/'+sid)).status,404);
   assert.ok(!(await req('/api/v1/feed?type=service')).data.items.some(x=>x.id===sid));
   await pool.query("UPDATE verified_merchants SET status='active' WHERE id=$1",[mid]);
   await req('/api/v1/merchants/'+mid+'/services/'+sid,'PUT',{...value,imageIds:[]},owner);
   assert.equal((await req('/api/v1/me/media/'+photo.id,'DELETE',{},owner)).status,200);
  });
  await t.test('editing preserves existing photos, attributes and re-hides public image',async()=>{
   assert.equal((await req('/api/v1/me/publications/'+publication.id,'PUT',{...payload,expectedRevision:1,title:'测试专用已修改书桌'},owner)).status,200);
   assert.equal((await fetch(base+image.url)).status,404);
   const row=(await pool.query('SELECT attributes,image_ids FROM publications WHERE id=$1',[publication.id])).rows[0];assert.equal(row.image_ids[0],image.id);assert.equal(row.attributes.condition,'正常使用');
  });
  await t.test('expired content and region-disabled content not exposed; safe removal of unused image only',async()=>{
   await req('/admin/api/review','POST',{target:'publication',id:publication.id,status:'published'},admin);
   await pool.query("UPDATE publications SET expires_at=now()-interval '1 second' WHERE id=$1",[publication.id]);
   assert.equal((await req('/api/v1/items/'+publication.id)).status,404);assert.equal((await fetch(base+image.url)).status,404);
   assert.equal((await req('/api/v1/me/media/'+image.id,'DELETE',{},owner)).status,409);
  });
  await t.test('account drafts are private and reject malformed content and foreign images',async()=>{
   assert.equal((await req('/api/v1/me/draft')).status,401);
   assert.deepEqual((await req('/api/v1/me/draft','GET',undefined,buyer)).data,{revision:0,payload:null,updatedAt:null});
   const payload={kind:'housing',title:'',detail:'',district:'',price:'',attributes:{area:'1.'},imageIds:[image.id],clientKey:'cloud_draft_test_key_001'};
   assert.equal((await req('/api/v1/me/draft','PUT',{expectedRevision:0,payload},buyer)).status,400);
   assert.equal((await req('/api/v1/me/draft','PUT',{expectedRevision:0,payload:{...payload,kind:'job'}},owner)).status,400);
   assert.equal((await req('/api/v1/me/draft','PUT',{expectedRevision:-1,payload},owner)).status,400);
   const saved=await req('/api/v1/me/draft','PUT',{expectedRevision:0,payload},owner);assert.equal(saved.status,200);assert.equal(saved.data.revision,1);
   assert.equal((await req('/api/v1/me/draft','GET',undefined,buyer)).data.payload,null);
   assert.equal((await fetch(base+image.url)).status,404);
  });
  await t.test('concurrent draft saves use compare-and-swap and survive a new repository',async()=>{
   const current=(await req('/api/v1/me/draft','GET',undefined,owner)).data;
   const saves=await Promise.all(['设备一草稿','设备二草稿'].map(title=>req('/api/v1/me/draft','PUT',{expectedRevision:current.revision,payload:{...current.payload,title}},owner)));
   assert.deepEqual(saves.map(x=>x.status).sort(),[200,409]);
   const fresh=createPgRepository(dsn,{options});try{const row=await fresh.accountDraft(owner.userId);assert.equal(row.revision,2);assert.ok(['设备一草稿','设备二草稿'].includes(row.payload.title));}finally{await fresh.close();}
   const deleted=await req('/api/v1/me/draft','DELETE',{expectedRevision:2},owner);assert.equal(deleted.status,200);assert.equal(deleted.data.revision,3);assert.equal(deleted.data.payload,null);
   assert.equal((await req('/api/v1/me/draft','PUT',{expectedRevision:0,payload:current.payload},owner)).status,409);
  });
  await t.test('draft images cannot be deleted; submission clears only the matching draft atomically',async()=>{
   const bytes2=await sharp({create:{width:20,height:20,channels:3,background:'#176b5b'}}).png().toBuffer();
   const upload=await fetch(base+'/api/v1/media',{method:'POST',headers:{Authorization:'Bearer '+owner.token,'Content-Type':'image/png'},body:bytes2});const photo=(await upload.json()).image;
   const draft={kind:'used',title:'跨设备草稿提交测试',detail:'真实数据库跨设备草稿提交验收专用内容。',district:'中心街道',price:'20',attributes:residentFields().attributes,imageIds:[photo.id],clientKey:'cloud_draft_submit_key_001'};
   assert.equal((await req('/api/v1/me/draft','PUT',{expectedRevision:3,payload:draft},owner)).status,200);
   assert.equal((await req('/api/v1/me/media/'+photo.id,'DELETE',{},owner)).status,409);
   const unrelated=await req('/api/v1/publications','POST',{...draft,type:draft.kind,clientKey:'unrelated_publish_key_001'},owner);assert.equal(unrelated.status,201);
   assert.equal((await req('/api/v1/me/draft','GET',undefined,owner)).data.revision,4);
   assert.equal((await req('/api/v1/publications','POST',{...draft,type:draft.kind},owner)).status,201);
   const row=(await req('/api/v1/me/draft','GET',undefined,owner)).data;assert.equal(row.payload,null);assert.equal(row.revision,5);
   assert.equal((await req('/api/v1/me/draft','PUT',{expectedRevision:5,payload:draft},owner)).status,409);
  });
  await t.test('expiry reminders persist, deduplicate concurrent workers and follow a new expiry cycle',async()=>{
   await pool.query("UPDATE publications SET status='published',expires_at=now()+interval '2 days' WHERE id=$1",[publication.id]);
   const before=(await pool.query('SELECT count(*)::int n FROM user_notifications WHERE target_id=$1',[publication.id])).rows[0].n;
   await Promise.all([repo.sendExpiryReminders(),repo.sendExpiryReminders()]);
   assert.equal((await pool.query('SELECT count(*)::int n FROM user_notifications WHERE target_id=$1',[publication.id])).rows[0].n,before+1);
   assert.equal((await pool.query('SELECT stage FROM publication_expiry_reminders WHERE publication_id=$1',[publication.id])).rows[0].stage,'expiring');
   const fresh=createPgRepository(dsn,{options});try{assert.equal(await fresh.sendExpiryReminders(),0);}finally{await fresh.close();}
   // Move the fixture into the expired window; each expiry timestamp is its own cycle.
   await pool.query("UPDATE publications SET expires_at=now()-interval '1 second' WHERE id=$1",[publication.id]);
   assert.equal(await repo.sendExpiryReminders(),1);assert.equal(await repo.sendExpiryReminders(),0);
   const notices=(await req('/api/v1/me/notifications','GET',undefined,owner)).data.items;
   assert.ok(notices.some(x=>x.targetId===publication.id&&x.title==='发布的信息已到期'&&x.targetKind==='publication-expiry'));
   assert.equal((await req('/api/v1/items/'+publication.id)).status,404);
   await pool.query("UPDATE publications SET expires_at=now()+interval '60 days' WHERE id=$1",[publication.id]);
   assert.equal(await repo.sendExpiryReminders(),0);
   await pool.query("UPDATE publications SET expires_at=now()+interval '1 day',status='pending' WHERE id=$1",[publication.id]);
   assert.equal(await repo.sendExpiryReminders(),0);
   await pool.query("UPDATE publications SET status='published' WHERE id=$1",[publication.id]);
   assert.equal(await repo.sendExpiryReminders(),1);
  });
  await t.test('private preferences validate, persist and prevent stale device overwrites',async()=>{
   assert.equal((await req('/api/v1/me/preferences')).status,401);
   const initial=(await req('/api/v1/me/preferences','GET',undefined,owner)).data;assert.equal(initial.theme,'prism');assert.equal(initial.revision,0);
   assert.equal((await req('/api/v1/me/preferences','PUT',{...initial,theme:'unknown'},owner)).status,400);
   assert.equal((await req('/api/v1/me/preferences','PUT',{...initial,allowContacts:'false'},owner)).status,400);
   const settings={...initial,theme:'clear',largeText:true,reduceMotion:true,notificationPreview:false,allowContacts:false};
   const saves=await Promise.all([req('/api/v1/me/preferences','PUT',settings,owner),req('/api/v1/me/preferences','PUT',settings,owner)]);
   assert.deepEqual(saves.map(x=>x.status).sort(),[200,409]);
   assert.equal((await req('/api/v1/me/preferences','GET',undefined,buyer)).data.notificationPreview,true);
   const fresh=createPgRepository(dsn,{options});try{const stored=await fresh.preferences(owner.userId);assert.equal(stored.theme,'clear');assert.equal(stored.allowContacts,false);}finally{await fresh.close();}
  });
  await t.test('server-side privacy hides notification text and blocks new contact requests',async()=>{
   const notices=(await req('/api/v1/me/notifications','GET',undefined,owner)).data;assert.ok(notices.items.length>0);
   assert.ok(notices.items.every(x=>x.title==='你有一条新的站内通知'&&x.body==='内容摘要已隐藏，请进入对应业务查看。'));
   const p=(await req('/api/v1/publications','POST',{...payload,title:'隐私开关联系验收内容'},owner)).data.publication;
   await req('/admin/api/review','POST',{target:'publication',id:p.id,status:'published'},admin);
   assert.equal((await req('/api/v1/items/'+p.id+'/contact','POST',{message:'验证关闭联系申请后服务端拦截'},other)).status,409);
   const prefs=(await req('/api/v1/me/preferences','GET',undefined,owner)).data;
   await req('/api/v1/me/preferences','PUT',{...prefs,allowContacts:true},owner);
   assert.equal((await req('/api/v1/items/'+p.id+'/contact','POST',{message:'验证恢复联系申请后可以提交'},other)).status,201);
  });
  await t.test('privacy requests enforce ownership, CSRF, audited access and real response states',async()=>{
   const value={kind:'deletion',reason:'请求核查并删除本地验收范围的数据，不涉及真实居民资料。'};
   const submissions=await Promise.all([req('/api/v1/me/privacy-requests','POST',value,owner),req('/api/v1/me/privacy-requests','POST',value,owner)]);
   assert.deepEqual(submissions.map(x=>x.status).sort(),[201,409]);const id=submissions.find(x=>x.status===201).data.request.id;
   assert.equal((await req('/api/v1/me/privacy-requests','GET',undefined,buyer)).data.items.length,0);
   assert.equal((await req('/api/v1/me/privacy-requests/'+id+'/cancel','POST',{},buyer)).status,409);
   assert.equal((await req('/admin/api/privacy-requests')).status,401);
   const queue=(await req('/admin/api/privacy-requests','GET',undefined,admin)).data.items;assert.equal(queue.find(x=>x.id===id).reason,undefined);
   const detail=await req('/admin/api/privacy-requests/'+id,'GET',undefined,admin);assert.equal(detail.data.item.reason,value.reason);
   assert.equal((await pool.query("SELECT count(*)::int n FROM admin_audit_events WHERE target_id=$1 AND action='privacy_request_read'",[id])).rows[0].n,1);
   assert.equal((await req('/admin/api/privacy-requests/'+id,'POST',{status:'reviewing',revision:1,response:'受理请求，正在核对数据范围'}, {cookie:admin.cookie,csrf:'invalid'})).status,403);
   assert.equal((await req('/admin/api/privacy-requests/'+id,'POST',{status:'reviewing',revision:1,response:'受理请求，正在核对数据范围'},admin)).status,200);
   assert.equal((await req('/admin/api/privacy-requests/'+id,'POST',{status:'responded',revision:1,response:'旧版本不可以覆盖当前处理结果'},admin)).status,409);
   const response='已记录并答复请求，当前尚未删除数据或注销账号，需要核对适用保留范围。';
   assert.equal((await req('/admin/api/privacy-requests/'+id,'POST',{status:'responded',revision:2,response},admin)).status,200);
   const own=(await req('/api/v1/me/privacy-requests','GET',undefined,owner)).data.items[0];assert.equal(own.status,'responded');assert.equal(own.response,response);
   assert.equal((await pool.query('SELECT status FROM app_users WHERE id=$1',[owner.userId])).rows[0].status,'active');
   const request=(await req('/api/v1/me/privacy-requests','POST',{kind:'access',reason:'申请访问本人开发验收账号数据范围。'},owner)).data.request;
   assert.equal((await req('/api/v1/me/privacy-requests/'+request.id+'/cancel','POST',{},owner)).status,200);
   assert.equal((await req('/admin/api/privacy-requests/'+request.id,'POST',{status:'reviewing',revision:1,response:'撤回的请求不应再被受理处理'},admin)).status,409);
  });
  await t.test('anonymous popular searches persist by city, aggregate concurrently, reject raw sensitive queries and expire',async()=>{
   assert.deepEqual((await req('/api/v1/search/popular?cityCode=441900')).data.items,[]);
   const record=()=>req('/api/v1/search/events','POST',{cityCode:'441900',q:'二手手机'});
   assert.equal((await record()).data.recorded,true);assert.equal((await record()).data.recorded,false);
   await Promise.all(Array.from({length:4},()=>repo.recordSearch('441900','二手手机')));
   assert.deepEqual((await req('/api/v1/search/popular?cityCode=441900')).data.items,[{term:'二手手机'}]);
   assert.deepEqual((await req('/api/v1/search/popular?cityCode=440100')).data.items,[]);
   for(const q of ['私人地址13800138000','殡葬咨询','孕检','not-a-public-term'])assert.equal((await req('/api/v1/search/events','POST',{cityCode:'441900',q})).data.recorded,false);
   assert.equal((await req('/api/v1/search/popular?cityCode=wrong')).status,400);
   const raw=(await pool.query("SELECT term,searches FROM search_popularity_daily WHERE city_code='441900'")).rows;assert.deepEqual(raw,[{term:'二手手机',searches:5}]);
   await pool.query("INSERT INTO search_popularity_daily(city_code,term,day,searches) VALUES('441900','保洁',CURRENT_DATE - 9,99)");
   assert.equal((await repo.popularSearches('441900')).some(x=>x.term==='保洁'),false);
  });
  await t.test('candidate category ID persists through draft/publication and filters before pagination without widening qualification',async()=>{
   const common={...residentFields('used',[image.id]),type:'used',title:'目录闭环分类验证',detail:'真实数据库验证分类归属与审核边界。',district:'中心街道',price:'40'};
   const make=async categoryId=>{const attributes={...residentFields(common.type).attributes,categoryId,categoryVersion:'2.0-audit'};const created=await req('/api/v1/publications','POST',{...common,attributes},owner);assert.equal(created.status,201);const id=created.data.publication.id;
    assert.equal((await req('/api/v1/feed?categoryId='+categoryId+'&q=目录闭环')).data.items.length,0);
    assert.equal((await req('/admin/api/review','POST',{target:'publication',id,status:'published'},admin)).status,200);return id;};
   const phone=await make('C04G01S01');await make('C04G01S02');
   const parent=await req('/api/v1/feed?categoryId=C04&q=目录闭环&pageSize=1');assert.equal(parent.status,200);assert.equal(parent.data.items.length,1);assert.equal(parent.data.pagination.hasMore,true);
   const leaf=await req('/api/v1/feed?categoryId=C04G01S01&q=目录闭环&pageSize=1');assert.equal(leaf.data.items.length,1);assert.equal(leaf.data.items[0].id,phone);assert.equal(leaf.data.pagination.hasMore,false);assert.equal(leaf.data.items[0].attributes.categoryId,'C04G01S01');
   assert.equal((await req('/api/v1/feed?categoryId=unknown')).status,400);
   for(const categoryId of ['C23G01S01','C15G01S01']) assert.equal((await req('/api/v1/publications','POST',{...common,attributes:{categoryId,categoryVersion:'2.0-audit'}},owner)).status,400);
   const current=(await req('/api/v1/me/draft','GET',undefined,owner)).data;
   const draft={kind:'used',title:'分类草稿',detail:'分类草稿恢复验证',price:'40',district:'中心街道',attributes:{categoryId:'C04G01S01',categoryVersion:'2.0-audit'},imageIds:[],clientKey:'classification_draft_123'};
   assert.equal((await req('/api/v1/me/draft','PUT',{expectedRevision:current.revision,payload:draft},owner)).status,200);
   assert.equal((await req('/api/v1/me/draft','GET',undefined,owner)).data.payload.attributes.categoryId,'C04G01S01');
  });
  await t.test('stale account submit cannot delete a newer revision; idempotent success removes only its observed draft',async()=>{
   const writer=await login('draft-submit-concurrency'),writerPhoto=await repo.uploadContentImage(writer.userId,bytes),draft={kind:'used',title:'旧草稿提交测试',detail:'验证过期表单不能删除另一设备更新的草稿。',price:'40',district:'中心街道',attributes:residentFields().attributes,imageIds:[writerPhoto.id],clientKey:'draft_submission_concurrency_123'};
   assert.equal((await req('/api/v1/me/draft','PUT',{expectedRevision:0,payload:draft},writer)).status,200);
   const newer={...draft,title:'另一设备更新的草稿'};assert.equal((await req('/api/v1/me/draft','PUT',{expectedRevision:1,payload:newer},writer)).status,200);
   const stale=await req('/api/v1/publications','POST',{...draft,type:'used',sourceDraftRevision:1},writer);assert.equal(stale.status,409);assert.equal(stale.data.error,'DRAFT_CONFLICT');assert.equal((await req('/api/v1/me/publications','GET',undefined,writer)).data.items.length,0);assert.equal((await req('/api/v1/me/draft','GET',undefined,writer)).data.payload.title,newer.title);
   const current={...newer,type:'used',title:'本次确认提交的修改',sourceDraftRevision:2};const submitted=await req('/api/v1/publications','POST',current,writer);assert.equal(submitted.status,201);assert.equal((await req('/api/v1/me/draft','GET',undefined,writer)).data.payload,null);const replay=await req('/api/v1/publications','POST',current,writer);assert.equal(replay.status,201);assert.equal(replay.data.publication.id,submitted.data.publication.id);
   const independent=await login('divergent-local-draft'),independentPhoto=await repo.uploadContentImage(independent.userId,bytes),copy={...draft,imageIds:[independentPhoto.id],clientKey:'divergent_local_cloud_key_123'};assert.equal((await req('/api/v1/me/draft','PUT',{expectedRevision:0,payload:{...copy,title:'账号不同内容'}},independent)).status,200);assert.equal((await req('/api/v1/publications','POST',{...copy,type:'used'},independent)).status,201);assert.equal((await req('/api/v1/me/draft','GET',undefined,independent)).data.payload.title,'账号不同内容');
  });
  await t.test('over-limit image dimensions roll back; normal upload works after decode failure',async()=>{
   const oversized=await sharp({create:{width:5000,height:4000,channels:3,background:'white'}}).png().toBuffer();
   await assert.rejects(repo.uploadContentImage(owner.userId,oversized),{code:'INVALID_IMAGE'});
   const uploaded=await repo.uploadContentImage(owner.userId,bytes);assert.ok(uploaded.id);
  });
  await t.test('daily quota is checked before decoding and rolls back without an extra image',async()=>{
   const uid=await repo.upsertIdentity('dev_local','image-quota-hardening');
   await pool.query("INSERT INTO content_images(user_id,data,thumbnail,width,height) SELECT $1,$2,$2,1,1 FROM generate_series(1,30)",[uid,bytes]);
   // Invalid bytes would fail decoding if the expensive step ran before quota.
   await assert.rejects(repo.uploadContentImage(uid,Buffer.from('invalid')),{code:'UPLOAD_LIMIT'});
   assert.equal((await pool.query('SELECT count(*)::int n FROM content_images WHERE user_id=$1',[uid])).rows[0].n,30);
  });
  await t.test('idle PostgreSQL disconnect is handled without logging details and the repository reconnects',async()=>{
   const name='idle_recovery_'+crypto.randomBytes(6).toString('hex'),fresh=createPgRepository(dsn,{options,application_name:name});
   const originalError=console.error,logs=[];
   try{
    await fresh.ping();console.error=(...args)=>logs.push(args);
    const result=await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND state='idle'",[name]);
    assert.equal(result.rowCount,1);
    for(let i=0;i<100&&!logs.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.deepEqual(logs,[['[database-idle-connection-error]']]);
    assert.equal(await fresh.ping(),true);
   }finally{console.error=originalError;await fresh.close();}
  });
 }finally{if(app){app.closeAllConnections();await new Promise(r=>app.close(r));}if(repo)await repo.close();if(pool)await pool.end();try{await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await control.end();}}
});
