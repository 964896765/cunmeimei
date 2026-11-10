'use strict';
const {ApiError,uuid}=require('./rules'),policy=require('./trust-policy');
const {transaction,post}=require('./points-repository');
const {lockEvent,evaluate}=require('./contribution-rewards');
const eligible=['rejected','cancelled','reversed','reversal_pending'];
const fail=(code,message,status=409)=>{throw new ApiError(status,code,message);};
async function notify(c,uid,id,body){await c.query("INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES($1,'积分申诉有新进展',$3,'points-appeal',$2)",[uid,id,body]);}
function attachRewardAppeals(repo,pool){
 repo.createRewardAppeal=(uid,id,v)=>transaction(pool,async c=>{
  if(!uuid(id)||!v||Object.keys(v).some(k=>!['clientKey','reason','rewardRevision'].includes(k))||!(/^[A-Za-z0-9_-]{16,64}$/.test(v.clientKey||''))||!Number.isSafeInteger(v.rewardRevision)||v.rewardRevision<1)fail('INVALID_REWARD_APPEAL','申诉编号、版本或请求标识无效',400);
  const reason=policy.note(v.reason);
  if(!(await c.query('SELECT 1 FROM points_reward_events WHERE id=$1 AND user_id=$2',[id,uid])).rows.length)fail('REWARD_UNAVAILABLE','贡献记录不存在或不属于当前账号',404);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['reward-appeal-quota:'+uid]);
  const e=await lockEvent(c,id);
  if(!(await c.query("SELECT 1 FROM app_users WHERE id=$1 AND status='active'",[uid])).rows.length)fail('ACCOUNT_INACTIVE','账号已关闭或受限',403);
  const replay=(await c.query('SELECT id,reward_id,reason,source_reward_revision,status FROM points_reward_appeals WHERE user_id=$1 AND client_key=$2',[uid,v.clientKey])).rows[0];
  if(replay){if(replay.reward_id!==id||replay.reason!==reason||replay.source_reward_revision!==v.rewardRevision)fail('APPEAL_KEY_CONFLICT','请求标识已经用于另一份申诉');return {id:replay.id,status:replay.status,replayed:true};}
  if(e.revision!==v.rewardRevision)fail('REWARD_CHANGED','贡献状态已变化，请刷新后重新申请');
  if(!eligible.includes(e.status))fail('REWARD_NOT_APPEALABLE','当前状态没有可申诉的拒绝、取消或冲正决定');
  if((await c.query("SELECT 1 FROM points_reward_appeals WHERE reward_id=$1 AND source_reward_revision=$2 AND status IN ('accepted','rejected')",[id,e.revision])).rows.length)fail('APPEAL_ALREADY_REVIEWED','同一处理版本已复核，请查看答复；补充事项可在帮助入口引用申诉编号');
  const open=(await c.query("SELECT * FROM points_reward_appeals WHERE reward_id=$1 AND status='pending' FOR UPDATE",[id])).rows[0];
  if(open&&open.source_reward_revision===e.revision)fail('OPEN_REWARD_APPEAL','该笔贡献的申诉正在处理，请查看原记录');
  if(open){await c.query("UPDATE points_reward_appeals SET status='superseded',resolution='source_changed',response='贡献状态发生变化，原申诉已归档，以新版本申请为准。',revision=revision+1,reviewed_at=now() WHERE id=$1",[open.id]);}
  const count=(await c.query("SELECT count(*)::int n FROM points_reward_appeals WHERE user_id=$1 AND created_at>now()-interval '1 day'",[uid])).rows[0].n;
  if(count>=5)fail('REWARD_APPEAL_LIMIT','今日申诉次数已达上限，请稍后再试',429);
  const row=(await c.query('INSERT INTO points_reward_appeals(reward_id,user_id,client_key,reason,source_reward_revision,source_status,ledger_before,reversal_before) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status',[id,uid,v.clientKey,reason,e.revision,e.status,e.ledger_id,e.reversal_id])).rows[0];
  return {...row,replayed:false};
 });
 repo.ownRewardAppeals=async(uid,offset=0,id=null)=>(await pool.query('SELECT a.id,a.reward_id,a.reason,a.source_status,a.source_reward_revision,a.status,a.response,a.resolution,a.created_at,a.reviewed_at,e.revision AS reward_revision,e.status AS reward_status,a.source_reward_revision<>e.revision AS source_changed FROM points_reward_appeals a JOIN points_reward_events e ON e.id=a.reward_id WHERE a.user_id=$1 AND ($3::uuid IS NULL OR a.id=$3) ORDER BY a.created_at DESC,a.id DESC LIMIT 20 OFFSET $2',[uid,offset,id])).rows;
 repo.withdrawRewardAppeal=(uid,id)=>transaction(pool,async c=>{
  const a=(await c.query('SELECT reward_id FROM points_reward_appeals WHERE id=$1 AND user_id=$2',[id,uid])).rows[0];if(!a)fail('APPEAL_UNAVAILABLE','申诉不存在或不属于当前账号',404);
  await lockEvent(c,a.reward_id);
  const row=(await c.query("UPDATE points_reward_appeals SET status='withdrawn',resolution='withdrawn',revision=revision+1,reviewed_at=now() WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING id",[id,uid])).rows[0];if(!row){if((await c.query("SELECT 1 FROM points_reward_appeals WHERE id=$1 AND user_id=$2 AND status='withdrawn'",[id,uid])).rows.length)return {ok:true,replayed:true};fail('APPEAL_CHANGED','申诉已被处理');}return {ok:true,replayed:false};
 });
 repo.reviewRewardAppeal=(id,v,actor)=>transaction(pool,async c=>{
  if(!uuid(id)||!v||!['accepted','rejected'].includes(v.status)||!Number.isSafeInteger(v.revision)||!Number.isSafeInteger(v.rewardRevision)||v.confirmed!==true)fail('INVALID_APPEAL_REVIEW','需要当前版本、处理结果和明确核查确认',400);
  const reason=policy.note(v.response),source=(await c.query('SELECT reward_id FROM points_reward_appeals WHERE id=$1',[id])).rows[0];if(!source)fail('APPEAL_UNAVAILABLE','申诉不存在',404);
  const e=await lockEvent(c,source.reward_id),a=(await c.query('SELECT * FROM points_reward_appeals WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(a.status!=='pending'){if(![v.status,'superseded'].includes(a.status))fail('APPEAL_CHANGED','申诉已作出其他处理，不能覆盖决定');return {ok:true,status:a.status,resolution:a.resolution,replayed:true};}
  if(a.revision!==v.revision||e.revision!==v.rewardRevision)fail('APPEAL_CHANGED','申诉或贡献记录已变化，请重新读取');
  let status=v.status,resolution='denied',entry=null,snapshot={rewardStatus:e.status,rewardRevision:e.revision,ledgerId:e.ledger_id,reversalId:e.reversal_id};
  if(a.source_reward_revision!==e.revision){status='superseded';resolution='source_changed';}
  else if(status==='accepted'){
   if(!eligible.includes(e.status))fail('APPEAL_NOT_ELIGIBLE','当前贡献状态不再适用本申诉');
   if(!(await c.query("SELECT 1 FROM app_users WHERE id=$1 AND status='active'",[e.user_id])).rows.length)fail('ACCOUNT_INACTIVE','账号已关闭或受限，不能恢复权益',403);
   if((await c.query("SELECT 1 FROM account_trust WHERE user_id=ANY($1::uuid[]) AND risk_level='severe' AND risk_until>now() AND (restrict_publish OR restrict_contact)",[[e.user_id,e.actor_id]])).rows.length)fail('REWARD_NOT_ELIGIBLE','请先处理仍在生效的严重行为限制');
   const reportIds=(await c.query("SELECT id FROM content_reports WHERE target_type='publication' AND target_id=$1 AND status='removed' ORDER BY id",[e.publication_id])).rows.map(x=>x.id);
   if(['reversed','reversal_pending'].includes(e.status)){
    if(v.historicalContributionConfirmed!==true)fail('HISTORICAL_REVIEW_REQUIRED','必须核实该笔贡献当时有效，不能直接恢复历史奖励',400);
    if(!Array.isArray(v.reviewedReportIds)||v.reviewedReportIds.some(x=>!uuid(x))||JSON.stringify([...new Set(v.reviewedReportIds)].sort())!==JSON.stringify([...reportIds].sort()))fail('REPORT_EVIDENCE_CHANGED','相关举报已变化，请逐项核对最新证据后再处理');
    const original=(await c.query("SELECT id FROM points_ledger WHERE id=$1 AND user_id=$2 AND kind='earn' AND amount=$3 AND source=$4",[e.ledger_id,e.user_id,e.amount,'reward-event:'+e.id])).rows[0];if(!original)fail('REWARD_LEDGER_MISMATCH','奖励账本关联异常，需先核对');
    if(e.status==='reversed'){
     if(!(await c.query("SELECT 1 FROM points_ledger WHERE id=$1 AND original_id=$2 AND kind='reversal' AND amount=$3",[e.reversal_id,e.ledger_id,e.amount])).rows.length)fail('REWARD_LEDGER_MISMATCH','原冲正记录异常，不能恢复');
     entry=await post(c,e.user_id,{kind:'earn',amount:e.amount,key:'reward_restore:'+a.id,source:'reward-event:'+e.id,reason:'奖励申诉成立，追加恢复原贡献积分',actor});resolution='restored';
    }else resolution='reversal_cancelled';
    await c.query("UPDATE points_reward_events SET status='settled',ledger_id=$2,reversal_id=NULL,waived_report_ids=$3,reason=$4,revision=revision+1,updated_at=now() WHERE id=$1",[e.id,entry?.id||e.ledger_id,[...new Set([...(e.waived_report_ids||[]),...reportIds])],reason]);
   }else{
    const checks=await evaluate(c,e);if(checks.invalid||checks.signals.includes('account_restricted'))fail('REWARD_NOT_ELIGIBLE','原审核版本或互动已失效，需先核查原业务决定，不能强行发分');
    await c.query("UPDATE points_reward_events SET status='pending',approved_signals=$2,reason=$3,revision=revision+1,updated_at=now() WHERE id=$1",[e.id,JSON.stringify(checks.signals),reason]);resolution='queued';
   }
   snapshot={...snapshot,reportIds,restoredLedgerId:entry?.id||null};
  }
  const response=status==='superseded'?'贡献状态已变化，原申诉已归档。请根据最新记录提交补充申请。':reason;
  await c.query('UPDATE points_reward_appeals SET status=$2,response=$3,resolution=$4,restored_ledger_id=$5,resolution_snapshot=$6,reviewed_by=$7,reviewed_at=now(),revision=revision+1 WHERE id=$1',[id,status,response,resolution,entry?.id||null,JSON.stringify(snapshot),actor]);
  await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($1,'reward_appeal',$2,$3)",['reward_appeal_'+status,id,actor+': '+response]);
  await notify(c,a.user_id,id,status==='accepted'?'申诉复核完成，请在积分明细查看权益处理结果。':status==='superseded'?'贡献状态发生变化，请查看申诉说明。':'申诉已有处理答复，请查看核查说明。');
  return {ok:true,status,resolution,replayed:false};
 });
 return repo;
}
module.exports={attachRewardAppeals,eligible};
