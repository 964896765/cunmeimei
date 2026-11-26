'use strict';
const {ApiError,text,uuid}=require('./rules');
function publicationExtras(input,{validateForm=true}={}){
 const attributes=input.attributes===undefined?{}:input.attributes;
 if(!attributes||typeof attributes!=='object'||Array.isArray(attributes))throw new ApiError(400,'INVALID_ATTRIBUTES','补充信息格式无效');
 const allowed=require('../../miniprogram/utils/publication-schemas').keys(input.type);
 const clean={};
 if(input.sourceDraftRevision!==undefined&&(!Number.isSafeInteger(input.sourceDraftRevision)||input.sourceDraftRevision<1||!input.clientKey))throw new ApiError(400,'INVALID_DRAFT_REVISION','草稿版本无效');
 if(input.clientKey!==undefined&&!/^[a-zA-Z0-9_-]{16,64}$/.test(input.clientKey))throw new ApiError(400,'INVALID_REQUEST_KEY','提交标识无效');
 for(const [key,value] of Object.entries(attributes)){
  if(![...allowed,'categoryId','categoryVersion','cityCode','districtCode','templateCode','templateVersion'].includes(key))throw new ApiError(400,'INVALID_ATTRIBUTES','此分类不支持该字段');
  clean[key]=text(value,80);
 }
 if(clean.condition&&!['全新','几乎全新','正常使用','需维修'].includes(clean.condition))throw new ApiError(400,'INVALID_CONDITION','请选择有效成色');
 if(clean.area&&(!/^\d{1,5}(\.\d{1,2})?$/.test(clean.area)||Number(clean.area)<=0))throw new ApiError(400,'INVALID_AREA_SIZE','面积应为有效正数');
 if(clean.intent&&!['出租','求租'].includes(clean.intent))throw new ApiError(400,'INVALID_INTENT','请选择出租或求租');
 if(clean.expectedDate&&!require('./rules').validCalendarDate(clean.expectedDate))throw new ApiError(400,'INVALID_DATE','期望日期无效');
 if(!require('../../miniprogram/utils/publication-schemas').versionMatches(input.type,clean))throw new ApiError(400,'INVALID_TEMPLATE_VERSION','发布模板或版本不匹配');
 if((clean.categoryId||clean.categoryVersion)&&!require('../../miniprogram/utils/classification-contract').validateReference(clean.categoryId,clean.categoryVersion,input.type))throw new ApiError(400,'CATEGORY_NOT_READY','该分类的发布映射或目录版本尚未开放');
 require('./geography').cityReference(clean.cityCode,clean.districtCode);
 const images=input.imageIds===undefined?[]:input.imageIds;
 if(!Array.isArray(images)||images.length>6||images.some(x=>!uuid(x))||new Set(images).size!==images.length)throw new ApiError(400,'INVALID_IMAGES','最多添加六张不同图片');
 if(validateForm&&['2','3'].includes(clean.templateVersion)){const error=require('../../miniprogram/utils/publication-schemas').formError(input.type,{...input,attributes:clean,imageIds:images});if(error)throw new ApiError(400,'INVALID_FORM',error);}
 return {attributes:clean,imageIds:images,clientKey:input.clientKey,...(input.contactSettings===undefined?{}:{contactSettings:require('./trust-policy').contactSettings(input.contactSettings)}),...(input.sourceDraftRevision===undefined?{}:{sourceDraftRevision:input.sourceDraftRevision})};
}
function validatePublicationSubmission(input,{existingAttributes}={}){
 const extras=publicationExtras(input,{validateForm:false});
 if(input.type==='community'&&!require('../../miniprogram/utils/product-scope').practicalInformationProjectIds.includes(extras.attributes.categoryId))throw new ApiError(403,'PRACTICAL_INFORMATION_REQUIRED','当前仅开放失物招领和寻物启事等实用信息。');
 const mustClassify=existingAttributes===undefined||!!existingAttributes.categoryId;
 if(mustClassify&&!extras.attributes.categoryId)throw new ApiError(400,'CATEGORY_REQUIRED','请选择发布项目，已有分类关联不可清空');
 const error=require('../../miniprogram/utils/publication-schemas').formError(input.type,{
  ...input,detail:input.detail??input.description,attributes:extras.attributes,imageIds:extras.imageIds
 },{enforceCurrent:true});
 if(error)throw new ApiError(400,'INVALID_FORM',error);
 return extras;
}
function publicationEditExtras(current,value){
 return validatePublicationSubmission({
  ...value,
  attributes:(value.replaceAttributes??value.replaceExtras)?value.attributes:current.attributes,
  imageIds:(value.replaceImages??value.replaceExtras)?value.imageIds:(current.image_ids??current.imageIds??[])
 },{existingAttributes:current.attributes||{}});
}
function attachProductRepository(repo,pool){
 const query=(s,a=[])=>pool.query(s,a);
 const one=async(s,a=[])=>(await query(s,a)).rows[0]||null;
 const tx=async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const visible="p.status='published' AND (p.expires_at IS NULL OR p.expires_at>now()) AND EXISTS(SELECT 1 FROM service_regions r WHERE r.name=p.district AND r.enabled) AND (NOT EXISTS(SELECT 1 FROM industry_entries ie WHERE ie.id=p.id) OR EXISTS(SELECT 1 FROM industry_public_eligibility eligible WHERE eligible.id=p.id))" + ' AND ' + require('./public-information-policy').eligibilitySql('p');
 const oldFeed=repo.listFeed,oldItem=repo.getItem;
 async function decorate(items){
  if(!items.length)return items;
  const rows=(await query(`SELECT id,attributes,image_ids,created_at,expires_at FROM publications WHERE id=ANY($1::uuid[])
   UNION ALL SELECT id,'{}'::jsonb,image_ids,created_at,NULL::timestamptz FROM service_catalog WHERE id=ANY($1::uuid[])`,[items.map(x=>x.id)])).rows;
  const map=new Map(rows.map(x=>[x.id,x]));
  return items.map(x=>{const p=map.get(x.id);return {...x,attributes:p?.attributes||{},imageIds:p?.image_ids||[],images:(p?.image_ids||[]).map(id=>'/api/v1/media/'+id),createdAt:p?.created_at||x.createdAt,expiresAt:p?.expires_at||null};});
 }
 repo.listFeed=async args=>decorate(await oldFeed(args));
 repo.getItem=async(id,{includeTest=false}={})=>{const marker=await one('SELECT is_test FROM publications WHERE id=$1 UNION ALL SELECT is_test FROM service_catalog WHERE id=$1 UNION ALL SELECT is_test FROM verified_merchants WHERE id=$1',[id]);if(marker?.is_test&&!includeTest)return null;let item=await oldItem(id);if(!item){const m=await one("SELECT m.* FROM verified_merchants m JOIN service_regions r ON r.name=m.district AND r.enabled WHERE m.id=$1 AND m.status='active'",[id]);if(m){item={id:m.id,type:'merchant',kind:'merchant',title:m.name,description:m.category,desc:m.category,detail:m.category,district:m.district,category:'本地商家',price:'',createdAt:m.created_at,services:(await query("SELECT id,title,price FROM service_catalog WHERE merchant_id=$1 AND status='published' AND public_service_source_ok(id) ORDER BY created_at DESC",[id])).rows};}}return item?(await decorate([item]))[0]:null;};
 repo.createPublication=async(uid,v)=>tx(async c=>{
  require('./publication-notice').validate(v.publicationConsent);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['draft:'+uid]);
  if(v.clientKey){await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['publication:'+uid+':'+v.clientKey]);const replay=(await c.query('SELECT * FROM publications WHERE user_id=$1 AND client_key=$2',[uid,v.clientKey])).rows[0];if(replay){if(replay.title!==v.title||replay.description!==v.description||replay.type!==v.type||replay.price!==v.price||replay.district!==v.district||!require('node:util').isDeepStrictEqual(replay.attributes,v.attributes||{})||!require('node:util').isDeepStrictEqual(replay.image_ids,v.imageIds||[]))throw new ApiError(409,'REQUEST_KEY_REUSED','提交标识已用于其他内容，请重新打开表单');return {...replay,userId:replay.user_id,detail:replay.description,imageIds:replay.image_ids};}}
  const trust=await require('./trust-repository').guard(c,uid,'publish',{...v,newSubmission:true},repo.trustOptions||{});
  if(!trust.localTest){const count=(await c.query("SELECT count(*)::int n FROM publications WHERE user_id=$1 AND created_at>now()-interval '1 day'",[uid])).rows[0].n;if(count>=(trust.risk==='suspicious'?1:trust.newUser?3:10))throw new ApiError(429,'PUBLICATION_LIMIT','今日发布数量已达上限');}
  if(require('./trust-policy').signals(v.title+' '+v.description+' '+JSON.stringify(v.attributes||{})).includes('contact_in_content'))throw new ApiError(400,'CONTACT_IN_CONTENT','请勿将手机号写入正文；公开电话请使用单独联系设置');
  const source=(await c.query('SELECT revision,payload FROM account_drafts WHERE user_id=$1 FOR UPDATE',[uid])).rows[0];
  if(v.sourceDraftRevision!==undefined&&(source?.revision!==v.sourceDraftRevision||source?.payload?.clientKey!==v.clientKey))throw new ApiError(409,'DRAFT_CONFLICT','账号草稿已被更新，请保留当前内容并重新读取草稿后再提交');
  const ids=v.imageIds||[];
  const photos=await c.query('SELECT id FROM content_images WHERE user_id=$1 AND id=ANY($2::uuid[]) FOR SHARE',[uid,ids]);
  if(photos.rows.length!==ids.length)throw new ApiError(400,'IMAGE_NOT_OWNED','图片无效或不属于当前用户');
  const x=(await c.query(`INSERT INTO publications(user_id,type,title,description,district,price,attributes,image_ids,expires_at,is_test,client_key)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '60 days',$9,$10) RETURNING *`,[uid,v.type,v.title,v.description,v.district,v.price,v.attributes||{},ids,!!v.isTest,v.clientKey||null])).rows[0];
  await require('./trust-repository').persistContact(c,uid,x.id,v.contactSettings||{});
  await require('./publication-records').persist(c,uid,x,v.publicationConsent,{contactSettings:require('./trust-policy').contactSettings(v.contactSettings||{})});
  const signals=require('./trust-policy').signals(v.title+' '+v.description);
  if((await c.query("SELECT 1 FROM publications WHERE id<>$1 AND title=$2 AND description=$3 AND created_at>now()-interval '7 days' LIMIT 1",[x.id,v.title,v.description])).rows.length)signals.push('duplicate_content');
  if((await c.query('SELECT 1 FROM content_images a JOIN content_images b ON a.content_sha256=b.content_sha256 AND a.id<>b.id WHERE a.id=ANY($1::uuid[]) LIMIT 1',[ids])).rows.length)signals.push('duplicate_image');
  if(ids.length)signals.push('image_manual_review_required');
  if(signals.length)await c.query("INSERT INTO risk_cases(user_id,target_type,target_id,signals) VALUES($1,'publication',$2,$3)",[uid,x.id,JSON.stringify(signals)]);
  // A local copy must not remove a different/newer account draft with the same ID.
  const draft=source?.payload,trim=value=>String(value??'').trim();
  const sameContent=draft&&draft.kind===v.type&&trim(draft.title)===v.title&&trim(draft.detail)===v.description&&trim(draft.price)===v.price&&trim(draft.district)===v.district&&require('node:util').isDeepStrictEqual(draft.attributes,v.attributes||{})&&require('node:util').isDeepStrictEqual(draft.imageIds,ids);
  if(v.clientKey&&draft?.clientKey===v.clientKey&&(v.sourceDraftRevision!==undefined||sameContent))await c.query("UPDATE account_drafts SET payload=NULL,image_ids='{}',revision=revision+1,updated_at=now() WHERE user_id=$1 AND payload->>'clientKey'=$2 AND revision=$3",[uid,v.clientKey,source.revision]);
  return {...x,userId:x.user_id,detail:x.description,createdAt:x.created_at,imageIds:x.image_ids};
 });
 // Updating structured fields, photos and moderation state is one owner-locked transaction.
 repo.updatePublication=async(uid,id,v,revision)=>tx(async c=>{
  require('./publication-notice').validate(v.publicationConsent);
  // Match account lifecycle lock order before locking the publication.
  await c.query('SELECT id FROM app_users WHERE id=$1 FOR NO KEY UPDATE',[uid]);
  const current=(await c.query('SELECT * FROM publications WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,uid])).rows[0];
  if(!current||!['pending','published','rejected'].includes(current.status)||current.type!==v.type)return false;
  if(current.revision!==revision)return {error:'revision_conflict'};
  const extras=publicationEditExtras(current,v),ids=extras.imageIds;
  await require('./trust-repository').guard(c,uid,'publish',{...v,attributes:extras.attributes},repo.trustOptions||{});
  if(require('./trust-policy').signals(v.title+' '+v.description+' '+JSON.stringify(extras.attributes)).includes('contact_in_content'))throw new ApiError(400,'CONTACT_IN_CONTENT','公开正文不能填写手机号');
  const photos=await c.query('SELECT id FROM content_images WHERE user_id=$1 AND id=ANY($2::uuid[]) FOR SHARE',[uid,ids]);
  if(photos.rows.length!==ids.length)throw new ApiError(400,'IMAGE_NOT_OWNED','图片无效或不属于当前用户');
  const row=(await c.query(`UPDATE publications SET title=$3,description=$4,district=$5,price=$6,attributes=$7,image_ids=$8,status='pending',moderation_reason='',reviewed_at=NULL,revision=revision+1,updated_at=now(),expires_at=now()+interval '60 days' WHERE id=$1 AND user_id=$2 RETURNING *`,[id,uid,v.title,v.description,v.district,v.price,extras.attributes,ids])).rows[0];
  const contacts=(await c.query('SELECT public_phone AS "publicPhone",allow_messages AS "allowMessages" FROM publication_contact_settings WHERE publication_id=$1',[id])).rows[0]||{};
  await require('./publication-records').persist(c,uid,row,v.publicationConsent,{contactSettings:contacts});
  const signals=require('./trust-policy').signals(v.title+' '+v.description+' '+JSON.stringify(extras.attributes));
  if((await c.query("SELECT 1 FROM publications WHERE id<>$1 AND title=$2 AND description=$3 AND created_at>now()-interval '7 days' LIMIT 1",[id,v.title,v.description])).rows.length)signals.push('duplicate_content');
  if(ids.length)signals.push('image_manual_review_required');
  if(signals.length)await c.query("INSERT INTO risk_cases(user_id,target_type,target_id,signals) VALUES($1,'publication',$2,$3)",[uid,id,JSON.stringify(signals)]);
  await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('user_edit_resubmitted','publication',$1,$2)",[id,'revision='+row.revision]);
  return {...row,userId:row.user_id,detail:row.description,imageIds:row.image_ids,attributes:row.attributes};
 });
 repo.editMerchantService=async(uid,mid,id,v)=>tx(async c=>{
  const rights=await c.query("SELECT mm.role FROM merchant_members mm JOIN verified_merchants vm ON vm.id=mm.merchant_id WHERE mm.user_id=$1 AND mm.merchant_id=$2 AND mm.status='active' AND mm.role IN ('owner','manager') AND vm.status='active' FOR SHARE OF mm,vm",[uid,mid]);
  if(!rights.rows.length)return null;
  const current=(await c.query("SELECT image_ids FROM service_catalog WHERE id=$1 AND merchant_id=$2 AND status IN ('published','draft','pending_review') FOR UPDATE",[id,mid])).rows[0];
  if(!current)return false;
  const ids=v.imageIds===undefined?current.image_ids:v.imageIds;
  // Managers may retain this service's existing gallery, but cannot attach arbitrary foreign uploads.
  const photos=await c.query('SELECT id FROM content_images WHERE id=ANY($2::uuid[]) AND (user_id=$1 OR id=ANY($3::uuid[])) FOR SHARE',[uid,ids,current.image_ids]);
  if(photos.rows.length!==ids.length)throw new ApiError(400,'IMAGE_NOT_OWNED','图片无效或不属于当前服务');
  const row=(await c.query("UPDATE service_catalog SET title=$3,description=$4,price=$5,image_ids=$6,status='pending_review' WHERE id=$1 AND merchant_id=$2 RETURNING *",[id,mid,v.title,v.description,v.price,ids])).rows[0];
  if(row)await require('./publication-records').persist(c,uid,row,v.publicationConsent,{kind:'service'});
  if(!row)return false;await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('service_edit_resubmitted','service',$1,'商家编辑后重新审核')",[id]);return row;
 });
 const oldManaged=repo.myManagedMerchants;
 repo.myManagedMerchants=async uid=>Promise.all((await oldManaged(uid)).map(async m=>({...m,...await one(`SELECT (SELECT count(*)::int FROM service_catalog WHERE merchant_id=$1) AS "servicesCount",(SELECT count(*)::int FROM booking_requests b JOIN service_catalog s ON s.id=b.service_id WHERE s.merchant_id=$1 AND b.status='pending_confirm' AND b.hold_expires_at>now()) AS "pendingBookings",(SELECT count(*)::int FROM booking_requests b JOIN service_catalog s ON s.id=b.service_id WHERE s.merchant_id=$1 AND b.status='completed') AS "completedBookings"`,[m.id])})));
 const originalMerchant=repo.createMerchant;
 repo.createMerchant=async(uid,v)=>{const item=await originalMerchant(uid,v);if(item&&v.isTest)await query('UPDATE merchant_applications SET is_test=true WHERE id=$1 AND user_id=$2',[item.id,uid]);return item;};
 repo.blockContact=async(uid,id,block=true)=>tx(async c=>{const row=(await c.query('SELECT requester_id FROM contact_requests WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,uid])).rows[0];if(!row)return false;if(!block){await c.query('DELETE FROM user_blocks WHERE user_id=$1 AND blocked_user_id=$2',[uid,row.requester_id]);return true;}await c.query('INSERT INTO user_blocks(user_id,blocked_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[uid,row.requester_id]);await c.query("UPDATE contact_requests SET status='rejected',response='',updated_at=now() WHERE owner_id=$1 AND requester_id=$2 AND status='pending'",[uid,row.requester_id]);return true;});
 repo.profile=async uid=>one('SELECT id,display_name AS "displayName",bio,profile_city_code AS "cityCode",avatar_image_id AS "avatarImageId",ARRAY(SELECT provider FROM app_identities WHERE user_id=$1 ORDER BY provider) AS "loginProviders" FROM app_users WHERE id=$1',[uid]);
 repo.blockedUsers=async uid=>(await query('SELECT blocked_user_id AS id,created_at AS "createdAt" FROM user_blocks WHERE user_id=$1 ORDER BY created_at DESC,blocked_user_id',[uid])).rows;
 repo.unblockUser=async(uid,id)=>{await query('DELETE FROM user_blocks WHERE user_id=$1 AND blocked_user_id=$2',[uid,id]);};
 repo.updateProfile=async(uid,patch)=>tx(async c=>{
  // Lock the upload before referencing it, matching image deletion's lock order.
  if(patch.avatarImageId){
   const image=await c.query('SELECT id FROM content_images WHERE id=$1 AND user_id=$2 FOR SHARE',[patch.avatarImageId,uid]);
   if(!image.rows.length)throw new ApiError(400,'IMAGE_NOT_OWNED','头像不存在或不属于当前账号');
   // An avatar remains private: a previously published content photo cannot be reused here.
   const refs=await c.query('SELECT id FROM publications WHERE $1=ANY(image_ids) UNION ALL SELECT id FROM service_catalog WHERE $1=ANY(image_ids) LIMIT 1',[patch.avatarImageId]);
   if(refs.rows.length)throw new ApiError(400,'IMAGE_IN_USE','请选择一张独立的头像图片');
  }
  const columns={displayName:'display_name',bio:'bio',cityCode:'profile_city_code',avatarImageId:'avatar_image_id'},keys=Object.keys(patch);
  await c.query('UPDATE app_users SET '+keys.map((key,i)=>columns[key]+'=$'+(i+2)).join(',')+' WHERE id=$1',[uid,...keys.map(key=>patch[key])]);
 });
 repo.setDisplayName=async(uid,name)=>query('UPDATE app_users SET display_name=$2 WHERE id=$1',[uid,name]);
 repo.uploadContentImage=async(uid,bytes)=>require('./upload-capacity').processImage(()=>tx(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['content-image:'+uid]);
  const count=await c.query("SELECT count(*)::int AS n FROM content_images WHERE user_id=$1 AND created_at>now()-interval '1 day'",[uid]);
  if(count.rows[0].n>=30)throw new ApiError(429,'UPLOAD_LIMIT','今日图片上传次数已达上限');
  const sharp=require('sharp');let image,thumb,info;
  try{const pipeline=sharp(bytes,{limitInputPixels:require('./upload-capacity').MAX_IMAGE_PIXELS,failOn:'error'}).rotate();
   const full=await pipeline.clone().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer({resolveWithObject:true});image=full.data;info=full.info;
   thumb=await pipeline.resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer();
  }catch{throw new ApiError(400,'INVALID_IMAGE','无法读取图片，请使用不超过1600万像素的 JPG 或 PNG');}
   const x=(await c.query('INSERT INTO content_images(user_id,data,thumbnail,width,height,content_sha256) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,width,height',[uid,image,thumb,info.width,info.height,require('node:crypto').createHash('sha256').update(image).digest('hex')])).rows[0];
   return {...x,url:'/api/v1/media/'+x.id};
 }));
 repo.contentImageForAdmin=async(id,{qualificationOnly=false}={})=>one("SELECT data,thumbnail FROM content_images WHERE id=$1 AND (NOT $2::boolean OR EXISTS(SELECT 1 FROM publications p WHERE content_images.id=ANY(p.image_ids) AND p.type='housing' AND p.status='pending'))",[id,qualificationOnly]);
 repo.readContentImage=async(id,uid,includeTest=false)=>one(`SELECT i.data,i.thumbnail FROM content_images i WHERE i.id=$1 AND (
  i.user_id=$2 OR EXISTS(SELECT 1 FROM publications p WHERE i.id=ANY(p.image_ids) AND (NOT p.is_test OR $3::boolean) AND ${visible})
  OR EXISTS(SELECT 1 FROM service_catalog s JOIN verified_merchants m ON m.id=s.merchant_id
   WHERE i.id=ANY(s.image_ids) AND m.status='active' AND (
    EXISTS(SELECT 1 FROM merchant_members mm WHERE mm.merchant_id=m.id AND mm.user_id=$2 AND mm.status='active')
    OR (s.status='published' AND public_service_source_ok(s.id) AND (NOT s.is_test OR $3::boolean) AND EXISTS(SELECT 1 FROM service_regions r WHERE r.name=s.district AND r.enabled))
   ))
 )`,[id,uid,includeTest]);
 repo.deleteContentImage=async(uid,id)=>tx(async c=>{
  const x=await c.query('SELECT id FROM content_images WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,uid]);if(!x.rows.length)return false;
  if((await c.query('SELECT id FROM app_users WHERE avatar_image_id=$1 LIMIT 1',[id])).rows.length)return false;
  const refs=await c.query('SELECT id FROM publications WHERE $1=ANY(image_ids) LIMIT 1',[id]);if(refs.rows.length)return false;
  if((await c.query("SELECT 1 FROM publication_confirmations WHERE content_snapshot->'imageIds' ? $1::text LIMIT 1",[id])).rows.length)return false;
  if((await c.query('SELECT user_id FROM account_drafts WHERE $1=ANY(image_ids) LIMIT 1',[id])).rows.length)return false;
  if((await c.query('SELECT id FROM service_catalog WHERE $1=ANY(image_ids) LIMIT 1',[id])).rows.length)return false;
  await c.query('DELETE FROM content_images WHERE id=$1',[id]);return true;
 });
 repo.saveItem=async(uid,id,on,includeTest=false)=>{
  if(!on){await query('DELETE FROM saved_items WHERE user_id=$1 AND target_id=$2',[uid,id]);return true;}
  if(!await repo.getItem(id,{includeTest}))return false;
  await query('INSERT INTO saved_items(user_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[uid,id]);return true;
 };
 repo.isSaved=async(uid,id)=>!!await one('SELECT 1 FROM saved_items WHERE user_id=$1 AND target_id=$2',[uid,id]);
 repo.savedState=async(uid,ids)=>(await query('SELECT target_id FROM saved_items WHERE user_id=$1 AND target_id=ANY($2::uuid[])',[uid,ids])).rows.map(r=>r.target_id);
 repo.savedItems=async(uid,offset,includeTest=false)=>{
  const rows=(await query('SELECT target_id FROM saved_items WHERE user_id=$1 ORDER BY created_at DESC,target_id LIMIT 21 OFFSET $2',[uid,offset])).rows;
  return {items:(await Promise.all(rows.slice(0,20).map(x=>repo.getItem(x.target_id,{includeTest})))).filter(Boolean),hasMore:rows.length>20};
 };
 repo.summary=async(uid)=>one(`SELECT
  (SELECT count(*)::int FROM publications WHERE user_id=$1) AS publications,
  (SELECT count(*)::int FROM booking_requests WHERE user_id=$1) AS bookings,
  (SELECT count(*)::int FROM saved_items f WHERE f.user_id=$1 AND (EXISTS(SELECT 1 FROM publications p WHERE p.id=f.target_id AND ${visible}) OR EXISTS(SELECT 1 FROM service_catalog s JOIN service_regions r ON r.name=s.district AND r.enabled WHERE s.id=f.target_id AND s.status='published' AND public_service_source_ok(s.id)) OR EXISTS(SELECT 1 FROM verified_merchants m JOIN service_regions r ON r.name=m.district AND r.enabled WHERE m.id=f.target_id AND m.status='active'))) AS saved,
  (SELECT count(*)::int FROM user_notifications WHERE user_id=$1 AND read_at IS NULL) AS unread`,[uid]);
 repo.notifications=async(uid,offset)=>{const rows=(await query('SELECT id,title,body,target_kind AS "targetKind",target_id AS "targetId",read_at AS "readAt",created_at AS "createdAt" FROM user_notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET $2',[uid,offset])).rows;return {items:rows.slice(0,20),hasMore:rows.length>20,unread:(await one('SELECT count(*)::int AS n FROM user_notifications WHERE user_id=$1 AND read_at IS NULL',[uid])).n};};
 repo.readNotification=async(uid,id)=>!!(await query('UPDATE user_notifications SET read_at=coalesce(read_at,now()) WHERE user_id=$1 AND ($2::uuid IS NULL OR id=$2) RETURNING id',[uid,id])).rowCount;
 repo.contactRequests=async(uid,{offset=0,limit=100}={})=>(await query(`
  SELECT c.id,c.publication_id AS "publicationId",p.title,p.type,c.message,c.response,c.status,c.ended_at AS "endedAt",
   CASE WHEN NOT p.is_test AND ${visible} THEN '/api/v1/media/' || p.image_ids[1]::text END AS "coverPath",
   EXISTS(SELECT 1 FROM user_blocks b WHERE b.user_id=c.owner_id AND b.blocked_user_id=c.requester_id) AS blocked,
   c.requester_id=$1 AS outgoing,c.created_at AS "createdAt"
  FROM contact_requests c JOIN publications p ON p.id=c.publication_id
  WHERE c.requester_id=$1 OR c.owner_id=$1 ORDER BY c.created_at DESC,c.id DESC LIMIT $2 OFFSET $3`,[uid,limit,offset])).rows;
 repo.pendingContactCount=async uid=>(await one("SELECT count(*)::int n FROM contact_requests c WHERE c.owner_id=$1 AND c.status='pending' AND c.ended_at IS NULL AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE b.user_id=c.owner_id AND b.blocked_user_id=c.requester_id)",[uid])).n;
 repo.requestContact=async(uid,id,message)=>tx(async c=>{
  const trust=await require('./trust-repository').guard(c,uid,'contact',{},repo.trustOptions||{});
  const p=(await c.query(`SELECT p.* FROM publications p WHERE p.id=$1 AND ${visible} FOR SHARE`,[id])).rows[0];
  if(!p||p.user_id===uid)return null;
  if((await c.query('SELECT allow_messages FROM publication_contact_settings WHERE publication_id=$1',[id])).rows[0]?.allow_messages===false)return null;
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['preferences:'+p.user_id]);
  if((await c.query('SELECT allow_contacts FROM user_preferences WHERE user_id=$1',[p.user_id])).rows[0]?.allow_contacts===false)return null;
  if((await c.query('SELECT 1 FROM user_blocks WHERE (user_id=$1 AND blocked_user_id=$2) OR (user_id=$2 AND blocked_user_id=$1)',[p.user_id,uid])).rows.length)return null;
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['contact:'+uid+':'+id]);
  const existing=(await c.query("SELECT id FROM contact_requests WHERE requester_id=$1 AND publication_id=$2 AND status IN ('pending','accepted') AND ended_at IS NULL",[uid,id])).rows[0];if(existing)return existing;
  const recent=await c.query("SELECT count(*)::int AS n FROM contact_requests WHERE requester_id=$1 AND created_at>now()-interval '1 day'",[uid]);if(recent.rows[0].n>=(trust.localTest?10:trust.risk==='suspicious'?1:trust.newUser?3:10))throw new ApiError(429,'CONTACT_LIMIT','今日联系申请次数已达上限');
  if(require('./trust-policy').signals(message).length)throw new ApiError(400,'CONTACT_RISK','首次联系请勿发送电话、链接、资金或验证码信息');
  const item=(await c.query('INSERT INTO contact_requests(publication_id,requester_id,owner_id,message) VALUES($1,$2,$3,$4) RETURNING id',[id,uid,p.user_id,message])).rows[0];
  await c.query("INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES($1,'收到联系申请','有人希望了解你发布的信息，请查看并决定是否回复。','contact',$2)",[p.user_id,item.id]);return item;
 });
 repo.respondContact=async(uid,id,action,response)=>tx(async c=>{
  if(action==='accept'){await require('./trust-repository').guard(c,uid,'contact',{},repo.trustOptions||{});const valid=await c.query(`SELECT 1 FROM contact_requests c JOIN publications p ON p.id=c.publication_id WHERE c.id=$1 AND ${visible} AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE b.user_id=c.owner_id AND b.blocked_user_id=c.requester_id) FOR SHARE OF p`,[id]);if(!valid.rows.length)return false;}
  const q=action==='withdraw'?"UPDATE contact_requests SET status='withdrawn',updated_at=now() WHERE id=$1 AND requester_id=$2 AND status='pending' RETURNING *":"UPDATE contact_requests SET status=$3,response=$4,updated_at=now() WHERE id=$1 AND owner_id=$2 AND status='pending' RETURNING *";
  const row=(await c.query(q,action==='withdraw'?[id,uid]:[id,uid,action==='accept'?'accepted':'rejected',action==='accept'?response:''])).rows[0];if(!row)return false;
  if(action!=='withdraw')await c.query("INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES($1,'联系申请有新结果','发布者已处理你的联系申请，请查看详情。','contact',$2)",[row.requester_id,id]);return true;
 });
 repo.commentQueue=async()=>(await query("SELECT c.id,c.body,c.created_at AS \"createdAt\",p.title FROM content_comments c JOIN publications p ON p.id=c.publication_id WHERE c.status='pending' ORDER BY c.created_at LIMIT 100")).rows;
 repo.reviewComment=async(id,status,reason)=>tx(async client=>{
  if(status!=='rejected')throw new ApiError(403,'PUBLIC_INTERACTIONS_CLOSED','公开互动已关闭，历史留言仅支持拒绝处理。');
  const row=(await client.query("UPDATE content_comments SET status='rejected',moderation_reason=$2 WHERE id=$1 AND status='pending' RETURNING *",[id,reason])).rows[0];
  if(!row)return false;
  await client.query("INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES($1,'历史留言处理结果',$2,'publication',$3)",[row.user_id,'历史留言未予公开：'+reason,row.publication_id]);
  await client.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('comment_review','comment',$1,$2)",[id,'rejected:'+reason]);
  return true;
 });
 repo.deleteComment=async(uid,id)=>!!(await query("UPDATE content_comments SET status='deleted' WHERE id=$1 AND user_id=$2 AND status<>'deleted' RETURNING id",[id,uid])).rowCount;
 require('./account-drafts').attachAccountDrafts(repo,pool);
 require('./privacy-repository').attachPrivacyRepository(repo,pool);
 return require('./expiry-reminders').attachExpiryReminders(repo,pool);
}
module.exports={validatePublicationSubmission,publicationEditExtras,attachProductRepository,publicationExtras};
