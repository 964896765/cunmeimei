'use strict';
const {ApiError}=require('./rules');
const defaults={theme:'prism',largeText:false,reduceMotion:false,notificationPreview:true,allowContacts:true,revision:0};
const themes=['prism','dark','clear','quiet','warm','gentle'];
function preferences(input){
 if(!themes.includes(input.theme)||!Number.isSafeInteger(input.revision)||input.revision<0||input.revision>=2147483647)throw new ApiError(400,'INVALID_PREFERENCES','主题或设置版本无效');
 for(const key of ['largeText','reduceMotion','notificationPreview','allowContacts'])if(typeof input[key]!=='boolean')throw new ApiError(400,'INVALID_PREFERENCES','设置项必须为开关值');
 return Object.fromEntries(Object.keys(defaults).map(k=>[k,input[k]]));
}
function attachPrivacyRepository(repo,pool){
 const tx=async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const columns='theme,large_text AS "largeText",reduce_motion AS "reduceMotion",notification_preview AS "notificationPreview",allow_contacts AS "allowContacts",revision';
 repo.preferences=async uid=>(await pool.query('SELECT '+columns+' FROM user_preferences WHERE user_id=$1',[uid])).rows[0]||{...defaults};
 repo.savePreferences=async(uid,v)=>tx(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['preferences:'+uid]);
  const row=(await c.query('SELECT revision FROM user_preferences WHERE user_id=$1',[uid])).rows[0];
  if((row?.revision||0)!==v.revision)throw new ApiError(409,'PREFERENCES_CONFLICT','设置已在其他设备更新，请重新读取后再保存');
  return (await c.query(`INSERT INTO user_preferences(user_id,theme,large_text,reduce_motion,notification_preview,allow_contacts)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET theme=$2,large_text=$3,reduce_motion=$4,notification_preview=$5,allow_contacts=$6,revision=user_preferences.revision+1,updated_at=now() RETURNING ${columns}`,[uid,v.theme,v.largeText,v.reduceMotion,v.notificationPreview,v.allowContacts])).rows[0];
 });
 const oldNotifications=repo.notifications;
 repo.notifications=async(uid,offset)=>{
  const [r,p]=await Promise.all([oldNotifications(uid,offset),repo.preferences(uid)]);
  if(!p.notificationPreview)r.items=r.items.map(x=>({...x,title:'你有一条新的站内通知',body:'内容摘要已隐藏，请进入对应业务查看。'}));
  return r;
 };
 repo.privacyRequests=async uid=>(await pool.query('SELECT id,kind,reason,status,response,revision,created_at AS "createdAt",updated_at AS "updatedAt" FROM privacy_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[uid])).rows;
 repo.createPrivacyRequest=async(uid,kind,reason,consentVersion=null)=>tx(async c=>{
  await require('./account-lifecycle').activeAccount(c,uid);
  if(kind==='closure'&&consentVersion!==require('./account-lifecycle').CLOSURE_CONSENT)throw new ApiError(400,'CLOSURE_CONSENT_REQUIRED','需要确认最新注销范围');
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['privacy-request:'+uid]);
  const open=(await c.query("SELECT id FROM privacy_requests WHERE user_id=$1 AND kind=$2 AND status IN ('pending','reviewing')",[uid,kind])).rows[0];
  if(open)throw new ApiError(409,'OPEN_PRIVACY_REQUEST','此类请求正在处理，请查看现有记录');
  const recent=(await c.query("SELECT count(*)::int AS n FROM privacy_requests WHERE user_id=$1 AND created_at>now()-interval '1 day'",[uid])).rows[0].n;
  if(recent>=5)throw new ApiError(429,'PRIVACY_REQUEST_LIMIT','今日请求次数已达上限，请稍后重试');
  return (await c.query('INSERT INTO privacy_requests(user_id,kind,reason,consent_version) VALUES($1,$2,$3,$4) RETURNING id,status,revision',[uid,kind,reason,consentVersion])).rows[0];
 });
 repo.cancelPrivacyRequest=async(uid,id)=>!!(await pool.query("UPDATE privacy_requests SET status='cancelled',revision=revision+1,updated_at=now() WHERE id=$1 AND user_id=$2 AND status IN ('pending','reviewing') RETURNING id",[id,uid])).rowCount;
 // Queue metadata excludes free text; opening details creates an audit record.
 repo.privacyQueue=async()=>(await pool.query("SELECT id,kind,status,revision,created_at AS \"createdAt\" FROM privacy_requests WHERE status IN ('pending','reviewing') ORDER BY created_at LIMIT 100")).rows;
 repo.privacyRequestForAdmin=async id=>tx(async c=>{
  const row=(await c.query('SELECT id,kind,reason,status,response,revision FROM privacy_requests WHERE id=$1',[id])).rows[0];
  if(row)await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('privacy_request_read','privacy_request',$1,'管理员读取用户请求详情')",[id]);
  return row;
 });
 repo.reviewPrivacyRequest=async(id,status,response,revision)=>tx(async c=>{
  const request=(await c.query('SELECT user_id,kind FROM privacy_requests WHERE id=$1',[id])).rows[0];
  if(request?.kind==='closure'&&status==='responded')throw new ApiError(409,'CLOSURE_EXECUTION_REQUIRED','账号注销必须使用执行入口；未执行时请标记处理中或说明不予受理原因');
  const row=(await c.query(`UPDATE privacy_requests SET status=$2,response=$3,revision=revision+1,updated_at=now()
   WHERE id=$1 AND revision=$4 AND (status='pending' OR (status='reviewing' AND $2<>'reviewing')) RETURNING user_id`,[id,status,response,revision])).rows[0];
  if(!row)return false;
  await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('privacy_request_'||$2::text,'privacy_request',$1,'后台处理请求；答复不代表已执行数据删除')",[id,status]);
  await c.query("INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES($1,'隐私请求有新进展','请在隐私与显示中查看处理状态及答复。','privacy',$2)",[row.user_id,id]);return true;
 });
 return repo;
}
module.exports={attachPrivacyRepository,preferences,defaults};
