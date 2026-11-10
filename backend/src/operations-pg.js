'use strict';
function pgOperations(pool){
 const one=async(q,v=[])=> (await pool.query(q,v)).rows[0]||null;
 const many=async(q,v=[])=> (await pool.query(q,v)).rows;
 const member=async(uid,mid,roles)=>one("SELECT mm.role FROM merchant_members mm JOIN verified_merchants vm ON vm.id=mm.merchant_id WHERE mm.user_id=$1 AND mm.merchant_id=$2 AND mm.status='active' AND vm.status='active' AND mm.role=ANY($3::text[])",[uid,mid,roles]);
 const service=x=>x&&({id:x.id,merchantId:x.merchant_id,title:x.title,description:x.description,district:x.district,price:x.price,status:x.status,createdAt:x.created_at,imageIds:x.image_ids||[]});
 const book=x=>x&&({id:x.id,userId:x.user_id,serviceId:x.service_id,serviceTitle:x.service_title,requestedAt:x.requested_at,remark:x.remark,status:x.status,cancellationReason:x.system_cancellation_reason||'',holdExpiresAt:x.hold_expires_at,createdAt:x.created_at});
 const app=x=>x&&({id:x.id,userId:x.user_id,name:x.name,category:x.category,district:x.district,status:x.status,registrationCode:x.registration_code,licenseHolder:x.license_holder,evidenceReference:x.evidence_reference,reviewerNote:x.reviewer_note,createdAt:x.created_at});
 const wrap=async callback=>{const c=await pool.connect();try{await c.query('BEGIN');const value=await callback(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 return {
  async mayUploadMerchantLicense(uid,aid){return !!(await one("SELECT id FROM merchant_applications WHERE id=$1 AND user_id=$2 AND status IN ('pending','in_review','needs_documents')",[aid,uid]));},
  async saveMerchantLicense(uid,aid,meta){return wrap(async c=>{const row=(await c.query("SELECT license_file_id FROM merchant_applications WHERE id=$1 AND user_id=$2 AND status IN ('pending','in_review','needs_documents') FOR UPDATE",[aid,uid])).rows[0];if(!row)return null;await c.query('INSERT INTO merchant_license_files(id,application_id,sha256,size,content_type) VALUES($1,$2,$3,$4,$5)',[meta.fileId,aid,meta.sha256,meta.size,meta.contentType]);await c.query('UPDATE merchant_applications SET license_file_id=$2,updated_at=now() WHERE id=$1',[aid,meta.fileId]);return {...meta,previousFileId:row.license_file_id};});},
  async merchantLicenseForAdmin(fileId){const x=await one('SELECT f.id AS "fileId",f.application_id AS "applicationId",f.sha256,f.size,f.content_type AS "contentType" FROM merchant_license_files f JOIN merchant_applications a ON a.id=f.application_id AND a.license_file_id=f.id WHERE f.id=$1',[fileId]);return x;},
  async submitMerchantEvidence(uid,aid,v){return app(await one("UPDATE merchant_applications SET registration_code=$3,license_holder=$4,evidence_reference=$5,status='in_review',updated_at=now() WHERE id=$1 AND user_id=$2 AND status IN ('pending','in_review','needs_documents') RETURNING *",[aid,uid,v.registrationCode,v.licenseHolder,v.evidenceReference]));},
  async approveMerchantApplication(aid,note,verified){if(!verified)return null;return wrap(async c=>{
   const a=(await c.query("UPDATE merchant_applications SET status='approved',reviewer_note=$2,updated_at=now() WHERE id=$1 AND status='in_review' AND registration_code IS NOT NULL AND license_holder IS NOT NULL AND evidence_reference IS NOT NULL RETURNING *",[aid,note])).rows[0];if(!a)return null;
   const m=(await c.query('INSERT INTO verified_merchants(application_id,name,category,district) VALUES($1,$2,$3,$4) RETURNING *',[aid,a.name,a.category,a.district])).rows[0];
   await c.query("INSERT INTO merchant_members(merchant_id,user_id,role) VALUES($1,$2,'owner')",[m.id,a.user_id]);
   await c.query('INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($1,$2,$3,$4)',['merchant_approved','merchant',aid,'MANUAL_VERIFIED: '+note]);return {id:m.id,name:m.name,district:m.district};
  });},
  async myManagedMerchants(uid){return many("SELECT vm.id,vm.name,vm.category,vm.district,vm.status,mm.role FROM verified_merchants vm JOIN merchant_members mm ON mm.merchant_id=vm.id WHERE mm.user_id=$1 AND mm.status='active' AND vm.status='active' ORDER BY vm.created_at DESC",[uid]);},
  async myMerchantServices(uid,mid){if(!await member(uid,mid,['owner','manager','staff']))return null;return (await many('SELECT * FROM service_catalog WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 100',[mid])).map(service);},
  async createMerchantService(uid,mid,v){return wrap(async c=>{
   // Serialize staff revocation against publishing a new service. A role check
   // before acquiring the DB connection alone is not sufficient.
   const rights=await c.query(`SELECT mm.role FROM merchant_members mm
     JOIN verified_merchants vm ON vm.id=mm.merchant_id
     WHERE mm.user_id=$1 AND mm.merchant_id=$2 AND mm.status='active'
       AND mm.role IN ('owner','manager') AND vm.status='active'
     FOR SHARE OF mm, vm`,[uid,mid]);
   if(!rights.rows.length)return null;
   const ids=v.imageIds||[];
   const photos=await c.query('SELECT id FROM content_images WHERE user_id=$1 AND id=ANY($2::uuid[]) FOR SHARE',[uid,ids]);
   if(photos.rows.length!==ids.length)throw new (require('./rules').ApiError)(400,'IMAGE_NOT_OWNED','图片无效或不属于当前用户');
   const created=(await c.query("INSERT INTO service_catalog(merchant_id,title,description,price,district,status,image_ids) SELECT id,$2,$3,$4,district,'pending_review',$5 FROM verified_merchants WHERE id=$1 AND status='active' RETURNING *",[mid,v.title,v.description,v.price,ids])).rows[0];
   return service(created);
  });},
  async changeMerchantServiceStatus(uid,mid,sid,action){
   const from=action==='pause'?'published':'draft';
   const to=action==='pause'?'draft':'pending_review';
   return wrap(async c=>{
    // Revoke/role-change must serialize with the business mutation.
    // A membership check outside this transaction is stale as soon as it returns.
    // FOR SHARE conflicts with the owner's UPDATE/DELETE on this membership,
    // so once revocation commits, a later status action cannot use old rights.
    const rights=await c.query(`SELECT mm.role FROM merchant_members mm
      JOIN verified_merchants vm ON vm.id=mm.merchant_id
      WHERE mm.merchant_id=$2 AND mm.user_id=$1 AND mm.status='active'
        AND mm.role IN ('owner','manager') AND vm.status='active'
      FOR SHARE OF mm, vm`,[uid,mid]);
    if(!rights.rows.length)return null;
    // Locking the merchant membership above also protects the audit operation.
    // The status condition prevents resubmitting a platform-disabled service.
    const row=(await c.query(`UPDATE service_catalog s SET status=$3
      WHERE s.id=$2 AND s.merchant_id=$1 AND s.status=$4
      RETURNING s.*`,[mid,sid,to,from])).rows[0];
    if(!row)return false;
    await c.query('INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($1,$2,$3,$4)',
      [action==='pause'?'merchant_service_paused':'merchant_service_resubmitted','service',sid,'merchant='+mid]);
    return service(row);
   });
  },
  async myMerchantBookings(uid,mid){if(!await member(uid,mid,['owner','manager','staff']))return null;await pool.query("UPDATE booking_requests b SET status='expired',updated_at=now() FROM service_catalog s WHERE b.service_id=s.id AND s.merchant_id=$1 AND b.status='pending_confirm' AND b.hold_expires_at<=now()",[mid]);return (await many('SELECT b.*,s.title AS service_title FROM booking_requests b JOIN service_catalog s ON s.id=b.service_id WHERE s.merchant_id=$1 ORDER BY b.created_at DESC LIMIT 100',[mid])).map(book);},
  async actOnMerchantBooking(uid,mid,bid,action){
   const map={confirm:['pending_confirm','confirmed'],decline:['pending_confirm','declined'],complete:['confirmed','completed']};
   if(!map[action])return false;
   return wrap(async c=>{
    // Lock the authenticated merchant membership until this action commits.
    // A simultaneous owner revocation cannot complete before the write while
    // leaving the revoked staff account free to change the booking.
    const rights=await c.query(`SELECT mm.role FROM merchant_members mm
      JOIN verified_merchants vm ON vm.id=mm.merchant_id
      WHERE mm.user_id=$1 AND mm.merchant_id=$2 AND mm.status='active'
        AND mm.role IN ('owner','manager','staff') AND vm.status='active'
      FOR SHARE OF mm, vm`,[uid,mid]);
    if(!rights.rows.length)return null;
    await c.query(`UPDATE booking_requests b SET status='expired',updated_at=now()
      FROM service_catalog s WHERE b.id=$1 AND b.service_id=s.id AND s.merchant_id=$2
      AND b.status='pending_confirm' AND b.hold_expires_at<=clock_timestamp()`,[bid,mid]);
    const [from,to]=map[action];
    const updated=(await c.query(`UPDATE booking_requests b SET status=$4,updated_at=now()
      FROM service_catalog s WHERE b.id=$1 AND b.service_id=s.id AND s.merchant_id=$2
        AND b.status=$3 AND (b.status<>'pending_confirm' OR b.hold_expires_at>clock_timestamp())
        AND ($4<>'confirmed' OR b.requested_at>clock_timestamp())
      RETURNING b.*,s.title AS service_title`,[bid,mid,from,to])).rows[0];
    return book(updated)||false;
   });
  },
  async merchantMembers(uid,mid){if(!await member(uid,mid,['owner']))return null;return many('SELECT id,merchant_id AS "merchantId",user_id AS "userId",role,status FROM merchant_members WHERE merchant_id=$1 ORDER BY role,user_id',[mid]);},
  async addMerchantMember(uid,mid,target,role){if(!await member(uid,mid,['owner']))return null;
   const exists=await one('SELECT id FROM app_users WHERE id=$1',[target]);if(!exists)return false;
   // No escalation or transfer of ownership through staff management.
   const r=await one("INSERT INTO merchant_members(merchant_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(merchant_id,user_id) DO UPDATE SET role=EXCLUDED.role,status='active' WHERE merchant_members.role!='owner' RETURNING id,merchant_id AS \"merchantId\",user_id AS \"userId\",role,status",[mid,target,role]);return r||false;},
  async removeMerchantMember(uid,mid,target){if(!await member(uid,mid,['owner']))return null;return !!(await one("UPDATE merchant_members SET status='removed' WHERE merchant_id=$1 AND user_id=$2 AND role!='owner' AND status='active' RETURNING id",[mid,target]));},
  async publicReportTarget(type,target){const table=type==='publication'?'publications':'service_catalog';return !!(await one(`SELECT id FROM ${table} WHERE id=$1 AND status='published'`,[target]));},
  async createReport(uid,v){const r=await one("INSERT INTO content_reports(user_id,target_type,target_id,reason,description) VALUES($1,$2,$3,$4,$5) ON CONFLICT (user_id,target_type,target_id) WHERE status='pending' DO UPDATE SET reason=EXCLUDED.reason,description=EXCLUDED.description RETURNING *",[uid,v.targetType,v.targetId,v.reason,v.description]);return {id:r.id,status:r.status,targetType:r.target_type,targetId:r.target_id};},
  async reportsQueue(){return many("SELECT id,user_id AS \"userId\",target_type AS \"targetType\",target_id AS \"targetId\",reason,description,status FROM content_reports WHERE status='pending' ORDER BY created_at LIMIT 100");},
  async reportDecision(reportId,decision,note){return wrap(async c=>{
   const r=(await c.query("UPDATE content_reports SET status=$2,reviewer_note=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING *",[reportId,decision,note])).rows[0];if(!r)return false;
   if(decision==='removed'){
    const table=r.target_type==='publication'?'publications':'service_catalog',status=r.target_type==='publication'?'closed':'disabled';
    await c.query(`UPDATE ${table} SET status=$2 WHERE id=$1 AND status='published'`,[r.target_id,status]);
   }
   await c.query('INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($1,$2,$3,$4)',['report_'+decision,r.target_type,r.target_id,note]);return true;
  });},
  async serviceQueue(){return (await many("SELECT * FROM service_catalog WHERE status='pending_review' ORDER BY created_at LIMIT 100")).map(service);},
  async reviewService(sid,status){return wrap(async c=>{
   const r=await c.query("UPDATE service_catalog SET status=$2 WHERE id=$1 AND status='pending_review' AND merchant_id IS NOT NULL RETURNING id",[sid,status==='published'?'published':'disabled']);if(!r.rowCount)return false;
   await c.query('INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($1,$2,$3,$4)',['service_'+status,'service',sid,'']);return true;
  });}
 };
}
module.exports={pgOperations};
