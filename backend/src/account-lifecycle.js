'use strict';
const crypto=require('node:crypto'),{ApiError,uuid}=require('./rules'),policy=require('./trust-policy');
const {transaction}=require('./points-repository');
const CLOSURE_CONSENT='account-closure-v1';
const identityFingerprint=(provider,id)=>crypto.createHash('sha256').update(JSON.stringify(['city-life-closed-identity-v1',provider,id])).digest('hex');
async function activeAccount(c,uid){
 const row=(await c.query('SELECT status FROM app_users WHERE id=$1 FOR UPDATE',[uid])).rows[0];
 if(row?.status!=='active')throw new ApiError(403,'ACCOUNT_INACTIVE','账号已关闭或受限');
}
async function closureBlockers(c,uid){
 const r=(await c.query(`SELECT
  EXISTS(SELECT 1 FROM merchant_members mm JOIN verified_merchants m ON m.id=mm.merchant_id WHERE mm.user_id=$1 AND mm.role='owner' AND mm.status='active' AND m.status='active') merchant,
  EXISTS(SELECT 1 FROM booking_requests WHERE user_id=$1 AND (status='confirmed' OR status='pending_confirm' AND hold_expires_at>now())) booking,
  EXISTS(SELECT 1 FROM points_holds WHERE user_id=$1 AND status='held') holds,
  EXISTS(SELECT 1 FROM ad_campaigns WHERE user_id=$1 AND status IN ('approved','scheduled','paused')) ads,
  EXISTS(SELECT 1 FROM industry_responses r JOIN industry_entries e ON e.id=r.entry_id WHERE (r.user_id=$1 OR e.user_id=$1) AND r.status IN ('pending','accepted')) industry,
  EXISTS(SELECT 1 FROM business_cases WHERE (owner_id=$1 OR applicant_id=$1) AND status NOT IN ('completed','cancelled','resolved')) business`,[uid])).rows[0];
 return Object.entries(r).filter(([,v])=>v).map(([key])=>key);
}
const exportSections={
 industry_service_links:{sql:'SELECT id,entry_id,service_id,merchant_id,source_revision,active,revision,created_at FROM industry_service_links WHERE owner_id=$1',paged:true},
 business_cases:{sql:"SELECT id,source_kind,source_id,project_id,kind,snapshot-'request'-'acceptedResponse' AS snapshot,status,scheduled_at,resolution_outcome,resolution,revision,created_at,updated_at FROM business_cases WHERE (owner_id=$1 OR applicant_id=$1)",paged:true},
 business_case_events:{sql:'SELECT e.id,e.case_id,e.action,e.body,e.detail,e.created_at FROM business_case_events e JOIN business_cases c ON c.id=e.case_id WHERE e.actor_id=$1 AND (c.owner_id=$1 OR c.applicant_id=$1)',paged:true,id:'e.id'},
 login_consents:{sql:'SELECT id,terms_version,privacy_version,document_hash,created_at FROM login_consent_events WHERE user_id=$1',paged:true},
 phone_authorizations:{sql:'SELECT id,action,phone_revision,privacy_version,created_at FROM phone_authorization_events WHERE user_id=$1',paged:true},
 benefit_orders:{sql:'SELECT id,offer_id,client_key,snapshot,status,fulfilment,response,expires_at,created_at FROM benefit_orders WHERE user_id=$1',paged:true},
 promotions:{sql:'SELECT id,client_key,title,status,publication_id,image_id,revision,created_at FROM ad_campaigns WHERE user_id=$1',paged:true},
 industry_entries:{sql:'SELECT id,project_id,payload,status,response,revision,created_at FROM industry_entries WHERE user_id=$1',paged:true},
 industry_responses:{sql:'SELECT id,entry_id,kind,body,status,response,revision,created_at FROM industry_responses WHERE user_id=$1',paged:true},
 industry_credentials:{sql:'SELECT id,project_id,subject,evidence_reference,status,valid_until,response,created_at FROM industry_credentials WHERE user_id=$1',paged:true},
 industry_reports:{sql:'SELECT id,entry_id,reason,status,response,created_at FROM industry_reports WHERE user_id=$1',paged:true},
 home_reports:{sql:'SELECT id,content_id,reason,status,response,created_at FROM home_content_reports WHERE user_id=$1',paged:true},
 booking_submissions:{sql:'SELECT id,client_key,booking_id,failure_code,created_at FROM booking_submissions WHERE user_id=$1',paged:true},
 bookings:{sql:'SELECT id,service_id,requested_at,remark,status,hold_expires_at,created_at,ARRAY(SELECT client_key FROM booking_submissions k WHERE k.user_id=$1 AND k.booking_id=booking_requests.id ORDER BY client_key) AS submission_keys FROM booking_requests WHERE user_id=$1',paged:true},
 profile:{sql:'SELECT id,display_name,bio,profile_city_code,created_at FROM app_users WHERE id=$1'},
 publications:{sql:'SELECT id,type,title,description,district,price,status,attributes,image_ids,revision,expires_at,created_at FROM publications WHERE user_id=$1',paged:true},
 draft:{sql:'SELECT revision,payload,updated_at FROM account_drafts WHERE user_id=$1'},
 favorites:{sql:'SELECT target_id AS id,created_at FROM saved_items WHERE user_id=$1',paged:true,id:'target_id'},
 contacts:{sql:"SELECT id,publication_id,status,CASE WHEN requester_id=$1 THEN message ELSE response END AS authored_text,created_at,ended_at FROM contact_requests WHERE (requester_id=$1 OR owner_id=$1)",paged:true},
 messages:{sql:'SELECT id,contact_id,body,status,created_at FROM contact_messages WHERE sender_id=$1',paged:true},
 points:{sql:'SELECT id,kind,amount,available_delta,held_delta,available_after,held_after,reason,created_at FROM points_ledger WHERE user_id=$1',paged:true},
 reward_appeals:{sql:'SELECT id,reward_id,reason,status,response,resolution,source_reward_revision,created_at,reviewed_at FROM points_reward_appeals WHERE user_id=$1',paged:true},
 rewards:{sql:'SELECT id,publication_id,publication_revision,rule_code,rule_revision,amount,status,reason,settle_after,created_at FROM points_reward_events WHERE user_id=$1',paged:true},
 privacy:{sql:'SELECT id,kind,reason,status,response,created_at FROM privacy_requests WHERE user_id=$1',paged:true},
 consent:{sql:'SELECT id,publication_id,granted,phone_revision,policy_version,created_at FROM phone_consent_events WHERE user_id=$1',paged:true}
};
function attachAccountLifecycle(repo,pool){
 repo.closureReadiness=uid=>transaction(pool,async c=>{await activeAccount(c,uid);return {blockers:await closureBlockers(c,uid),consentVersion:CLOSURE_CONSENT,retained:['审核与举报证据','积分账本','电话授权与访问审计','广告与业务档案','已注销登录身份的单向指纹'],removed:['原始登录身份与会话','已绑定手机号','个人资料与草稿','收藏与个人偏好'],notice:'注销后无法继续登录或使用本账号积分权益，请先导出需要保留的数据。公开信息和联系能力关闭，原始登录身份和个人资料清理；必要业务、审计记录及防止误恢复的单向身份指纹仍保留。注销不等于删除所有历史数据。'};});
 repo.executeAccountClosure=(id,v,actor)=>transaction(pool,async c=>{
  if(!Number.isSafeInteger(v.revision)||v.revision<1||v.confirmed!==true)throw new ApiError(400,'CLOSURE_CONFIRMATION_REQUIRED','请确认已核对本人注销申请和执行范围');
  const reason=policy.note(v.reason),request=(await c.query('SELECT user_id FROM privacy_requests WHERE id=$1',[id])).rows[0];
  if(!request)throw new ApiError(404,'REQUEST_NOT_FOUND','请求不存在');
  // All user-bound writes and new sessions acquire this row before changing data.
  const account=(await c.query('SELECT status FROM app_users WHERE id=$1 FOR UPDATE',[request.user_id])).rows[0],uid=request.user_id;
  const done=(await c.query('SELECT request_id FROM account_closure_executions WHERE request_id=$1',[id])).rows[0];
  if(done)return {ok:true,closed:true,replayed:true};
  const current=(await c.query('SELECT * FROM privacy_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(account?.status!=='active'||current.kind!=='closure'||!['pending','reviewing'].includes(current.status)||current.revision!==v.revision||current.consent_version!==CLOSURE_CONSENT)throw new ApiError(409,'CLOSURE_CHANGED','注销申请或账号状态已变化，请重新核对');
  const blockers=await closureBlockers(c,uid);if(blockers.length)throw new ApiError(409,'CLOSURE_OBLIGATIONS_PENDING','请先处理商家归属、未完成预约、冻结积分或广告排期：'+blockers.join('、'));
  const identities=(await c.query('SELECT provider,provider_id FROM app_identities WHERE user_id=$1 ORDER BY provider,provider_id',[uid])).rows;
  for(const row of identities)await c.query('INSERT INTO closed_identity_fingerprints(fingerprint,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[identityFingerprint(row.provider,row.provider_id),uid]);
  await c.query("UPDATE publications SET status='closed',moderation_reason='发布者已注销账号',updated_at=now() WHERE user_id=$1 AND status IN ('pending','published')",[uid]);
  await c.query("UPDATE publication_contact_settings SET public_phone=false,allow_messages=false,phone_revision=NULL,consent_at=NULL,updated_at=now() WHERE publication_id IN (SELECT id FROM publications WHERE user_id=$1)",[uid]);
  await c.query("WITH removed AS (DELETE FROM verified_phones WHERE user_id=$1 RETURNING revision) INSERT INTO phone_authorization_events(user_id,action,phone_revision,privacy_version) SELECT $1,'withdrawn',revision,$2 FROM removed",[uid,require('./legal-documents').documents().privacyVersion]);
  await c.query("UPDATE points_reward_appeals SET status='withdrawn',resolution='account_closed',response='账号已注销，未完成申诉已归档，历史账本和审计仍保留。',revision=revision+1,reviewed_at=now() WHERE user_id=$1 AND status='pending'",[uid]);
  await c.query("UPDATE points_reward_events SET status='cancelled',reason='贡献相关账号已注销',revision=revision+1,updated_at=now() WHERE (user_id=$1 OR actor_id=$1) AND status IN ('pending','review')",[uid]);
  await c.query("UPDATE contact_requests SET ended_at=coalesce(ended_at,now()),status=CASE WHEN status='pending' THEN 'withdrawn' ELSE status END,updated_at=now() WHERE owner_id=$1 OR requester_id=$1",[uid]);
  await c.query("UPDATE merchant_applications SET status='rejected',reviewer_note='申请者已注销账号',updated_at=now() WHERE user_id=$1 AND status IN ('pending','in_review','needs_documents')",[uid]);
  await c.query("UPDATE merchant_members SET status='removed' WHERE user_id=$1",[uid]);
  await c.query("UPDATE ad_campaigns SET status='rejected',revision=revision+1 WHERE user_id=$1 AND status='pending'",[uid]);
  await c.query("UPDATE advertisers SET status='revoked',revision=revision+1 WHERE user_id=$1",[uid]);
  for(const table of ['app_sessions','app_identities','account_drafts','saved_items','content_likes','user_preferences','user_notifications'])await c.query('DELETE FROM '+table+' WHERE user_id=$1',[uid]);
  await c.query("UPDATE privacy_requests SET status='responded',response='账号已注销：登录身份、会话、手机号、个人资料、草稿和收藏已清理，公开内容及联系能力关闭；必要审核、账本、授权与业务档案仍保留。',revision=revision+1,updated_at=now() WHERE id=$1",[id]);
  await c.query('INSERT INTO account_closure_executions(request_id,user_id,actor,reason,retention_version) VALUES($1,$2,$3,$4,$5)',[id,uid,actor,reason,CLOSURE_CONSENT]);
  await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('account_closed','account',$1,$2)",[uid,actor+': '+reason]);
  await c.query("UPDATE app_users SET status='closed',display_name='已注销用户',bio='',profile_city_code='',avatar_image_id=NULL,closed_at=now() WHERE id=$1",[uid]);
  return {ok:true,closed:true,replayed:false};
 });
 repo.exportOwnData=(uid,section,cursor)=>transaction(pool,async c=>{
  const spec=Object.hasOwn(exportSections,section)?exportSections[section]:null;if(!spec||cursor&&!uuid(cursor)||cursor&&!spec.paged)throw new ApiError(400,'INVALID_EXPORT_SECTION','导出类型或分页标识无效');
  await activeAccount(c,uid);
  const count=(await c.query("SELECT count(*)::int n FROM data_export_events WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[uid])).rows[0].n;if(count>=120)throw new ApiError(429,'EXPORT_LIMIT','导出请求过于频繁，请稍后继续');
  const field=spec.id||'id',sql=spec.sql+(spec.paged?` AND ($2::uuid IS NULL OR ${field}>$2) ORDER BY ${field} LIMIT 51`:''),rows=(await c.query(sql,spec.paged?[uid,cursor||null]:[uid])).rows;
  await c.query('INSERT INTO data_export_events(user_id,section) VALUES($1,$2)',[uid,section]);
  const items=rows.slice(0,50);return {section,items,nextCursor:rows.length>50?items[items.length-1].id:null,exportedAt:new Date().toISOString(),scope:'仅包含本人资料及本人创作内容，不含他人消息、真实号码、登录凭据和内部风控证据'};
 });
 return repo;
}
module.exports={attachAccountLifecycle,CLOSURE_CONSENT,identityFingerprint,activeAccount,closureBlockers,exportSections};
