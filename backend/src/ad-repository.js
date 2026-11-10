'use strict';
const {ApiError,uuid,text}=require('./rules'),policy=require('./trust-policy');
const {transaction,post}=require('./points-repository');
const fail=(code,message,status=409)=>{throw new ApiError(status,code,message);};
async function archive(c,id,action,actor,reason){
 await c.query(`INSERT INTO ad_archive(campaign_id,action,actor,reason,snapshot)
 SELECT a.id,$2,$3,$4,jsonb_build_object('campaign',to_jsonb(a),'advertiser',to_jsonb(v),'reservation',to_jsonb(r),'slot',to_jsonb(s))
 FROM ad_campaigns a JOIN advertisers v ON v.id=a.advertiser_id LEFT JOIN ad_reservations r ON r.campaign_id=a.id LEFT JOIN ad_slots s ON s.id=r.slot_id WHERE a.id=$1`,[id,action,actor,reason]);
 await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($2,'ad_campaign',$1,$3)",[id,'ad_'+action,actor+': '+reason]);
}
function attachAds(repo,pool){
 repo.createAdvertiser=(uid,v)=>transaction(pool,async c=>{
  const name=text(v.name,100,2),reference=policy.reference(v.reference);
  return (await c.query('INSERT INTO advertisers(user_id,name,evidence_reference) VALUES($1,$2,$3) RETURNING id,status,revision',[uid,name,reference])).rows[0];
 });
 repo.verifyAdvertiser=(id,v,actor)=>transaction(pool,async c=>{
  if(v.status!==undefined&&!['verified','revoked'].includes(v.status)||!Number.isSafeInteger(v.revision)||v.revision<1)fail('INVALID_ADVERTISER_REVIEW','广告主审核状态或版本无效',400);
  if(v.manuallyVerified!==true)fail('ADVERTISER_CHECK_REQUIRED','必须核查广告主体与证明材料',400);
  const reason=policy.note(v.reason),status=v.status==='revoked'?'revoked':'verified',until=status==='verified'?policy.future(v.validUntil):null;
  const r=(await c.query('UPDATE advertisers SET status=$2,valid_until=$3,revision=revision+1 WHERE id=$1 AND revision=$4 RETURNING id',[id,status,until,v.revision])).rows[0];
  if(!r)fail('ADVERTISER_CHANGED','广告主档案已变化');
  await c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('advertiser_'||$2::text,'advertiser',$1,$3)",[id,status,actor+': '+reason]);await c.query("INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) SELECT user_id,'广告主体核验有更新','请到自助推广查看主体核验状态。','promotion',id FROM advertisers WHERE id=$1",[id]);return r;
 });
 repo.createAdCampaign=(uid,v)=>transaction(pool,async c=>{
  if(![v.advertiserId,v.imageId,v.publicationId].every(uuid))fail('INVALID_AD','广告引用无效',400);
  const own=await c.query('SELECT 1 FROM advertisers a,content_images i,publications p WHERE a.id=$1 AND a.user_id=$4 AND i.id=$2 AND i.user_id=$4 AND p.id=$3 AND p.user_id=$4',[v.advertiserId,v.imageId,v.publicationId,uid]);
  if(!own.rows.length)fail('AD_NOT_OWNED','广告引用不属于当前账号',403);
  const title=text(v.title,80,2);if(policy.signals(title).length)fail('UNSAFE_AD_TITLE','广告标题需人工调整后提交',400);
  return (await c.query('INSERT INTO ad_campaigns(user_id,advertiser_id,title,image_id,publication_id) VALUES($1,$2,$3,$4,$5) RETURNING id,status,revision',[uid,v.advertiserId,title,v.imageId,v.publicationId])).rows[0];
 });
 repo.reviewAd=(id,v,actor)=>transaction(pool,async c=>{
  if(!['approved','rejected'].includes(v.status)||!Number.isSafeInteger(v.revision))fail('INVALID_AD_REVIEW','广告审核参数无效',400);
  const reason=policy.note(v.reason);
  const row=(await c.query('SELECT * FROM ad_campaigns WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!row||row.status!=='pending'||row.revision!==v.revision)fail('AD_CHANGED','广告版本或状态已变化');
  if(v.status==='approved'){
   if(v.textReviewed!==true||v.imagesReviewed!==true||v.documentsReviewed!==true)fail('AD_CHECK_REQUIRED','必须完成广告文字、图片和证明文件核验',400);
   if(!(await c.query("SELECT 1 FROM advertisers WHERE id=$1 AND status='verified' AND valid_until>now() FOR SHARE",[row.advertiser_id])).rows.length)fail('ADVERTISER_NOT_VERIFIED','广告主未通过有效核验');
  }
  await c.query('UPDATE ad_campaigns SET status=$2,revision=revision+1 WHERE id=$1',[id,v.status]);await archive(c,id,v.status,actor,reason);await c.query("INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES($1,'推广素材审核已有结果','请到自助推广核对审核结果及可用排期。','promotion',$2)",[row.user_id,id]);return {ok:true};
 });
 repo.reserveAd=(uid,id,slotId,holdId,purchase=null)=>transaction(pool,async c=>{
  if(!uuid(slotId)||holdId&&!uuid(holdId))fail('INVALID_SLOT','广告排期参数无效',400);
  if(purchase)await require('./trust-repository').guard(c,uid,'publish',{},repo.trustOptions||{});
  const campaign=(await c.query('SELECT * FROM ad_campaigns WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,uid])).rows[0];
  if(!campaign)fail('AD_NOT_OWNED','广告不存在或不属于当前账号',404);
  const prior=(await c.query('SELECT * FROM ad_reservations WHERE campaign_id=$1',[id])).rows[0];
  if(prior){if(prior.cancelled_at)fail('AD_CANCELLED','广告排期已取消');if(prior.slot_id!==slotId||(purchase?prior.price_snapshot!==purchase.expectedCost:prior.points_entry_id!==(holdId||null)))fail('AD_RESERVATION_CONFLICT','活动已有不同排期');return prior;}
  if(!campaign||campaign.status!=='approved')fail('AD_NOT_APPROVED','广告未通过审核或已排期');
  // Serialize all inventory consumers on the slot. Reservations count even while paused.
  const slot=(await c.query('SELECT * FROM ad_slots WHERE id=$1 AND starts_at>now() FOR UPDATE',[slotId])).rows[0];
  if(!slot)fail('SLOT_UNAVAILABLE','广告时段不存在或已经开始');
  if(!(await c.query('SELECT starts_at>clock_timestamp() available FROM ad_slots WHERE id=$1',[slotId])).rows[0].available)fail('SLOT_UNAVAILABLE','等待排期锁期间该时段已经开始');
  const used=(await c.query('SELECT count(*)::int n FROM ad_reservations WHERE slot_id=$1 AND cancelled_at IS NULL',[slotId])).rows[0].n;
  if(used>=slot.capacity)fail('AD_INVENTORY_FULL','该广告时段库存已满');
  if(!(await c.query("SELECT 1 FROM advertisers WHERE id=$1 AND status='verified' AND valid_until>$2 FOR SHARE",[campaign.advertiser_id,slot.ends_at])).rows.length)fail('ADVERTISER_NOT_VERIFIED','广告主体资质须覆盖完整投放时段');
  if(purchase){
   if(!slot.enabled||slot.placement!=='home_carousel'||slot.revision!==purchase.slotRevision||slot.points_cost!==purchase.expectedCost)fail('PROMOTION_PRICE_CHANGED','排期价格或开放状态变化，请重新读取后确认');
   const target=(await c.query("SELECT 1 FROM publications p JOIN app_users u ON u.id=p.user_id AND u.status='active' JOIN service_regions r ON r.name=p.district AND r.enabled WHERE p.id=$1 AND p.user_id=$2 AND p.status='published' AND NOT p.is_test AND p.attributes->>'cityCode'=$3 AND p.district=$4 AND $5=ANY(p.image_ids) AND (p.expires_at IS NULL OR p.expires_at>$6) AND "+require('./promotion-eligibility').promotionClause('p')+"",[campaign.publication_id,uid,slot.city_code,slot.region,campaign.image_id,slot.ends_at])).rows[0];
   if(!target)fail('PROMOTION_TARGET_CHANGED','目标、城市、图片或有效期不覆盖排期');
   const held=await post(c,uid,{kind:'hold',amount:slot.points_cost,key:'promotion_hold:'+id,source:'ad-campaign:'+id,reason:'本人确认推广排期价格并冻结对应积分',actor:'owner',expiresAt:new Date(Date.now()+3600000).toISOString()});holdId=held.id;
  }
  if(holdId){
   const hold=(await c.query("SELECT * FROM points_holds WHERE id=$1 AND user_id=$2 AND status='held'",[holdId,uid])).rows[0];
   if(!hold)fail('POINTS_HOLD_REQUIRED','积分冻结不存在');
   await post(c,uid,{kind:'spend',amount:hold.amount,key:'ad_spend:'+id,source:'ad-campaign:'+id,reason:'已审核广告排期确认消费冻结积分',actor:'ad_scheduler',originalId:holdId});
  }
  await c.query('INSERT INTO ad_reservations(campaign_id,slot_id,points_entry_id,price_snapshot) VALUES($1,$2,$3,$4)',[id,slotId,holdId||null,purchase?slot.points_cost:null]);
  await c.query("UPDATE ad_campaigns SET status='scheduled',revision=revision+1 WHERE id=$1",[id]);await archive(c,id,'scheduled','ad_scheduler','已核验广告排期，库存与积分在同一事务确认');return {campaignId:id,slotId};
 });
 repo.setAdStatus=(id,v,actor)=>transaction(pool,async c=>{
  if(!['paused','scheduled','ended'].includes(v.status))fail('INVALID_AD_STATUS','广告操作无效',400);
  const reason=policy.note(v.reason);
  const r=await c.query("UPDATE ad_campaigns SET status=$2,revision=revision+1 WHERE id=$1 AND revision=$3 AND status IN ('scheduled','paused') RETURNING id",[id,v.status,v.revision]);
  if(!r.rowCount)fail('AD_CHANGED','广告版本或状态已变化');await archive(c,id,v.status,actor,reason);return {ok:true};
 });
 repo.cancelAd=(uid,id,v)=>transaction(pool,async c=>{
  const reason=policy.note(v.reason);
  const ad=(await c.query('SELECT * FROM ad_campaigns WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,uid])).rows[0];
  if(!ad)fail('AD_NOT_OWNED','广告不存在或不属于当前账号',404);
  const reservation=(await c.query('SELECT r.*,s.starts_at FROM ad_reservations r JOIN ad_slots s ON s.id=r.slot_id WHERE r.campaign_id=$1',[id])).rows[0];
  if(reservation?.cancelled_at)return {ok:true,replayed:true,refunded:!!reservation.refund_entry_id};
  if(ad.status==='ended'&&(await c.query("SELECT 1 FROM ad_archive WHERE campaign_id=$1 AND action='cancelled'",[id])).rows.length)return {ok:true,replayed:true,refunded:false};
  if(ad.revision!==v.revision||!['pending','approved','scheduled','paused'].includes(ad.status))fail('AD_CHANGED','广告版本或状态已变化');
  if(reservation&&new Date(reservation.starts_at)<=new Date())fail('AD_ALREADY_STARTED','广告已开始，请由运营核查停投及退款范围');
  let refundId=null;
  if(reservation){
   await c.query('SELECT id FROM ad_slots WHERE id=$1 FOR UPDATE',[reservation.slot_id]);
   if(!(await c.query('SELECT starts_at>clock_timestamp() available FROM ad_slots WHERE id=$1',[reservation.slot_id])).rows[0].available)fail('AD_ALREADY_STARTED','等待库存锁期间广告已经开始，请由运营核查退款');
   if(reservation.points_entry_id){
    const spend=(await c.query("SELECT id,amount FROM points_ledger WHERE original_id=$1 AND kind='spend' AND user_id=$2",[reservation.points_entry_id,uid])).rows[0];
    if(!spend)fail('AD_POINTS_INCONSISTENT','广告消费账本不完整，需要核对');
    const refund=await post(c,uid,{kind:'reversal',amount:spend.amount,key:'ad_cancel_refund:'+id,source:'ad-campaign:'+id,reason:'广告开始前取消排期，原消费全额冲正',actor:'ad_cancellation',originalId:spend.id});refundId=refund.id;
   }
   await c.query('UPDATE ad_reservations SET cancelled_at=now(),refund_entry_id=$2 WHERE campaign_id=$1',[id,refundId]);
  }
  await c.query("UPDATE ad_campaigns SET status='ended',revision=revision+1 WHERE id=$1",[id]);
  await archive(c,id,'cancelled','owner',reason);return {ok:true,replayed:false,refunded:!!refundId};
 });
 repo.expireAdCampaigns=()=>transaction(pool,async c=>{
  const ads=(await c.query("SELECT a.id FROM ad_campaigns a JOIN ad_reservations r ON r.campaign_id=a.id JOIN ad_slots s ON s.id=r.slot_id WHERE a.status IN ('scheduled','paused') AND s.ends_at<=now() ORDER BY s.ends_at,a.id LIMIT 100 FOR UPDATE OF a SKIP LOCKED")).rows;
  for(const ad of ads){await c.query("UPDATE ad_campaigns SET status='ended',revision=revision+1 WHERE id=$1",[ad.id]);await archive(c,ad.id,'expired','maintenance','排期结束，系统停止投放并归档');}
  return {processed:ads.length};
 });
 repo.deliverAds=async(region,placement)=>(await pool.query(`SELECT a.id,a.title,a.image_id AS "imageId",a.publication_id AS "publicationId",'广告' AS label
 FROM ad_campaigns a JOIN advertisers v ON v.id=a.advertiser_id AND v.status='verified' AND v.valid_until>now()
 JOIN ad_reservations r ON r.campaign_id=a.id AND r.cancelled_at IS NULL JOIN ad_slots s ON s.id=r.slot_id
 JOIN service_regions region ON region.name=s.region AND region.enabled
 JOIN publications p ON p.id=a.publication_id AND p.status='published' AND NOT p.is_test AND (p.expires_at IS NULL OR p.expires_at>now())
 WHERE a.status='scheduled' AND s.region=$1 AND s.placement=$2 AND s.starts_at<=now() AND s.ends_at>now() ORDER BY a.id LIMIT 20`,[region,placement])).rows;
 return repo;
}
module.exports={attachAds};
