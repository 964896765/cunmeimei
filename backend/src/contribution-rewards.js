'use strict';
const {ApiError,uuid}=require('./rules'),policy=require('./trust-policy');
const {transaction,post}=require('./points-repository');
const codes=['publication_approved','publication_valid_7d','publication_valid_30d','valid_favorite','accepted_contact'];
const fail=(code,message,status=409)=>{throw new ApiError(status,code,message);};
async function lockEvent(c,id){
 const source=(await c.query('SELECT user_id,actor_id,publication_id FROM points_reward_events WHERE id=$1',[id])).rows[0];
 if(!source)fail('REWARD_NOT_FOUND','贡献事件不存在',404);
 await c.query('SELECT id FROM app_users WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',[[...new Set([source.user_id,source.actor_id])]]);
 await c.query('SELECT id FROM publications WHERE id=$1 FOR SHARE',[source.publication_id]);
 return (await c.query('SELECT * FROM points_reward_events WHERE id=$1 FOR UPDATE',[id])).rows[0];
}
async function evaluate(c,e){
 const pub=(await c.query('SELECT p.*,u.status user_status FROM publications p JOIN app_users u ON u.id=p.user_id WHERE p.id=$1',[e.publication_id])).rows[0];
 if(!pub||pub.user_status!=='active'||pub.status!=='published'||pub.is_test||pub.expires_at&&new Date(pub.expires_at)<=new Date()||pub.revision!==e.publication_revision)return {invalid:'信息已失效、作者状态受限或审核版本已变化',signals:[]};
 if(!(await c.query('SELECT 1 FROM service_regions WHERE name=$1 AND enabled',[pub.district])).rows.length)return {invalid:'信息所在地区已停用',signals:[]};
 if((await c.query('SELECT 1 FROM industry_entries WHERE id=$1',[pub.id])).rows.length&&!(await c.query('SELECT 1 FROM industry_public_eligibility WHERE id=$1',[pub.id])).rows.length)return {invalid:'行业信息已失效或本项目资质不再有效',signals:[]};
 const social=['valid_favorite','accepted_contact'].includes(e.rule_code);
 if(social){
  if(e.actor_id===e.user_id)return {invalid:'作者本人的互动不计贡献积分',signals:[]};
  if(!(await c.query("SELECT 1 FROM app_users WHERE id=$1 AND status='active'",[e.actor_id])).rows.length)return {invalid:'互动账号已关闭或受限',signals:[]};
  if(e.rule_code==='valid_favorite'&&!(await c.query('SELECT 1 FROM saved_items WHERE user_id=$1 AND target_id=$2',[e.actor_id,e.publication_id])).rows.length)return {invalid:'观察期内收藏已取消',signals:[]};
  if(e.rule_code==='accepted_contact'&&!(await c.query("SELECT 1 FROM contact_requests WHERE id=$1 AND publication_id=$2 AND requester_id=$3 AND owner_id=$4 AND status='accepted' AND ended_at IS NULL",[e.source_id,e.publication_id,e.actor_id,e.user_id])).rows.length)return {invalid:'联系未接受或已经结束',signals:[]};
  if((await c.query('SELECT 1 FROM user_blocks WHERE (user_id=$1 AND blocked_user_id=$2) OR (user_id=$2 AND blocked_user_id=$1)',[e.actor_id,e.user_id])).rows.length)return {invalid:'互动双方已屏蔽',signals:[]};
 }
 const signals=[];
 const risks=(await c.query("SELECT risk_level,restrict_publish,restrict_contact FROM account_trust WHERE user_id=ANY($1::uuid[]) AND risk_until>now() AND risk_level<>'normal'",[[e.user_id,e.actor_id]])).rows;
 if(risks.some(x=>x.risk_level==='severe'&&(x.restrict_publish||x.restrict_contact)))signals.push('account_restricted');
 else if(risks.length)signals.push('account_risk');
 if((await c.query("SELECT 1 FROM risk_cases WHERE target_type='publication' AND target_id=$1 AND status='pending' AND jsonb_array_length(signals-'image_manual_review_required')>0 LIMIT 1",[e.publication_id])).rows.length)signals.push('publication_risk');
 if((await c.query("SELECT 1 FROM content_reports WHERE target_type='publication' AND target_id=$1 AND status='removed' AND id<>ALL($2::uuid[]) LIMIT 1",[e.publication_id,e.waived_report_ids||[]])).rows.length)return {invalid:'信息已被核实违规',signals:[]};
 const phones=(await c.query('SELECT user_id,number_hmac FROM verified_phones WHERE user_id=ANY($1::uuid[]) AND verified_until>now()',[[e.user_id,e.actor_id]])).rows;
 if(!phones.some(x=>x.user_id===e.user_id))signals.push('recipient_unverified');
 if(social){
  if(!phones.some(x=>x.user_id===e.actor_id))signals.push('actor_unverified');
  if(phones.length===2&&phones[0].number_hmac===phones[1].number_hmac)signals.push('same_phone');
  else if((await c.query("SELECT 1 FROM phone_binding_history a JOIN phone_binding_history b ON a.number_hmac=b.number_hmac WHERE a.user_id=$1 AND b.user_id=$2 AND a.bound_at>now()-interval '180 days' AND b.bound_at>now()-interval '180 days' LIMIT 1",[e.user_id,e.actor_id])).rows.length)signals.push('shared_phone_history');
  if((await c.query("SELECT 1 FROM points_reward_events WHERE user_id=$1 AND actor_id=$2 AND rule_code IN ('valid_favorite','accepted_contact') AND created_at>now()-interval '7 days' LIMIT 1",[e.actor_id,e.user_id])).rows.length)signals.push('reciprocal_interaction');
  if((await c.query("SELECT 1 FROM app_users WHERE id=$1 AND created_at>now()-interval '7 days' AND (SELECT count(DISTINCT user_id) FROM points_reward_events WHERE actor_id=$1 AND rule_code IN ('valid_favorite','accepted_contact') AND created_at>now()-interval '1 hour')>=3",[e.actor_id])).rows.length)signals.push('new_account_burst');
 }
 return {signals};
}
async function reverse(c,e,reason,actor){
 if(e.status==='reversed')return {status:e.status,replayed:true};
 if(!['settled','reversal_pending'].includes(e.status)||!e.ledger_id)fail('REWARD_NOT_SETTLED','贡献积分尚未结算，不能冲正');
 const account=(await c.query('SELECT available FROM points_accounts WHERE user_id=$1 FOR UPDATE',[e.user_id])).rows[0];
 if(!account||account.available<e.amount){
  if(e.status!=='reversal_pending')await c.query("UPDATE points_reward_events SET status='reversal_pending',reason=$2,signals='[\"insufficient_reversal_balance\"]',revision=revision+1,updated_at=now() WHERE id=$1",[e.id,reason]);
  return {status:'reversal_pending'};
 }
 const entry=await post(c,e.user_id,{kind:'reversal',amount:e.amount,key:'reward_reverse:'+e.id+':'+e.ledger_id,source:'reward-event:'+e.id,reason,actor,originalId:e.ledger_id});
 await c.query("UPDATE points_reward_events SET status='reversed',reversal_id=$2,reason=$3,revision=revision+1,updated_at=now() WHERE id=$1",[e.id,entry.id,reason]);
 return {status:'reversed'};
}
function rulePatch(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['revision','enabled','amount','dailyLimit','publicationDailyLimit','settlementHours','reason'].includes(k))||!Number.isSafeInteger(v.revision)||v.revision<1||typeof v.enabled!=='boolean')fail('INVALID_POINTS_RULE','积分规则或版本无效',400);
 for(const key of ['amount','dailyLimit','publicationDailyLimit'])if(!Number.isSafeInteger(v[key])||v[key]<0||v[key]>20)fail('INVALID_POINTS_RULE','积分额度必须为0–20整数',400);
 if(!Number.isSafeInteger(v.settlementHours)||v.settlementHours<24||v.settlementHours>72||v.enabled&&(v.amount<1||v.amount>v.dailyLimit||v.amount>v.publicationDailyLimit))fail('INVALID_POINTS_RULE','启用规则需满足额度限制，观察期为24–72小时',400);
 return {...v,reason:policy.note(v.reason)};
}
function attachContributionRewards(repo,pool){
 const accountSql=`SELECT coalesce(a.available,0) available,coalesce(a.held,0) held,coalesce(a.earned,0) earned,coalesce(a.spent,0) spent,coalesce((SELECT sum(amount)::int FROM points_reward_events WHERE user_id=u.id AND status IN ('pending','review')),0) pending FROM app_users u LEFT JOIN points_accounts a ON a.user_id=u.id WHERE u.id=$1`;
 repo.contributionAccount=async uid=>(await pool.query(accountSql,[uid])).rows[0]||{available:0,held:0,earned:0,spent:0,pending:0};
 repo.auditPointsAccount=(uid,page,actor)=>transaction(pool,async c=>{
  const account=(await c.query(accountSql,[uid])).rows[0];if(!account)fail('ACCOUNT_NOT_FOUND','账号不存在',404);
  await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('points_account_read','account',$1,$2)",[uid,actor]);
  return {account,items:(await c.query('SELECT id,kind,amount,available_delta,held_delta,available_after,held_after,reason,created_at FROM points_ledger WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2',[uid,page])).rows};
 });
 repo.contributionRules=async()=>(await pool.query('SELECT code,amount,daily_limit AS "dailyLimit",publication_daily_limit AS "publicationDailyLimit",settlement_hours AS "settlementHours",enabled,revision,enabled_since AS "enabledSince" FROM points_rules ORDER BY code')).rows;
 repo.configureContributionRule=(code,input,actor)=>transaction(pool,async c=>{
  if(!codes.includes(code))fail('INVALID_POINTS_RULE','规则代码无效',400);const v=rulePatch(input);
  const changed=(await c.query(`UPDATE points_rules SET amount=$2,daily_limit=$3,publication_daily_limit=$4,settlement_hours=$5,enabled=$6,enabled_since=CASE WHEN NOT enabled AND $6 THEN now() ELSE enabled_since END,revision=revision+1 WHERE code=$1 AND revision=$7 RETURNING *`,[code,v.amount,v.dailyLimit,v.publicationDailyLimit,v.settlementHours,v.enabled,v.revision])).rows[0];
  if(!changed)fail('POINTS_RULE_CHANGED','规则已被修改，请重新读取');
  const history=(await c.query('INSERT INTO points_rule_history(code,revision,snapshot,actor,reason) VALUES($1,$2,$3,$4,$5) RETURNING id',[code,changed.revision,JSON.stringify(changed),actor,v.reason])).rows[0];
  await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('points_rule_updated','points_rule',$1,$2)",[history.id,actor+': '+code+'; '+v.reason]);return {ok:true,revision:changed.revision};
 });
 repo.reviewContributionReward=(id,v,actor)=>transaction(pool,async c=>{
  if(!uuid(id)||!['approve','reject'].includes(v.decision)||!Number.isSafeInteger(v.revision)||v.confirmed!==true)fail('INVALID_REWARD_REVIEW','积分复核需当前版本和明确确认',400);
  const reason=policy.note(v.reason),e=await lockEvent(c,id);
  if(e.status!=='review'||e.revision!==v.revision)fail('REWARD_CHANGED','贡献事件已变化，请重新读取');
  const checks=await evaluate(c,e);
  if(v.decision==='approve'&&(checks.invalid||checks.signals.includes('account_restricted')))fail('REWARD_NOT_ELIGIBLE','请先处理信息失效、账号限制等事项，不能强行发分');
  await c.query('UPDATE points_reward_events SET status=$2,approved_signals=$3,reason=$4,revision=revision+1,updated_at=now() WHERE id=$1',[id,v.decision==='approve'?'pending':'rejected',v.decision==='approve'?JSON.stringify(checks.signals):null,reason]);
  await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($1,'points_reward',$2,$3)",['reward_review_'+v.decision,id,actor+': '+reason]);return {ok:true};
 });
 repo.reverseContributionReward=(id,v,actor)=>transaction(pool,async c=>{
  if(!uuid(id)||!Number.isSafeInteger(v.revision)||v.confirmed!==true)fail('INVALID_REWARD_REVERSAL','冲正需当前版本和已核实违规确认',400);
  const reason=policy.note(v.reason),e=await lockEvent(c,id);
  if(e.status==='reversed')return {status:e.status,replayed:true};
  if(e.revision!==v.revision)fail('REWARD_CHANGED','贡献事件已变化，请重新读取');
  if((await c.query("SELECT 1 FROM points_reward_appeals WHERE reward_id=$1 AND status='pending'",[id])).rows.length)fail('REWARD_APPEAL_PENDING','该笔贡献正在申诉，请先完成申诉复核');
  const result=await reverse(c,e,reason,actor);await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('reward_reversal_review','points_reward',$1,$2)",[id,actor+': '+reason]);return result;
 });
 repo.ownContributionRewards=async(uid,offset=0,id=null)=>(await pool.query("SELECT e.id,e.publication_id,e.publication_revision,e.rule_code,e.rule_revision,e.amount,e.status,e.revision,e.settle_after,e.reason,e.created_at,e.status IN ('rejected','cancelled','reversed','reversal_pending') AND NOT EXISTS(SELECT 1 FROM points_reward_appeals a WHERE a.reward_id=e.id AND a.source_reward_revision=e.revision AND a.status IN ('pending','accepted','rejected')) AS can_appeal,(SELECT a.id FROM points_reward_appeals a WHERE a.reward_id=e.id AND a.status='pending' AND a.source_reward_revision=e.revision) AS open_appeal_id FROM points_reward_events e WHERE e.user_id=$1 AND ($3::uuid IS NULL OR e.id=$3) ORDER BY e.created_at DESC,e.id DESC LIMIT 20 OFFSET $2",[uid,offset,id])).rows;
 // The optional time is for isolated integration tests; HTTP callers never control it.
 repo.processContributionRewards=async({asOf=new Date()}={})=>{
  if(!Number.isFinite(new Date(asOf).valueOf()))fail('INVALID_REWARD_TIME','结算时间无效',400);
  await transaction(pool,async c=>{
   for(const [code,days] of [['publication_valid_7d',7],['publication_valid_30d',30]]){
    const due=(await c.query(`SELECT p.id,p.user_id FROM publications p JOIN points_rules r ON r.code=$1 AND r.enabled WHERE p.status='published' AND NOT p.is_test AND r.amount>0 AND coalesce((SELECT sum(e.amount) FROM points_reward_events e WHERE e.user_id=p.user_id AND e.event_day=(now() AT TIME ZONE 'Asia/Shanghai')::date),0)+r.amount<=20 AND coalesce((SELECT sum(e.amount) FROM points_reward_events e WHERE e.user_id=p.user_id AND e.rule_code=r.code AND e.event_day=(now() AT TIME ZONE 'Asia/Shanghai')::date),0)+r.amount<=r.daily_limit AND p.reviewed_at>=r.enabled_since AND p.reviewed_at<=now()-make_interval(days=>$2) AND (p.expires_at IS NULL OR p.expires_at>now()) AND NOT EXISTS(SELECT 1 FROM points_reward_events e WHERE e.publication_id=p.id AND e.rule_code=$1 AND e.actor_id=p.user_id) ORDER BY p.reviewed_at,p.id LIMIT 100`,[code,days])).rows;
    for(const p of due)await c.query('SELECT capture_points_reward($1,$2,$3,$2)',[code,p.id,p.user_id]);
   }
  });
  const pending=(await pool.query("SELECT id FROM points_reward_events WHERE status='pending' AND settle_after<=$1 ORDER BY settle_after,id LIMIT 100",[asOf])).rows;
  let settled=0,review=0,cancelled=0,reversed=0;
  for(const {id} of pending)await transaction(pool,async c=>{
   const e=await lockEvent(c,id);if(e.status!=='pending'||new Date(e.settle_after)>new Date(asOf))return;
   const checks=await evaluate(c,e);
   if(checks.invalid){await c.query("UPDATE points_reward_events SET status='cancelled',reason=$2,revision=revision+1,updated_at=now() WHERE id=$1",[id,checks.invalid]);cancelled++;return;}
   if(checks.signals.some(s=>!(e.approved_signals||[]).includes(s))){await c.query("UPDATE points_reward_events SET status='review',signals=$2,reason='贡献事件存在风险信号，等待人工复核',revision=revision+1,updated_at=now() WHERE id=$1",[id,JSON.stringify(checks.signals)]);review++;return;}
   const entry=await post(c,e.user_id,{kind:'earn',amount:e.amount,key:'contribution_reward:'+e.id,source:'reward-event:'+e.id,reason:'有效贡献观察期结束，按事件规则快照结算',actor:'contribution_settlement'});
   await c.query("UPDATE points_reward_events SET status='settled',ledger_id=$2,reason='观察期结束，贡献积分已结算',revision=revision+1,updated_at=now() WHERE id=$1",[id,entry.id]);settled++;
  });
  const violations=(await pool.query(`SELECT e.id FROM points_reward_events e WHERE (e.status='reversal_pending' OR e.status='settled' AND EXISTS(SELECT 1 FROM content_reports r WHERE r.target_type='publication' AND r.target_id=e.publication_id AND r.status='removed' AND r.id<>ALL(e.waived_report_ids))) AND NOT EXISTS(SELECT 1 FROM points_reward_appeals a WHERE a.reward_id=e.id AND a.status='pending') ORDER BY e.updated_at,e.id LIMIT 100`)).rows;
  for(const {id} of violations)await transaction(pool,async c=>{const e=await lockEvent(c,id);if(!['settled','reversal_pending'].includes(e.status)||(await c.query("SELECT 1 FROM points_reward_appeals WHERE reward_id=$1 AND status='pending'",[id])).rows.length)return;const result=await reverse(c,e,e.status==='reversal_pending'?e.reason:'信息举报已核实违规，冲正相关贡献积分','contribution_settlement');if(result.status==='reversed')reversed++;});
  return {settled,review,cancelled,reversed};
 };
 return repo;
}
module.exports={attachContributionRewards,rulePatch,codes,lockEvent,evaluate};
