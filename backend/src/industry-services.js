'use strict';
const {ApiError,text,uuid}=require('./rules'),{transaction}=require('./points-repository');
const fail=(code,message,status=409)=>{throw new ApiError(status,code,message);};
function attachIndustryServices(repo,pool){
 repo.industryServiceLink=async(uid,id)=>{
  if(!(await pool.query('SELECT 1 FROM industry_entries WHERE id=$1 AND user_id=$2',[id,uid])).rows.length)fail('NOT_FOUND','本人业务不存在',404);
  return (await pool.query('SELECT l.*,s.status AS service_status,public_service_source_ok(s.id) AS eligible FROM industry_service_links l JOIN service_catalog s ON s.id=l.service_id WHERE l.entry_id=$1 AND l.active',[id])).rows[0]||null;
 };
 repo.connectIndustryService=(uid,id,v)=>transaction(pool,async c=>{
  if(!uuid(v.merchantId)||v.confirmed!==true||!Number.isSafeInteger(v.revision))fail('SERVICE_LINK_CONSENT','请选择实际负责的商家并核对本条范围',400);
  await repo.assertTrust?.(uid,'publish',{type:'service'});
  const row=(await c.query('SELECT * FROM industry_entries WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,uid])).rows[0];
  if(!row)fail('NOT_FOUND','本人业务不存在',404);
  if(!['MERCHANT_SERVICE','LICENSED_PROVIDER'].includes(row.policy))fail('SERVICE_LINK_SCOPE','该项目不提供库存预约',400);
  if(row.revision!==v.revision||!(await c.query('SELECT 1 FROM industry_public_eligibility WHERE id=$1',[id])).rows.length)fail('SERVICE_SOURCE_CHANGED','原业务已变化或当前项目资质失效');
  if((await c.query("SELECT 1 FROM business_categories WHERE id='service' AND NOT enabled")).rows.length)fail('CATEGORY_CLOSED','服务分类暂停新供给',403);
  const m=(await c.query("SELECT m.* FROM verified_merchants m JOIN merchant_members mm ON mm.merchant_id=m.id WHERE m.id=$1 AND mm.user_id=$2 AND m.status='active' AND mm.status='active' AND mm.role IN ('owner','manager') FOR SHARE OF m,mm",[v.merchantId,uid])).rows[0];
  if(!m||m.district!==row.payload.district)fail('SERVICE_MERCHANT_REQUIRED','请选择同一服务地区内本人管理的已核验商家',403);
  const publicRow=(await c.query("SELECT p.id FROM publications p JOIN service_regions r ON r.name=p.district AND r.enabled WHERE p.id=$1 AND p.status='published' AND (p.expires_at IS NULL OR p.expires_at>now()) FOR SHARE OF p",[id])).rows[0];if(!publicRow)fail('SERVICE_SOURCE_CHANGED','原业务已停止展示');
  const old=(await c.query('SELECT * FROM industry_service_links WHERE entry_id=$1 AND active FOR UPDATE',[id])).rows[0];
  if(old?.source_revision===row.revision){if(old.merchant_id!==m.id)fail('SERVICE_LINK_EXISTS','当前版本已绑定负责商家，请先修改原业务并重新审核');return repo.industryServiceLink(uid,id);}
  if(old)await c.query('UPDATE industry_service_links SET active=false,revision=revision+1 WHERE id=$1',[old.id]);
  const p=row.payload,description=p.detail+'\n'+Object.entries(p.fields||{}).map(([k,value])=>(require('../../miniprogram/utils/industry-workflows').workflow(row.project_id).fields.find(f=>f.key===k)?.label||k)+'：'+value).join('\n');
  const service=(await c.query("INSERT INTO service_catalog(merchant_id,title,description,price,district,image_ids,status) VALUES($1,$2,$3,$4,$5,$6,'pending_review') RETURNING id",[m.id,p.title,description,p.price,p.district,p.imageIds])).rows[0];
  const link=(await c.query('INSERT INTO industry_service_links(entry_id,service_id,merchant_id,owner_id,source_revision) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,service.id,m.id,uid,row.revision])).rows[0];
  await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('industry_service_connected','service',$1,$2)",[service.id,'原项目 '+row.project_id+'；原版本 '+row.revision+'；待独立内容审核']);
  return {...link,service_status:'pending_review',eligible:true};
 });
 repo.reviewIndustryService=(sid,v,role)=>transaction(pool,async c=>{
  if(role!=='operator')fail('OPERATOR_REQUIRED','需要运营审核角色',403);
  const l=(await c.query('SELECT * FROM industry_service_links WHERE service_id=$1',[sid])).rows[0];
  if(!l||l.revision!==v.revision||!['published','disabled'].includes(v.status))fail('SERVICE_LINK_CHANGED','供给审核版本已变化');
  await c.query('SELECT id FROM app_users WHERE id=$1 FOR SHARE',[l.owner_id]);
  await c.query('SELECT id FROM industry_entries WHERE id=$1 FOR SHARE',[l.entry_id]);
  const current=(await c.query('SELECT revision FROM industry_service_links WHERE id=$1 FOR UPDATE',[l.id])).rows[0];if(current.revision!==v.revision)fail('SERVICE_LINK_CHANGED','供给版本已变化');
  const response=text(v.response,800,8);
  if(v.status==='published'){
   if(repo.trustOptions?.production&&!repo.trustOptions.publishApproved)fail('PLATFORM_PUBLISH_NOT_APPROVED','当前平台发布服务资格尚未确认',503);
   if(v.textReviewed!==true||v.imagesReviewed!==true||v.scopeReviewed!==true)fail('SERVICE_CHECKS_REQUIRED','请独立核对服务文字、原图及本项目范围',400);
   // Lock the same source records used by new booking claims.
   await c.query('SELECT id FROM industry_entries WHERE id=$1 FOR SHARE',[l.entry_id]);
   await c.query('SELECT id FROM publications WHERE id=$1 FOR SHARE',[l.entry_id]);
   await c.query('SELECT id FROM industry_credentials WHERE user_id=$1 FOR SHARE',[l.owner_id]);
   await c.query('SELECT id FROM verified_merchants WHERE id=$1 FOR SHARE',[l.merchant_id]);
   await c.query('SELECT id FROM merchant_members WHERE merchant_id=$1 AND user_id=$2 FOR SHARE',[l.merchant_id,l.owner_id]);
   if(!(await c.query('SELECT 1 FROM industry_service_eligibility WHERE id=$1',[l.id])).rows.length)fail('SERVICE_SOURCE_CHANGED','原内容、专项资质或商家权限已经失效');
  }
  const changed=await c.query("UPDATE service_catalog SET status=$2 WHERE id=$1 AND status='pending_review' RETURNING id",[sid,v.status]);if(!changed.rowCount)fail('SERVICE_LINK_CHANGED','服务状态已变化');
  await c.query('UPDATE industry_service_links SET revision=revision+1 WHERE id=$1',[l.id]);
  await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('industry_service_review','service',$1,$2)",[sid,role+': '+v.status+' '+response]);
  await c.query("INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES($1,'可预约服务审核已有结果',$2,'industry',$3)",[l.owner_id,response,l.entry_id]);return {ok:true};
 });
 const originalPublic=repo.publicIndustryEntry;repo.publicIndustryEntry=async id=>{const item=await originalPublic(id);if(!item)return null;const l=(await pool.query("SELECT s.id FROM industry_service_eligibility l JOIN service_catalog s ON s.id=l.service_id AND s.status='published' WHERE l.entry_id=$1",[id])).rows[0];return {...item,bookableServiceId:l?.id||null};};
 const originalReview=repo.reviewService;repo.reviewService=async(sid,...args)=>{if((await pool.query('SELECT 1 FROM industry_service_links WHERE service_id=$1',[sid])).rows.length)fail('SERVICE_LINK_REVIEW_REQUIRED','请从统一待办核对本项目来源及专项范围后审核');return originalReview(sid,...args);};
 const originalEdit=repo.editMerchantService;if(originalEdit)repo.editMerchantService=async(uid,mid,sid,...args)=>{if((await pool.query('SELECT 1 FROM industry_service_links WHERE service_id=$1',[sid])).rows.length)fail('SERVICE_SOURCE_EDIT_REQUIRED','请修改原行业业务并审核新版，历史预约保留原内容');return originalEdit(uid,mid,sid,...args);};
 const originalBooking=repo.actOnMerchantBooking;repo.actOnMerchantBooking=async(...args)=>{try{return await originalBooking(...args);}catch(e){if(e.code==='P0001'&&e.message==='LINKED_SERVICE_UNAVAILABLE')fail('SERVICE_NOT_AVAILABLE','原业务或资格已失效，不能确认新预约');throw e;}};
 const originalQueue=repo.serviceQueue;repo.serviceQueue=async()=>Promise.all((await originalQueue()).map(async s=>({...s,industryLink:(await pool.query('SELECT * FROM industry_service_links WHERE service_id=$1',[s.id])).rows[0]||null})));
 return repo;
}
async function industryServiceRoutes({req,res,p,m,repo,user,admin,body,json}){
 let match;if((match=/^\/api\/v1\/industry\/entries\/([0-9a-f-]{36})\/service$/.exec(p))){if(!repo.connectIndustryService)throw new ApiError(503,'DATABASE_REQUIRED','需要持久化数据库');const uid=await user(req);if(m==='GET'){json(res,200,{link:await repo.industryServiceLink(uid,match[1])});return true;}if(m==='POST'){json(res,201,{link:await repo.connectIndustryService(uid,match[1],await body(req))});return true;}}
 if((match=/^\/admin\/api\/industry-services\/([0-9a-f-]{36})\/review$/.exec(p))&&m==='POST'){const s=admin(req,true);json(res,200,await repo.reviewIndustryService(match[1],await body(req),s.role));return true;}
 return false;
}
module.exports={attachIndustryServices,industryServiceRoutes};
