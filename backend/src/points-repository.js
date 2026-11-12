'use strict';
const {ApiError}=require('./rules'),policy=require('./trust-policy');
const fail=(code,message,status=409)=>{throw new ApiError(status,code,message);};
function ledgerSource(value, kind) {
 const internal = /^(ad-campaign|reward-event|benefit-order|points-hold):([0-9a-f-]{36})$/i.exec(String(value || ''));
 // Internal record IDs can contain a phone-shaped digit sequence by chance.
 // Manual adjustments continue to use the external evidence-reference checks.
 if (kind !== 'adjustment' && internal && require('./rules').uuid(internal[2])) return value;
 return policy.reference(value);
}
async function transaction(pool,fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
// One account lock orders all postings, including concurrent retries and holds.
async function post(c,uid,v){
 if(!Number.isSafeInteger(v.amount)||v.amount<1||v.amount>1000000||!['earn','hold','release','spend','reversal','adjustment'].includes(v.kind)||!(/^[A-Za-z0-9:_-]{16,160}$/.test(v.key||'')))fail('INVALID_POINTS_EVENT','积分事件参数无效',400);
 const reason=policy.note(v.reason),source=ledgerSource(v.source,v.kind),actor=String(v.actor||'system').slice(0,40);
 if(v.originalId&&!require('./rules').uuid(v.originalId))fail('INVALID_POINTS_REFERENCE','原始积分记录编号无效',400);
 const requestHash=require('node:crypto').createHash('sha256').update(JSON.stringify([uid,v.kind,v.amount,source,reason,v.originalId||null,!!v.debit,v.expiresAt||null])).digest('hex');
 if(['earn','hold','spend','adjustment'].includes(v.kind)){
  const active=(await c.query('SELECT status FROM app_users WHERE id=$1 FOR SHARE',[uid])).rows[0];
  if(active?.status!=='active')fail('ACCOUNT_INACTIVE','已关闭或受限账号不能新增积分收入、冻结或消费',403);
 }
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['points:'+v.key]);
 await c.query('INSERT INTO points_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING',[uid]);
 const account=(await c.query('SELECT * FROM points_accounts WHERE user_id=$1 FOR UPDATE',[uid])).rows[0];
 const previous=(await c.query('SELECT * FROM points_ledger WHERE idempotency_key=$1',[v.key])).rows[0];
 if(previous){if(previous.request_hash!==requestHash)fail('POINTS_KEY_CONFLICT','幂等标识已用于不同事件');return previous;}
 let da=0,dh=0,de=0,ds=0;
 if(v.kind==='earn'){da=v.amount;de=v.amount;}
 if(v.kind==='adjustment')da=v.amount*(v.debit?-1:1);
 if(v.kind==='hold'){da=-v.amount;dh=v.amount;if(!v.expiresAt||new Date(v.expiresAt)<=new Date()||!Number.isFinite(Date.parse(v.expiresAt)))fail('INVALID_HOLD_EXPIRY','冻结到期时间无效',400);}
 if(['release','spend'].includes(v.kind)){
  const hold=(await c.query("SELECT * FROM points_holds WHERE id=$1 AND user_id=$2 AND status='held' FOR UPDATE",[v.originalId,uid])).rows[0];
  if(!hold||hold.amount!==v.amount)fail('POINTS_HOLD_CHANGED','冻结记录不存在、已处理或金额不同');
  if(v.kind==='spend'&&new Date(hold.expires_at)<=new Date())fail('POINTS_HOLD_EXPIRED','冻结已超时，须退还后重新申请');
  dh=-v.amount;if(v.kind==='release')da=v.amount;else ds=v.amount;
  await c.query('UPDATE points_holds SET status=$2 WHERE id=$1',[v.originalId,v.kind==='release'?'released':'spent']);
 }
 if(v.kind==='reversal'){
  const old=(await c.query("SELECT * FROM points_ledger WHERE id=$1 AND user_id=$2 AND kind IN ('earn','spend')",[v.originalId,uid])).rows[0];
  if(!old||old.amount!==v.amount)fail('INVALID_REVERSAL','只能对原始发放或消费全额冲正');
  if((await c.query("SELECT 1 FROM points_ledger WHERE original_id=$1 AND kind='reversal'",[old.id])).rows.length)fail('ALREADY_REVERSED','该积分记录已冲正');
  if(old.kind==='earn'){da=-v.amount;de=-v.amount;}else{da=v.amount;ds=-v.amount;}
 }
 if(account.available+da<0||account.held+dh<0)fail('INSUFFICIENT_POINTS','积分余额不足');
 const row=(await c.query(`INSERT INTO points_ledger(user_id,kind,amount,available_delta,held_delta,earned_delta,spent_delta,available_after,held_after,idempotency_key,source,reason,actor,original_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[uid,v.kind,v.amount,da,dh,de,ds,account.available+da,account.held+dh,v.key,source,reason,actor,v.originalId||null,requestHash])).rows[0];
 await c.query('UPDATE points_accounts SET available=available+$2,held=held+$3,earned=earned+$4,spent=spent+$5 WHERE user_id=$1',[uid,da,dh,de,ds]);
 await c.query("INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES($1,'积分记录有更新','请到我的积分查看本次账本变动。','points-ledger',$2)",[uid,row.id]);
 if(v.kind==='hold')await c.query('INSERT INTO points_holds(id,user_id,amount,expires_at) VALUES($1,$2,$3,$4)',[row.id,uid,v.amount,v.expiresAt]);
 await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('points_'||$2::text,'points_ledger',$1,$3)",[row.id,v.kind,actor+': '+reason+'; '+source]);
 return row;
}
function attachPoints(repo,pool){
 repo.postPoints=(uid,v)=>transaction(pool,c=>post(c,uid,v));
 repo.pointsAccount=async uid=>(await pool.query('SELECT available,held,earned,spent FROM points_accounts WHERE user_id=$1',[uid])).rows[0]||{available:0,held:0,earned:0,spent:0};
 repo.pointsLedger=async(uid,offset=0,id=null)=>(await pool.query('SELECT id,kind,amount,available_delta,held_delta,available_after,held_after,reason,created_at FROM points_ledger WHERE user_id=$1 AND ($3::uuid IS NULL OR id=$3) ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2',[uid,offset,id])).rows;
 repo.reconcilePoints=async()=>(await pool.query(`SELECT a.user_id FROM points_accounts a LEFT JOIN points_ledger l ON l.user_id=a.user_id GROUP BY a.user_id HAVING a.available<>coalesce(sum(l.available_delta),0) OR a.held<>coalesce(sum(l.held_delta),0) OR a.earned<>coalesce(sum(l.earned_delta),0) OR a.spent<>coalesce(sum(l.spent_delta),0)`)).rows;
 repo.releaseExpiredPointsHolds=async()=>{
  const candidates=(await pool.query("SELECT id,user_id,amount FROM points_holds WHERE status='held' AND expires_at<=now() ORDER BY expires_at,id LIMIT 100")).rows;
  let processed=0;
  for(const hold of candidates){try{
   await transaction(pool,c=>post(c,hold.user_id,{kind:'release',amount:hold.amount,key:'expired_hold:'+hold.id,source:'points-hold:'+hold.id,reason:'积分冻结到期，系统自动释放可用余额',actor:'maintenance',originalId:hold.id}));processed++;
  }catch(e){if(e.code!=='POINTS_HOLD_CHANGED')throw e;}}
  return {processed};
 };
 return repo;
}
module.exports={attachPoints,post,transaction,ledgerSource};
