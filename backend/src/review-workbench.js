'use strict';
const {hasRole,permissionsFor,requirePermission,taskPermission}=require('./admin-permissions');
const {ApiError}=require('./rules');
const {redact}=require('./trust-policy');
// Metadata only: private messages and qualification evidence require audited reads.
const tasks=`
 SELECT 'publication' kind,p.id,p.created_at, p.title title,p.user_id,
  CASE WHEN EXISTS(SELECT 1 FROM risk_cases r WHERE r.target_id=p.id AND r.status='pending') THEN 1 ELSE 3 END priority,
  jsonb_build_object('revision',p.revision,'district',p.district,'type',p.type,
   'signals',coalesce((SELECT jsonb_agg(DISTINCT s.value) FROM risk_cases r CROSS JOIN LATERAL jsonb_array_elements_text(r.signals) s WHERE r.target_id=p.id AND r.status='pending'),'[]'::jsonb)) metadata
 FROM publications p WHERE p.status='pending' AND NOT p.is_test AND NOT EXISTS(SELECT 1 FROM industry_entries e WHERE e.id=p.id)
 UNION ALL
 SELECT 'risk',id,created_at,'风险内容待复核',user_id,0,jsonb_build_object('targetType',target_type,'targetId',target_id,'signals',signals) FROM risk_cases WHERE status='pending'
 UNION ALL
 SELECT 'qualification',p.id,p.created_at,'房源材料待核验',p.user_id,2,jsonb_build_object('revision',p.revision,'scope','publication:'||p.id)
 FROM publications p WHERE p.status='pending' AND p.type='housing' AND NOT p.is_test AND NOT EXISTS(SELECT 1 FROM qualification_checks q WHERE q.user_id=p.user_id AND q.scope='publication:'||p.id AND q.status='verified' AND q.valid_until>now() AND q.publication_revision=p.revision)
 UNION ALL
 SELECT 'merchant',id,created_at,name,user_id,2,jsonb_build_object('status',status) FROM merchant_applications WHERE status IN ('pending','in_review','needs_documents')
 UNION ALL
 SELECT 'report',id,created_at,'举报待处理',user_id,0,jsonb_build_object('targetType',target_type,'targetId',target_id,'reason',reason) FROM content_reports WHERE status='pending'
 UNION ALL
 SELECT 'appeal',id,created_at,'处置申诉待复核',user_id,1,jsonb_build_object('revision',revision) FROM trust_appeals WHERE status='pending'
 UNION ALL
 SELECT 'privacy',id,created_at,'数据权利请求',user_id,1,jsonb_build_object('kind',kind,'revision',revision) FROM privacy_requests WHERE status IN ('pending','reviewing')
 UNION ALL
 SELECT 'contact',id,created_at,'联系申请超过48小时未处理',owner_id,2,jsonb_build_object('publicationId',publication_id) FROM contact_requests WHERE status='pending' AND ended_at IS NULL AND created_at<now()-interval '48 hours'
 UNION ALL
 SELECT 'service',id,created_at,title,NULL::uuid,3,jsonb_build_object('merchantId',merchant_id) FROM service_catalog WHERE status='pending_review'
 UNION ALL
 SELECT 'operations',id,created_at,'后台任务执行异常',NULL::uuid,0,jsonb_build_object('job',job_name,'code',code) FROM operational_alerts WHERE status='pending'
 UNION ALL
 SELECT 'points',id,created_at,CASE WHEN status='reversal_pending' THEN '贡献积分待冲正' ELSE '贡献积分风险复核' END,user_id,1,jsonb_build_object('status',status,'rule',rule_code,'amount',amount,'signals',signals,'revision',revision) FROM points_reward_events WHERE status IN ('review','reversal_pending')
 UNION ALL
 SELECT 'rewardappeal',a.id,a.created_at,'贡献积分申诉',a.user_id,1,jsonb_build_object('rewardId',a.reward_id,'amount',e.amount,'status',a.source_status,'revision',a.revision,'rewardRevision',e.revision) FROM points_reward_appeals a JOIN points_reward_events e ON e.id=a.reward_id WHERE a.status='pending'
 UNION ALL
 SELECT 'homecontent',id,created_at,payload->>'title',NULL::uuid,2,jsonb_build_object('kind',kind,'revision',revision) FROM home_content WHERE status='draft'
 UNION ALL
 SELECT 'homereport',id,created_at,'首页内容纠错待处理',user_id,0,jsonb_build_object('contentId',content_id,'revision',revision) FROM home_content_reports WHERE status='pending'
 UNION ALL SELECT 'benefit',id,created_at,snapshot->>'title',user_id,2,jsonb_build_object('revision',revision,'expiresAt',expires_at) FROM benefit_orders WHERE status='pending'
 UNION ALL SELECT 'promotion',id,created_at,title,user_id,2,jsonb_build_object('revision',revision) FROM ad_campaigns WHERE status='pending'
 UNION ALL SELECT 'advertiser',id,created_at,name,user_id,2,jsonb_build_object('revision',revision) FROM advertisers WHERE status='pending'
 UNION ALL SELECT 'industry',id,created_at,payload->>'title',user_id,2,jsonb_build_object('revision',revision,'projectId',project_id) FROM industry_entries WHERE status='pending'
 UNION ALL SELECT 'industrycredential',id,created_at,'项目主体与专项资质待核验',user_id,2,jsonb_build_object('revision',revision,'projectId',project_id) FROM industry_credentials WHERE status='pending'
 UNION ALL SELECT 'industryreport',id,created_at,'行业项目举报待核查',user_id,0,jsonb_build_object('revision',revision,'entryId',entry_id) FROM industry_reports WHERE status='pending'
 UNION ALL SELECT 'businesscase',id,updated_at,snapshot->>'title',applicant_id,0,jsonb_build_object('revision',revision,'sourceKind',source_kind) FROM business_cases WHERE status='disputed'
`;
const kinds=['publication','risk','qualification','merchant','report','appeal','privacy','contact','service','operations','points','rewardappeal','homecontent','homereport','benefit','promotion','advertiser','industry','industrycredential','industryreport','businesscase'];
function queryOptions(params){
 const kind=params.get('kind')||'',page=Number(params.get('page')||1),size=Number(params.get('size')||20);
 if(kind&&!kinds.includes(kind)||!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(size)||size<1||size>50)throw new ApiError(400,'INVALID_QUEUE_FILTER','待办筛选或分页无效');
 return {kind,page,size};
}
function attachWorkbench(repo,pool){
 repo.reviewTask=async(kind,id,role,permissions=permissionsFor(role))=>{
  requirePermission({permissions},taskPermission(kind));
  if(kind==='businesscase'&&!hasRole(role,'operator'))throw new ApiError(403,'OPERATOR_REQUIRED','双方私密业务争议仅运营处理角色可读取');
  if(!kinds.includes(kind))throw new ApiError(400,'INVALID_TASK','待办类型无效');
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const task=(await c.query(`WITH tasks AS (${tasks}) SELECT kind,id,title,user_id AS "userId",metadata FROM tasks WHERE kind=$1 AND id=$2`,[kind,id])).rows[0];
   if(!task)throw new ApiError(409,'TASK_CHANGED','任务已处理，请刷新待办');
   let detail={};
   if(kind==='businesscase'){if(!hasRole(role,'operator'))detail={description:'双方私密约定和争议仅运营处理角色按需读取。'};else detail=await repo.adminBusinessCase(id);}
   if(['benefit','promotion','advertiser','industry','industrycredential','industryreport'].includes(kind)){
    const table={benefit:'benefit_orders',promotion:'ad_campaigns',advertiser:'advertisers',industry:'industry_entries',industrycredential:'industry_credentials',industryreport:'industry_reports'}[kind];
    detail=(await c.query('SELECT * FROM '+table+' WHERE id=$1',[id])).rows[0];
    if(kind==='industry')detail.workflow=require('../../miniprogram/utils/industry-workflows').workflow(detail.project_id);
    if(['industrycredential','advertiser'].includes(kind)&&!hasRole(role,'verifier'))detail={revision:detail.revision,description:'主体和专项资料仅业务核验角色读取与核查。'};
   }
   if(kind==='homecontent'){const row=(await c.query('SELECT payload,status,revision FROM home_content WHERE id=$1',[id])).rows[0];detail={...row.payload,status:row.status,revision:row.revision};}
   if(kind==='homereport')detail=(await c.query("SELECT r.reason,r.revision,r.content_id AS \"contentId\",c.payload->>'title' title,c.revision AS \"contentRevision\",c.status AS \"contentStatus\" FROM home_content_reports r JOIN home_content c ON c.id=r.content_id WHERE r.id=$1",[id])).rows[0];
   if(['publication','qualification'].includes(kind))detail=(await c.query('SELECT title,description,revision,type,image_ids AS "imageIds" FROM publications WHERE id=$1',[id])).rows[0];
   if(kind==='service'){detail=(await c.query('SELECT title,description,image_ids AS "imageIds" FROM service_catalog WHERE id=$1',[id])).rows[0];const l=(await c.query('SELECT l.*,e.project_id,e.payload,public_service_source_ok(l.service_id) AS eligible FROM industry_service_links l JOIN industry_entries e ON e.id=l.entry_id WHERE l.service_id=$1',[id])).rows[0];if(l)detail.industryLink=l;}
   if(kind==='appeal')detail=(await c.query('SELECT reason,response,revision FROM trust_appeals WHERE id=$1',[id])).rows[0];
   if(kind==='contact')detail={description:'发布者超过48小时未处理。平台不代替用户接受联系；如存在投诉，请通过举报或风险处置流程核查。'};
   if(kind==='operations')detail={description:'任务：'+task.metadata.job+'；异常代码：'+task.metadata.code+'。请核对服务和账本，任务恢复正常后自动结案；不要直接修改积分余额。'};
   if(kind==='points')detail=(await c.query("SELECT e.publication_id AS \"publicationId\",e.publication_revision AS \"publicationRevision\",e.amount,e.status,e.rule_code AS \"ruleCode\",e.rule_snapshot AS \"ruleSnapshot\",e.signals,e.reason,e.revision,e.settle_after AS \"settleAfter\",(SELECT a.id FROM points_reward_appeals a WHERE a.reward_id=e.id AND a.status='pending') AS \"openAppealId\" FROM points_reward_events e WHERE e.id=$1",[id])).rows[0];
   if(kind==='rewardappeal'){
    detail=(await c.query('SELECT a.reason,a.revision,a.source_status,a.source_reward_revision,e.id AS "rewardId",e.revision AS "rewardRevision",e.status AS "rewardStatus",e.publication_id AS "publicationId",e.amount,a.source_reward_revision<>e.revision AS "sourceChanged" FROM points_reward_appeals a JOIN points_reward_events e ON e.id=a.reward_id WHERE a.id=$1',[id])).rows[0];
    detail.reports=(await c.query("SELECT id,reason FROM content_reports WHERE target_type='publication' AND target_id=$1 AND status='removed' ORDER BY id",[detail.publicationId])).rows;
   }
   if(kind==='qualification')detail.qualificationRevision=(await c.query('SELECT revision FROM qualification_checks WHERE user_id=$1 AND scope=$2',[task.userId,task.metadata.scope])).rows[0]?.revision||0;
   if(kind==='merchant')detail=hasRole(role,'verifier')?(await c.query('SELECT status,registration_code AS "registrationCode",license_holder AS "licenseHolder",evidence_reference AS "evidenceReference",license_file_id AS "licenseFileId" FROM merchant_applications WHERE id=$1',[id])).rows[0]:{description:'需要核验主体、经营资格和授权。请以业务资质核验角色读取私有材料。'};
   await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('workbench_task_read',$1,$2,$3)",[kind,id,role]);
   await c.query('COMMIT');return {...task,detail};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
 repo.reviewWorkbench=async({kind='',page=1,size=20,role='operator',permissions=permissionsFor(role)})=>{
  const allowedKinds=kinds.filter(value=>permissions.includes(taskPermission(value)));
  if(kind)requirePermission({permissions},taskPermission(kind));
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const counts=(await c.query(`WITH tasks AS (${tasks}) SELECT kind,count(*)::int count FROM tasks WHERE kind=ANY($1::text[]) GROUP BY kind`,[allowedKinds])).rows;
   const rows=(await c.query(`WITH tasks AS (${tasks}) SELECT kind,id,created_at AS "createdAt",title,user_id AS "userId",priority,metadata FROM tasks WHERE ($1='' OR kind=$1) AND kind=ANY($4::text[]) ORDER BY priority,created_at,kind,id LIMIT $2 OFFSET $3`,[kind,size,(page-1)*size,allowedKinds])).rows;
   await c.query('COMMIT');
   return {items:rows.map(x=>({...x,title:redact(x.title)})),counts:Object.fromEntries(counts.map(x=>[x.kind,x.count])),total:counts.filter(x=>!kind||x.kind===kind).reduce((n,x)=>n+x.count,0),page,size};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
 repo.emergencyRemove=async(id,reason,role)=>{
  const c=await pool.connect();try{
   await c.query('BEGIN');
   const r=await c.query("UPDATE publications SET status='closed',moderation_reason=$2,updated_at=now() WHERE id=$1 AND status IN ('published','pending') RETURNING id",[id,reason]);
   if(!r.rowCount)throw new ApiError(409,'CONTENT_CHANGED','信息已结束或不存在');
   await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('emergency_remove','publication',$1,$2)",[id,role+': '+reason]);
   await c.query('COMMIT');return {ok:true};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
 return repo;
}
module.exports={attachWorkbench,queryOptions,kinds,tasks};
