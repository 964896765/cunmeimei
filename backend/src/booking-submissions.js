'use strict';
const crypto=require('node:crypto');
const {ApiError,text,uuid}=require('./rules');
const {isBookableSlot,isValidSlotInstant}=require('./booking-window');
function key(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(value))throw new ApiError(400,'INVALID_REQUEST_KEY','预约申请标识无效，请重新打开页面。');
 return value;
}
function normalized(v){
 key(v.clientKey);
 if(!uuid(v.serviceId)||!isValidSlotInstant(v.requestedAt))throw new ApiError(400,'INVALID_TIME','预约时间或服务无效');
 return {...v,serviceId:v.serviceId.toLowerCase(),remark:text(v.remark||'',300)};
}
const fingerprint=v=>crypto.createHash('sha256').update(JSON.stringify([v.serviceId,v.requestedAt,v.remark])).digest('hex');
const reused=()=>{throw new ApiError(409,'REQUEST_KEY_REUSED','原申请的内容不能更换，请先核对原预约。');};
const failureErrors={SLOT_TAKEN:'slot_taken',SLOT_EXPIRED:'slot_expired',SERVICE_NOT_AVAILABLE:'service_unavailable',EXISTING_BOOKING_DIFFERENT:'existing_booking_different'};
const failed=(code,clientKey,replayed=false)=>({error:failureErrors[code],clientKey,replayed});
const outcome=(row,clientKey)=>row.failure_code?{rejected:true,errorCode:row.failure_code,clientKey}:{...booking(row),clientKey};
const booking=row=>({id:row.id,userId:row.user_id,serviceId:row.service_id,serviceTitle:row.service_title,requestedAt:row.requested_at,status:row.status,cancellationReason:row.system_cancellation_reason||'',remark:row.remark,holdExpiresAt:row.hold_expires_at,createdAt:row.created_at});
async function read(c,uid,clientKey){
 await c.query("UPDATE booking_requests b SET status='expired',updated_at=now() FROM booking_submissions k WHERE k.user_id=$1 AND k.client_key=$2 AND b.id=k.booking_id AND b.status='pending_confirm' AND b.hold_expires_at<=clock_timestamp()",[uid,clientKey]);
 return (await c.query('SELECT b.*,s.title AS service_title,k.payload_hash,k.failure_code FROM booking_submissions k LEFT JOIN booking_requests b ON b.id=k.booking_id AND b.user_id=k.user_id LEFT JOIN service_catalog s ON s.id=b.service_id WHERE k.user_id=$1 AND k.client_key=$2',[uid,clientKey])).rows[0];
}
function attachPgBookingSubmissions(repo,pool){
 const legacy=repo.createBooking.bind(repo);
 repo.readBookingSubmission=async(uid,value)=>{const clientKey=key(value),row=await read(pool,uid,clientKey);return row?outcome(row,clientKey):null;};
 repo.createBooking=async(uid,input)=>{
  if(input.clientKey===undefined)return legacy(uid,input);
  const v=normalized(input),hash=fingerprint(v),c=await pool.connect();
  const reject=async code=>{await c.query('INSERT INTO booking_submissions(user_id,client_key,payload_hash,failure_code) VALUES($1,$2,$3,$4)',[uid,v.clientKey,hash,code]);await c.query('COMMIT');return failed(code,v.clientKey);};
  try{
   await c.query('BEGIN');
   // Serialize the key before checking time or public service availability.
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['booking-submission:'+uid+':'+v.clientKey]);
   const previous=await read(c,uid,v.clientKey);
   if(previous){if(previous.payload_hash!==hash)reused();await c.query('COMMIT');return previous.failure_code?failed(previous.failure_code,v.clientKey,true):{...booking(previous),clientKey:v.clientKey,replayed:true};}
   const account=await c.query("SELECT id FROM app_users WHERE id=$1 AND status='active' FOR SHARE",[uid]);
   if(!account.rows.length)throw new ApiError(403,'ACCOUNT_INACTIVE','账号目前不能提交预约');
   if(!isBookableSlot(v.requestedAt))return await reject('SLOT_EXPIRED');
   const active=await c.query("SELECT s.id FROM service_catalog s LEFT JOIN verified_merchants m ON m.id=s.merchant_id JOIN service_regions r ON r.name=s.district AND r.enabled WHERE s.id=$1 AND s.status='published' AND public_service_source_ok(s.id) AND (s.merchant_id IS NULL OR m.status='active') FOR SHARE OF s",[v.serviceId]);
   if(!active.rows.length)return await reject('SERVICE_NOT_AVAILABLE');
   await c.query("UPDATE booking_requests SET status='expired',updated_at=now() WHERE service_id=$1 AND requested_at=$2 AND status='pending_confirm' AND hold_expires_at<=clock_timestamp()",[v.serviceId,v.requestedAt]);
   await c.query('SAVEPOINT booking_claim');
   let row,replayed=false;
   try{
    row=(await c.query("INSERT INTO booking_requests(user_id,service_id,requested_at,remark,hold_expires_at) SELECT $1,s.id,$3,$4,clock_timestamp()+interval '30 minutes' FROM service_catalog s JOIN service_regions r ON r.name=s.district AND r.enabled WHERE s.id=$2 AND s.status='published' AND public_service_source_ok(s.id) AND $3::timestamptz > clock_timestamp()+interval '10 minutes' RETURNING *, (SELECT title FROM service_catalog WHERE id=service_id) AS service_title",[uid,v.serviceId,v.requestedAt,v.remark])).rows[0];
   }catch(error){
    if(error.code==='P0001'&&error.message==='LINKED_SERVICE_UNAVAILABLE'){await c.query('ROLLBACK TO SAVEPOINT booking_claim');return await reject('SERVICE_NOT_AVAILABLE');}
    if(error.code!=='23505'||error.constraint!=='uq_booking_active_slot')throw error;
    await c.query('ROLLBACK TO SAVEPOINT booking_claim');
    row=(await c.query("SELECT b.*,s.title AS service_title FROM booking_requests b JOIN service_catalog s ON s.id=b.service_id WHERE b.user_id=$1 AND b.service_id=$2 AND b.requested_at=$3 AND b.status IN ('pending_confirm','confirmed') AND (b.status='confirmed' OR b.hold_expires_at>clock_timestamp()) FOR SHARE OF b",[uid,v.serviceId,v.requestedAt])).rows[0];
    if(!row)return await reject('SLOT_TAKEN');
    if(row.remark!==v.remark)return await reject('EXISTING_BOOKING_DIFFERENT');replayed=true;
   }
   if(!row){
    // Eligibility can change while the INSERT waits for a qualification lock.
    // Re-read in a fresh statement before persisting the definitive retry outcome.
    const available=await c.query("SELECT 1 FROM service_catalog s JOIN service_regions r ON r.name=s.district AND r.enabled LEFT JOIN verified_merchants m ON m.id=s.merchant_id WHERE s.id=$1 AND s.status='published' AND public_service_source_ok(s.id) AND (s.merchant_id IS NULL OR m.status='active')",[v.serviceId]);
    return await reject(available.rows.length?'SLOT_EXPIRED':'SERVICE_NOT_AVAILABLE');
   }
   await c.query('INSERT INTO booking_submissions(user_id,client_key,payload_hash,booking_id) VALUES($1,$2,$3,$4)',[uid,v.clientKey,hash,row.id]);
   await c.query('COMMIT');return {...booking(row),clientKey:v.clientKey,replayed};
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 };
 return repo;
}
function attachMemoryBookingSubmissions(repo){
 const entries=new Map(),running=new Map(),legacy=repo.createBooking.bind(repo);
 repo.readBookingSubmission=async(uid,value)=>{const clientKey=key(value),entry=entries.get(uid+':'+clientKey);if(!entry)return null;if(entry.failureCode)return {rejected:true,errorCode:entry.failureCode,clientKey};const found=(await repo.myBookings(uid)).find(b=>b.id===entry.id);return found?{...found,clientKey}:null;};
 repo.createBooking=async(uid,input)=>{
  if(input.clientKey===undefined)return legacy(uid,input);
  const v=normalized(input),hash=fingerprint(v),id=uid+':'+v.clientKey;
  if(running.has(id))await running.get(id);
  const previous=entries.get(id);
  if(previous){if(previous.hash!==hash)reused();return previous.failureCode?failed(previous.failureCode,v.clientKey,true):{...await repo.readBookingSubmission(uid,v.clientKey),replayed:true};}
  const work=(async()=>{
   const found=(await repo.myBookings(uid)).find(b=>b.serviceId===v.serviceId&&b.requestedAt===v.requestedAt&&['pending_confirm','confirmed'].includes(b.status));
   const result=found&&found.remark!==v.remark?{error:'existing_booking_different'}:await legacy(uid,v);
   if(result?.id)entries.set(id,{id:result.id,hash});
   else{const failureCode=Object.keys(failureErrors).find(code=>failureErrors[code]===(result?.error||'service_unavailable'));entries.set(id,{hash,failureCode});return failed(failureCode,v.clientKey);}
   return result?.id?{...result,clientKey:v.clientKey}:result;
  })();
  running.set(id,work);try{return await work;}finally{if(running.get(id)===work)running.delete(id);}
 };
 return repo;
}
module.exports={attachPgBookingSubmissions,attachMemoryBookingSubmissions};
