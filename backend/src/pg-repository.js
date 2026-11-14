'use strict';
const {Pool}=require('pg');
const {pgOperations}=require('./operations-pg');
const {createMerchantApplication}=require('./merchant-application-pg');
const {literalSearchPattern}=require('./search-pattern');
const {toPublicItem}=require('./public-item');
const {isBookableSlot,isValidSlotInstant}=require('./booking-window');
function createPgRepository(connectionString, options={}){
 if(!connectionString)throw Error('DATABASE_URL required for PostgreSQL mode');
 const pool=new Pool({connectionString,max:10,connectionTimeoutMillis:5000,...options});
 // pg evicts the idle connection before emitting this event. Keep the API alive
 // so the next request can connect again; never log the driver message/DSN.
 pool.on('error',()=>console.error('[database-idle-connection-error]'));
 const informationScopeSql=require('./public-information-policy').eligibilitySql('p');
 const one=async(sql,args=[])=> (await pool.query(sql,args)).rows[0]||null;
 const many=async(sql,args=[])=> (await pool.query(sql,args)).rows;
 function pub(x){return x&&{id:x.id,userId:x.user_id,type:x.type,title:x.title,detail:x.description,description:x.description,price:x.price,district:x.district,status:x.status,moderationReason:x.moderation_reason,createdAt:x.created_at,updatedAt:x.updated_at,revision:x.revision,attributes:x.attributes||{},imageIds:x.image_ids||[],expiresAt:x.expires_at};}
 function application(x){return x&&{id:x.id,userId:x.user_id,name:x.name,category:x.category,district:x.district,status:x.status,registrationCode:x.registration_code,licenseHolder:x.license_holder,evidenceReference:x.evidence_reference,reviewerNote:x.reviewer_note,createdAt:x.created_at,licenseFileId:x.license_file_id};}
 function book(x){return x&&{id:x.id,userId:x.user_id,serviceId:x.service_id,serviceTitle:x.service_title,requestedAt:x.requested_at,status:x.status,cancellationReason:x.system_cancellation_reason||'',remark:x.remark,holdExpiresAt:x.hold_expires_at,createdAt:x.created_at};}
 const repository = {
 async recordAdminAccess(event){await pool.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES('admin_access','admin_session',$1,$2)",[event.sessionId,JSON.stringify(event)]);},
 ...require('./search-popularity').pgSearchPopularity(pool),
 ...pgOperations(pool),
 // Bootstrap once only on an empty region table; later edits persist independently of env changes.
 async seedRegions(names){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['city-life-initial-regions']);const count=await c.query('SELECT count(*)::int AS n FROM service_regions');if(!count.rows[0].n){for(const name of [...new Set(names)])await c.query('INSERT INTO service_regions(name) VALUES($1) ON CONFLICT(name) DO NOTHING',[name]);}await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},
 async listRegions(){return (await many('SELECT name,enabled FROM service_regions ORDER BY created_at,name')).map(x=>({name:x.name,enabled:x.enabled}));},
 async addRegion(name){const c=await pool.connect();try{await c.query('BEGIN');const r=(await c.query('INSERT INTO service_regions(name) VALUES($1) ON CONFLICT(name) DO NOTHING RETURNING name,enabled',[name])).rows[0];if(r)await c.query('INSERT INTO configuration_audit(action,item_key,detail) VALUES($1,$2,$3)',['region_add',name,'enabled=true']);await c.query('COMMIT');return r||null;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},
 async setRegionEnabled(name,enabled){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['city-life-region-switch']);const item=(await c.query('SELECT name,enabled FROM service_regions WHERE name=$1 FOR UPDATE',[name])).rows[0];if(!item){await c.query('ROLLBACK');return null;}if(!enabled&&item.enabled){const active=await c.query('SELECT count(*)::int AS n FROM service_regions WHERE enabled=true');if(active.rows[0].n<=1){await c.query('ROLLBACK');return false;}}const row=(await c.query('UPDATE service_regions SET enabled=$2,updated_at=now() WHERE name=$1 RETURNING name,enabled',[name,enabled])).rows[0];await c.query('INSERT INTO configuration_audit(action,item_key,detail) VALUES($1,$2,$3)',['region_status',name,'enabled='+enabled]);await c.query('COMMIT');return row;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},
 async listCategories(){return many('SELECT id,name,enabled,restricted FROM business_categories ORDER BY id');},
 async setCategoryEnabled(id,enabled){const c=await pool.connect();try{await c.query('BEGIN');const r=(await c.query('UPDATE business_categories SET enabled=$2,updated_at=now() WHERE id=$1 AND NOT (restricted AND $2=true) RETURNING id,name,enabled,restricted',[id,enabled])).rows[0];if(r)await c.query('INSERT INTO configuration_audit(action,item_key,detail) VALUES($1,$2,$3)',['category_status',id,'enabled='+enabled]);await c.query('COMMIT');return r||null;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},

 async verifySchema(){const {checkMigrations}=require('./schema-migrations');const status=await checkMigrations(pool);if(!status.ok)throw Error('Database migrations missing or drifted: '+JSON.stringify(status));return status;},
 async upsertIdentity(provider,openid){const c=await pool.connect();try{await c.query('BEGIN');
   // Serialize first-time login per provider identity, preventing orphan app_users on concurrent login.
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[provider+':'+openid]);
   if((await c.query('SELECT 1 FROM closed_identity_fingerprints WHERE fingerprint=$1',[require('./account-lifecycle').identityFingerprint(provider,openid)])).rows.length)throw new (require('./rules').ApiError)(403,'ACCOUNT_CLOSED','该登录身份对应的账号已注销，无法自动恢复');
   const existing=await c.query('SELECT user_id FROM app_identities WHERE provider=$1 AND provider_id=$2',[provider,openid]);if(existing.rows[0]){await c.query('COMMIT');return existing.rows[0].user_id;}const user=await c.query('INSERT INTO app_users DEFAULT VALUES RETURNING id');const r=await c.query('INSERT INTO app_identities(provider,provider_id,user_id) VALUES($1,$2,$3) ON CONFLICT(provider,provider_id) DO NOTHING RETURNING user_id',[provider,openid,user.rows[0].id]);const actual=r.rows[0]?.user_id||(await c.query('SELECT user_id FROM app_identities WHERE provider=$1 AND provider_id=$2',[provider,openid])).rows[0].user_id;await c.query('COMMIT');return actual;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},
 async newSession(uid,hash,expire,consent=null){return require('./points-repository').transaction(pool,async c=>{const account=(await c.query('SELECT status FROM app_users WHERE id=$1 FOR SHARE',[uid])).rows[0];if(account?.status!=='active')throw new (require('./rules').ApiError)(403,'ACCOUNT_INACTIVE','账号已关闭或受限');await c.query('INSERT INTO app_sessions(token_sha256,user_id,expires_at) VALUES($1,$2,$3)',[hash,uid,expire]);if(consent)await c.query('INSERT INTO login_consent_events(user_id,terms_version,privacy_version,document_hash) VALUES($1,$2,$3,$4)',[uid,consent.termsVersion,consent.privacyVersion,consent.hash]);});},
 async authenticate(hash){const r=await one("SELECT s.user_id FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_sha256=$1 AND s.expires_at>now() AND u.status='active'",[hash]);return r?.user_id||null;},
 async revokeSession(hash){return !!(await one('DELETE FROM app_sessions WHERE token_sha256=$1 RETURNING token_sha256',[hash]));},
 async ping(){await pool.query('SELECT 1');return true;},
 async listFeed({type='all',channel='',area='全部地区',q='',limit=100,offset=0,sort='latest',includeTest=false,categoryId='',cityCode='',districtCode='',latitude,longitude,days=0,radiusKm=0,images='all',publicOnly=false,refinements={}}){
  const nearby=sort==='distance'||radiusKm>0,located=nearby||publicOnly,social=['recommended','popular'].includes(sort);
  if(nearby){latitude=require('./geography').number(latitude,-90,90);longitude=require('./geography').number(longitude,-180,180);}
  const ordering={
   latest:'created_at DESC,id DESC',
   price_low:'amount ASC NULLS LAST,created_at DESC,id DESC',
   price_high:'amount DESC NULLS LAST,created_at DESC,id DESC',
   popular:'saved_count DESC,created_at DESC,id DESC',
   recommended:"CASE WHEN title ILIKE $3 THEN 1 ELSE 0 END DESC,(saved_count+1)::float8/(1+GREATEST(0,extract(epoch FROM (now()-created_at))/86400)) DESC,created_at DESC,id DESC",
   distance:'distance_km ASC,created_at DESC,id DESC'
  }[sort]||'created_at DESC,id DESC';
  const favorites=social?"LEFT JOIN (SELECT f.target_id,count(*)::int AS saved_count FROM saved_items f JOIN app_users u ON u.id=f.user_id AND u.status='active' GROUP BY f.target_id) favorites ON favorites.target_id=feed.id":'';
  const location=located?"JOIN public_map_locations location ON location.item_id=feed.id AND location.approved AND feed.origin IN ('catalog','merchant') AND location.kind=CASE WHEN feed.origin='catalog' THEN 'service' ELSE 'merchant' END":'';
  const distance=nearby?"12742*asin(sqrt(LEAST(1,power(sin(radians(location.latitude-$12::float8)/2),2)+cos(radians($12::float8))*cos(radians(location.latitude))*power(sin(radians(location.longitude-$13::float8)/2),2))))":'NULL::float8';
  const args=[type,area,literalSearchPattern(q),limit,offset,includeTest,categoryId,cityCode,districtCode,days,radiusKm];if(nearby)args.push(latitude,longitude);
  const browsingChannel=require('../../miniprogram/utils/discovery-channels').definitions.find(value=>value.id===channel);
  let channelCondition='';
  if(browsingChannel){
   args.push(browsingChannel.industries);
   const categoriesParameter='$'+args.length;
   args.push(channel);
   const channelParameter='$'+args.length;
   channelCondition="AND (LEFT(feed.category_id,3)=ANY("+categoriesParameter+"::text[]) OR (coalesce(feed.category_id,'')='' AND (feed.type="+channelParameter+" OR ("+channelParameter+"='public' AND feed.type='community'))))";
  }
  // Filter before LIMIT/OFFSET so pages and hasMore describe the same result set.
  const imageCondition=images==='with'?"AND (EXISTS(SELECT 1 FROM publications pictured JOIN content_images picture ON picture.id=ANY(pictured.image_ids) WHERE pictured.id=feed.id AND feed.origin='publication') OR EXISTS(SELECT 1 FROM service_catalog pictured JOIN verified_merchants merchant ON merchant.id=pictured.merchant_id AND merchant.status='active' JOIN content_images picture ON picture.id=ANY(pictured.image_ids) WHERE pictured.id=feed.id AND feed.origin='catalog'))":'';
  const refinementCondition=require('./discovery-refinement-query').sql(refinements,args,{attributes:'ranked.attributes',policy:'ranked.policy',amount:'ranked.amount',origin:'ranked.origin',type:'ranked.type',startsAt:'ranked.starts_at',endsAt:'ranked.ends_at'});
  const rows=await many(`SELECT * FROM (SELECT feed.*,${social?'coalesce(favorites.saved_count,0)':'0'} AS saved_count,${distance} AS distance_km,CASE WHEN regexp_replace(feed.price,'[¥￥ ,]','','g') ~ '^[0-9]+([.][0-9]{1,2})?$' THEN regexp_replace(feed.price,'[¥￥ ,]','','g')::numeric ELSE NULL END AS amount FROM (
   SELECT p.id,COALESCE(ie.channel,p.type) AS type,p.title,p.description,p.district,p.price,p.created_at,'publication'::text AS origin,p.is_test,p.attributes->>'categoryId' AS category_id,p.attributes->>'cityCode' AS city_code,p.attributes->>'districtCode' AS district_code,p.attributes,coalesce(ie.policy,CASE WHEN p.type='community' THEN 'COMMUNITY' ELSE '' END) AS policy,ie.starts_at,ie.ends_at FROM publications p JOIN service_regions r ON r.name=p.district AND r.enabled=true LEFT JOIN industry_entries ie ON ie.id=p.id WHERE p.status='published' AND ${informationScopeSql} AND (p.expires_at IS NULL OR p.expires_at>now()) AND (ie.id IS NULL OR EXISTS(SELECT 1 FROM industry_public_eligibility eligible WHERE eligible.id=ie.id)) AND NOT EXISTS(SELECT 1 FROM industry_service_eligibility link JOIN service_catalog linked ON linked.id=link.service_id AND linked.status='published' WHERE link.entry_id=p.id)
   UNION ALL SELECT s.id,'service',s.title,s.description,s.district,s.price,s.created_at,'catalog',s.is_test,coalesce(se.project_id,nullif(gl.category_id,'')),coalesce(se.payload->>'cityCode',gl.city_code),coalesce(se.payload->>'districtCode',gl.district_code),jsonb_build_object('industryFields',coalesce(se.payload->'fields','{}'::jsonb)),coalesce(se.policy,''),se.starts_at,se.ends_at FROM service_catalog s LEFT JOIN industry_service_links sl ON sl.service_id=s.id LEFT JOIN industry_entries se ON se.id=sl.entry_id LEFT JOIN public_map_locations gl ON gl.item_id=s.id AND gl.approved LEFT JOIN verified_merchants vm ON vm.id=s.merchant_id JOIN service_regions r ON r.name=s.district AND r.enabled=true WHERE (s.merchant_id IS NULL OR vm.status='active') AND s.status='published' AND public_service_source_ok(s.id)
   UNION ALL SELECT m.id,'merchant',m.name,m.category,m.district,''::varchar,m.created_at,'merchant',m.is_test,gl.category_id,gl.city_code,gl.district_code,'{}'::jsonb,'MERCHANT'::text,NULL::timestamptz,NULL::timestamptz FROM verified_merchants m LEFT JOIN public_map_locations gl ON gl.item_id=m.id AND gl.approved JOIN service_regions r ON r.name=m.district AND r.enabled=true WHERE m.status='active'
  ) feed ${favorites} ${location} WHERE ($10::int=0 OR feed.created_at>=now()-make_interval(days=>$10::int)) AND ($8='' OR feed.city_code=$8) AND ($9='' OR feed.district_code LIKE $9||'%') AND ($7='' OR feed.category_id LIKE $7||'%') AND ($6::boolean OR NOT feed.is_test) AND ($1='all' OR feed.type=$1 OR ($1='public' AND feed.type='community')) AND ($2='全部地区' OR feed.district=$2) ${imageCondition} ${channelCondition} AND (feed.title ILIKE $3 OR feed.description ILIKE $3 OR feed.district ILIKE $3)) ranked WHERE ($11::float8=0 OR distance_km<=$11::float8) ${refinementCondition} ORDER BY ${ordering} LIMIT $4 OFFSET $5`,args);
  return rows.map(x=>({...toPublicItem(x,x.origin),...(nearby?{distanceKm:Math.round(Number(x.distance_km)*10)/10}:{})}));
 },
 async getItem(id){const row=await one("SELECT p.id,p.type,p.title,p.description,p.district,p.price,'publication'::text AS origin FROM publications p JOIN service_regions r ON r.name=p.district AND r.enabled=true WHERE p.id=$1 AND "+informationScopeSql+" AND p.status='published' AND (p.expires_at IS NULL OR p.expires_at>now()) AND (NOT EXISTS(SELECT 1 FROM industry_entries ie WHERE ie.id=p.id) OR EXISTS(SELECT 1 FROM industry_public_eligibility ok WHERE ok.id=p.id)) UNION ALL SELECT s.id,'service' AS type,s.title,s.description,s.district,s.price,'catalog'::text AS origin FROM service_catalog s LEFT JOIN verified_merchants vm ON vm.id=s.merchant_id JOIN service_regions r ON r.name=s.district AND r.enabled=true WHERE (s.merchant_id IS NULL OR vm.status='active') AND s.id=$1 AND s.status='published' AND public_service_source_ok(s.id)",[id]);return row?toPublicItem(row,row.origin):null;},
 async createPublication(uid,v){return pub(await one('INSERT INTO publications(user_id,type,title,description,district,price) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[uid,v.type,v.title,v.description,v.district,v.price]));},
 async myPublications(uid){return (await many('SELECT * FROM publications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[uid])).map(pub);},
 async updatePublication(uid,id,v,expectedRevision){const c=await pool.connect();try{await c.query('BEGIN');
  const current=(await c.query('SELECT type,status,revision FROM publications WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,uid])).rows[0];
  if(!current||!['pending','published','rejected'].includes(current.status)||current.type!==v.type){await c.query('ROLLBACK');return false;}
  if(current.revision!==expectedRevision){await c.query('ROLLBACK');return {error:'revision_conflict'};}
  const row=(await c.query("UPDATE publications SET title=$3,description=$4,district=$5,price=$6,status='pending',moderation_reason='',reviewed_at=NULL,revision=revision+1,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *",[id,uid,v.title,v.description,v.district,v.price])).rows[0];
  await c.query('INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($1,$2,$3,$4)',['user_edit_resubmitted','publication',id,'revision='+row.revision]);
  await c.query('COMMIT');return pub(row);
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},
 async withdrawPublication(uid,id){const c=await pool.connect();try{await c.query('BEGIN');
  const r=await c.query("UPDATE publications SET status='closed' WHERE id=$1 AND user_id=$2 AND status IN ('pending','published') RETURNING id",[id,uid]);
  if(r.rowCount)await c.query('INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($1,$2,$3,$4)',['user_withdraw','publication',id,'User withdrew their own content']);
  await c.query('COMMIT');return !!r.rowCount;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},
 async createMerchant(uid,v){return createMerchantApplication(pool,uid,v,application);},
 async myMerchant(uid){return application(await one('SELECT * FROM merchant_applications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[uid]));},
 async createBooking(uid,v){
  if(!isBookableSlot(v.requestedAt)){
   if(!isValidSlotInstant(v.requestedAt))return {error:'slot_expired'};
   // Idempotent retry: an existing active booking is not a new claim.
   const owned=await one("SELECT b.*,s.title AS service_title FROM booking_requests b JOIN service_catalog s ON s.id=b.service_id WHERE b.user_id=$1 AND b.service_id=$2 AND b.requested_at=$3 AND b.status IN ('pending_confirm','confirmed') AND (b.status='confirmed' OR b.hold_expires_at>clock_timestamp())",[uid,v.serviceId,v.requestedAt]);
   return owned?{...book(owned),replayed:true}:{error:'slot_expired'};
  }
  const c=await pool.connect();try{await c.query('BEGIN');
  // Serialize merchant pause against new reservations. FOR SHARE conflicts with
  // the merchant's UPDATE to service_catalog; no new claim can sneak in after pause commits.
  const active=await c.query("SELECT s.id FROM service_catalog s LEFT JOIN verified_merchants vm ON vm.id=s.merchant_id JOIN service_regions r ON r.name=s.district AND r.enabled=true WHERE (s.merchant_id IS NULL OR vm.status='active') AND s.id=$1 AND s.status='published' AND public_service_source_ok(s.id) FOR SHARE OF s",[v.serviceId]);
  if(!active.rows.length){await c.query('ROLLBACK');return null;}
  await c.query("UPDATE booking_requests SET status='expired',updated_at=now() WHERE service_id=$1 AND requested_at=$2 AND status='pending_confirm' AND hold_expires_at <= now()",[v.serviceId,v.requestedAt]);
  const r=await c.query("INSERT INTO booking_requests(user_id,service_id,requested_at,remark,hold_expires_at) SELECT $1,s.id,$3,$4,clock_timestamp()+interval '30 minutes' FROM service_catalog s JOIN service_regions r ON r.name=s.district AND r.enabled=true WHERE s.id=$2 AND s.status='published' AND public_service_source_ok(s.id) AND $3::timestamptz > clock_timestamp()+interval '10 minutes' RETURNING *, (SELECT title FROM service_catalog WHERE id=service_id) AS service_title",[uid,v.serviceId,v.requestedAt,v.remark]);await c.query('COMMIT');return r.rows[0]?book(r.rows[0]):(!isBookableSlot(v.requestedAt)?{error:'slot_expired'}:null);
  }catch(e){await c.query('ROLLBACK');
   if(e.code==='P0001'&&e.message==='LINKED_SERVICE_UNAVAILABLE')return {error:'service_unavailable'};
   if(e.code==='23505'&&e.constraint==='uq_booking_active_slot'){
    // The partial unique index is the final concurrency arbiter. If OUR OWN booking
    // already won (e.g. network timeout + retry), report the original booking.
    // Never reveal another user's booking data, or turn a competing claim into success.
    const previous=(await c.query("SELECT b.*,s.title AS service_title FROM booking_requests b JOIN service_catalog s ON s.id=b.service_id WHERE b.user_id=$1 AND b.service_id=$2 AND b.requested_at=$3 AND b.status IN ('pending_confirm','confirmed') AND (b.status='confirmed' OR b.hold_expires_at>clock_timestamp())",[uid,v.serviceId,v.requestedAt])).rows[0];
    return previous?{...book(previous),replayed:true}:!isBookableSlot(v.requestedAt)?{error:'slot_expired'}:{error:'slot_taken'};
   }
   throw e;
  }finally{c.release();}},
 async availableSlots(serviceId,date){const s=await one("SELECT s.id FROM service_catalog s LEFT JOIN verified_merchants vm ON vm.id=s.merchant_id JOIN service_regions r ON r.name=s.district AND r.enabled=true WHERE (s.merchant_id IS NULL OR vm.status='active') AND s.id=$1 AND s.status='published' AND public_service_source_ok(s.id)",[serviceId]);if(!s)return null;
  await pool.query("UPDATE booking_requests SET status='expired',updated_at=now() WHERE service_id=$1 AND status='pending_confirm' AND hold_expires_at<=now()",[serviceId]);
  const reserved=await many("SELECT requested_at FROM booking_requests WHERE service_id=$1 AND status IN ('pending_confirm','confirmed') AND requested_at >= $2::date AT TIME ZONE 'Asia/Shanghai' AND requested_at < ($2::date+1) AT TIME ZONE 'Asia/Shanghai'",[serviceId,date]);
  const busy=new Set(reserved.map(r=>new Date(r.requested_at).valueOf()));return Array.from({length:10},(_,i)=>{const time=String(i+9).padStart(2,'0')+':00',instant=Date.parse(date+'T'+time+':00+08:00');return {time,available:instant>Date.now()+10*60000&&!busy.has(instant)};});},
 async myBookings(uid){await pool.query("UPDATE booking_requests SET status='expired',updated_at=now() WHERE user_id=$1 AND status='pending_confirm' AND hold_expires_at<=now()",[uid]);return (await many('SELECT b.*,s.title AS service_title FROM booking_requests b JOIN service_catalog s ON s.id=b.service_id WHERE b.user_id=$1 ORDER BY b.created_at DESC LIMIT 100',[uid])).map(book);},
 async cancelBooking(uid,id){const c=await pool.connect();try{await c.query('BEGIN');
  await c.query("UPDATE booking_requests SET status='expired',updated_at=now() WHERE id=$1 AND user_id=$2 AND status='pending_confirm' AND (hold_expires_at IS NULL OR hold_expires_at<=now())",[id,uid]);
  const changed=await c.query("UPDATE booking_requests SET status='cancelled',updated_at=now() WHERE id=$1 AND user_id=$2 AND status='pending_confirm' AND hold_expires_at>now() RETURNING id",[id,uid]);
  await c.query('COMMIT');return !!changed.rowCount;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},
 async queue(){const ps=(await many("SELECT * FROM publications WHERE status='pending' AND NOT EXISTS(SELECT 1 FROM industry_entries e WHERE e.id=publications.id) ORDER BY created_at ASC LIMIT 100")).map(pub);const ms=(await many("SELECT * FROM merchant_applications WHERE status IN ('pending','in_review','needs_documents') ORDER BY created_at ASC LIMIT 100")).map(application);return {publications:ps,merchantApplications:ms};},
 async reviewPublication(id,status,reason,expectedRevision=null,checks=null,actor='operator'){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const current=(await client.query('SELECT * FROM publications WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!current||current.status!=='pending'||expectedRevision!==null&&current.revision!==expectedRevision){await client.query('COMMIT');return false;}
   if(status==='published'&&checks)require('./publication-records').assertReview(require('./publication-records').reviewRule(current),checks);
   await client.query('UPDATE publications SET status=$2,moderation_reason=$3,reviewed_at=now() WHERE id=$1',[id,status,reason]);
   await client.query('INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($1,$2,$3,$4)',[status,'publication',id,JSON.stringify({reason,role:actor,revision:current.revision,...(checks?{checks,reviewRule:require('./publication-records').reviewRule(current)}:{})})]);
   await client.query('COMMIT');return true;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 },
 async reviewMerchant(id,status,note){const c=await pool.connect();try{await c.query('BEGIN');const r=await c.query("UPDATE merchant_applications SET status=$2,reviewer_note=$3,updated_at=now() WHERE id=$1 AND status IN ('pending','in_review','needs_documents') RETURNING id",[id,status,note]);if(r.rowCount)await c.query('INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($1,$2,$3,$4)',[status,'merchant',id,note]);await c.query('COMMIT');return !!r.rowCount;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},
 async stats(){const rows=await many("SELECT (SELECT count(*)::int FROM publications WHERE status='pending') AS \"pendingPublications\",(SELECT count(*)::int FROM publications WHERE status='published') AS published,(SELECT count(*)::int FROM merchant_applications) AS \"merchantApplications\",(SELECT count(*)::int FROM app_users) AS users");return rows[0];},
 async close(){await pool.end();}
 };
 const trusted=require('./trust-repository').attachTrustRepository(require('./geo-repository').attachGeoRepository(require('./product-repository').attachProductRepository(repository,pool),pool),pool);
 require('./review-workbench').attachWorkbench(trusted,pool);
 require('./points-repository').attachPoints(trusted,pool);
 require('./contribution-rewards').attachContributionRewards(trusted,pool);
 require('./reward-appeals').attachRewardAppeals(trusted,pool);
 require('./ad-repository').attachAds(trusted,pool);
 require('./account-lifecycle').attachAccountLifecycle(trusted,pool);
 require('./booking-submissions').attachPgBookingSubmissions(trusted,pool);
 require('./home-content').attachHomeContent(trusted,pool);
 require('./commerce').attachCommerce(trusted,pool);
 require('./industry').attachIndustry(trusted,pool);
 require('./business-cases').attachBusinessCases(trusted,pool);
 require('./industry-services').attachIndustryServices(trusted,pool);
 require('./booking-source-lifecycle').attachBookingSourceLifecycle(trusted,pool);
 require('./publication-records').attach(trusted,pool);
 require('./memorial-repository').attachMemorial(trusted,pool);
 return require('./maintenance').attachMaintenance(trusted,pool);
}
module.exports={createPgRepository,literalSearchPattern};
