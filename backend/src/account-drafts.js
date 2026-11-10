'use strict';
const {ApiError}=require('./rules');
const {publicationExtras}=require('./product-repository');
function validateDraft(input) {
 if(!input||typeof input!=='object'||Array.isArray(input)||!require('../../miniprogram/utils/publication-schemas').get(input.kind))throw new ApiError(400,'INVALID_DRAFT','草稿分类无效');
 const result={kind:input.kind};
 for(const [key,max] of [['title',100],['detail',5000],['price',80],['district',80]]){
  if(typeof input[key]!=='string'||input[key].length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input[key]))throw new ApiError(400,'INVALID_DRAFT','草稿字段格式或长度无效');
  result[key]=input[key];
 }
 // Drafts can contain incomplete category fields; final publication validation remains strict.
 if(!input.attributes||typeof input.attributes!=='object'||Array.isArray(input.attributes))throw new ApiError(400,'INVALID_DRAFT','补充信息无效');
 const keys=require('../../miniprogram/utils/publication-schemas').keys(input.kind);
 result.attributes={};
 for(const [key,value] of Object.entries(input.attributes)){
  if(![...keys,'categoryId','categoryVersion','cityCode','districtCode','templateCode','templateVersion'].includes(key)||typeof value!=='string'||value.length>80)throw new ApiError(400,'INVALID_DRAFT','补充字段无效');
  result.attributes[key]=value;
 }
 if((result.attributes.categoryId||result.attributes.categoryVersion)&&!require('../../miniprogram/utils/classification-contract').validateReference(result.attributes.categoryId,result.attributes.categoryVersion,input.kind))throw new ApiError(400,'CATEGORY_NOT_READY','草稿分类版本或发布映射无效');
 require('./geography').cityReference(result.attributes.cityCode,result.attributes.districtCode);
 if(!require('../../miniprogram/utils/publication-schemas').versionMatches(input.kind,result.attributes))throw new ApiError(400,'INVALID_TEMPLATE_VERSION','草稿模板或版本不匹配');
 const extras=publicationExtras({type:input.kind,imageIds:input.imageIds,clientKey:input.clientKey});
 if(!extras.clientKey)throw new ApiError(400,'INVALID_DRAFT','草稿缺少提交标识');
 return {...result,imageIds:extras.imageIds,clientKey:extras.clientKey,...(input.contactSettings===undefined?{}:{contactSettings:require('./trust-policy').contactSettings(input.contactSettings)})};
}
function attachAccountDrafts(repo,pool){
 repo.accountDraft=async uid=>{
  const row=(await pool.query('SELECT revision,payload,updated_at AS "updatedAt" FROM account_drafts WHERE user_id=$1',[uid])).rows[0];
  return row||{revision:0,payload:null,updatedAt:null};
 };
 repo.saveAccountDraft=async(uid,expectedRevision,payload)=>{
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['draft:'+uid]);
   const row=(await c.query('SELECT revision FROM account_drafts WHERE user_id=$1 FOR UPDATE',[uid])).rows[0];
   if((row?.revision||0)!==expectedRevision)throw new ApiError(409,'DRAFT_CONFLICT','账号草稿已在其他设备更新，请先查看账号草稿');
   if(payload){
    const submitted=await c.query('SELECT id FROM publications WHERE user_id=$1 AND client_key=$2',[uid,payload.clientKey]);
    if(submitted.rows.length)throw new ApiError(409,'DRAFT_SUBMITTED','这份草稿已经提交，请到我的发布查看');
    const images=await c.query('SELECT id FROM content_images WHERE user_id=$1 AND id=ANY($2::uuid[]) FOR SHARE',[uid,payload.imageIds]);
    if(images.rows.length!==payload.imageIds.length)throw new ApiError(400,'IMAGE_NOT_OWNED','草稿图片无效或不属于当前用户');
   }
   const saved=(await c.query(`INSERT INTO account_drafts(user_id,revision,payload,image_ids) VALUES($1,1,$2,$3)
    ON CONFLICT(user_id) DO UPDATE SET revision=account_drafts.revision+1,payload=$2,image_ids=$3,updated_at=now()
    RETURNING revision,payload,updated_at AS "updatedAt"`,[uid,payload,payload?.imageIds||[]])).rows[0];
   await c.query('COMMIT');return saved;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
 return repo;
}
module.exports={validateDraft,attachAccountDrafts};
