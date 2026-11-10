'use strict';
const crypto=require('node:crypto');
const id=()=>crypto.randomUUID(), now=()=>new Date().toISOString();
const copy=x=>JSON.parse(JSON.stringify(x));
function merchantOperations({users,apps,services,bookings}){
 const merchants=[],members=[],reports=[],verifications=[],licenses=new Map();
 const storeFor=mid=>merchants.find(m=>m.id===mid&&m.status==='active');
 const member=(uid,mid)=>members.find(m=>m.userId===uid&&m.merchantId===mid&&m.status==='active');
 const access=(uid,mid,roles)=>{const m=storeFor(mid),r=member(uid,mid);return m&&r&&roles.includes(r.role)?r:null;};
 const decorate=m=>({...m,role:member(m.currentUserId,m.id)?.role||null});
 return {
  async mayUploadMerchantLicense(uid,appId){return apps.some(a=>a.id===appId&&a.userId===uid&&['pending','in_review','needs_documents'].includes(a.status));},
  async saveMerchantLicense(uid,appId,meta){const a=apps.find(a=>a.id===appId&&a.userId===uid&&['pending','in_review','needs_documents'].includes(a.status));if(!a)return null;const previousFileId=a.licenseFileId;licenses.set(meta.fileId,{...meta,applicationId:appId});a.licenseFileId=meta.fileId;a.updatedAt=now();return {...meta,previousFileId};},
  async merchantLicenseForAdmin(fileId){const meta=licenses.get(fileId);return meta&&apps.some(a=>a.id===meta.applicationId&&a.licenseFileId===fileId)?copy(meta):null;},
  async submitMerchantEvidence(uid,appId,v){const a=apps.find(a=>a.id===appId&&a.userId===uid&&['pending','in_review','needs_documents'].includes(a.status));if(!a)return null; a.registrationCode=v.registrationCode;a.licenseHolder=v.licenseHolder;a.evidenceReference=v.evidenceReference;a.status='in_review';a.updatedAt=now();return copy(a);},
  async approveMerchantApplication(appId,operatorNote,verified){if(!verified)return null;const a=apps.find(a=>a.id===appId&&a.status==='in_review'&&a.registrationCode&&a.licenseHolder&&a.evidenceReference);if(!a)return null;let m=merchants.find(m=>m.applicationId===appId);if(!m){m={id:id(),applicationId:appId,name:a.name,category:a.category,district:a.district,status:'active',createdAt:now()};merchants.push(m);members.push({id:id(),merchantId:m.id,userId:a.userId,role:'owner',status:'active'});}a.status='approved';a.reviewerNote=operatorNote; a.updatedAt=now();verifications.push({applicationId:appId,at:now(),note:operatorNote,verified});return copy(m);},
  async myManagedMerchants(uid){return copy(merchants.filter(m=>!!member(uid,m.id)).map(m=>({...m,role:member(uid,m.id).role})));},
  async myMerchantServices(uid,mid){if(!access(uid,mid,['owner','manager','staff']))return null;return copy(services.filter(s=>s.merchantId===mid));},
  async createMerchantService(uid,mid,v){if(!access(uid,mid,['owner','manager']))return null;const m=storeFor(mid),s={id:id(),merchantId:mid,district:m.district,...v,status:'pending_review',createdAt:now()};services.unshift(s);return copy(s);},
  async changeMerchantServiceStatus(uid,mid,sid,action){
   if(!access(uid,mid,['owner','manager']))return null;
   const s=services.find(x=>x.id===sid&&x.merchantId===mid);
   const from=action==='pause'?'published':'draft';
   const to=action==='pause'?'draft':'pending_review';
   if(!s||s.status!==from)return false;
   s.status=to;s.updatedAt=now();
   return copy(s);
  },
  async myMerchantBookings(uid,mid){if(!access(uid,mid,['owner','manager','staff']))return null;const linked=new Map(services.filter(s=>s.merchantId===mid).map(s=>[s.id,s]));for(const b of bookings){if(linked.has(b.serviceId)&&b.status==='pending_confirm'&&b.holdExpiresAt&&Date.parse(b.holdExpiresAt)<=Date.now())b.status='expired';}return copy(bookings.filter(b=>linked.has(b.serviceId)).map(b=>({...b,serviceTitle:linked.get(b.serviceId).title})));},
  async actOnMerchantBooking(uid,mid,bid,action){if(!access(uid,mid,['owner','manager','staff']))return null;const x=bookings.find(b=>b.id===bid&&services.some(s=>s.id===b.serviceId&&s.merchantId===mid));if(!x)return false;const transitions={confirm:['pending_confirm','confirmed'],decline:['pending_confirm','declined'],complete:['confirmed','completed']};const [from,to]=transitions[action]||[];if(x.status==='pending_confirm'&&x.holdExpiresAt&&Date.parse(x.holdExpiresAt)<=Date.now()){x.status='expired';return false;}if(x.status!==from)return false;if(action==='confirm'&&Date.parse(x.requestedAt)<=Date.now())return false;x.status=to;x.updatedAt=now();return copy(x);},
  async merchantMembers(uid,mid){if(!access(uid,mid,['owner']))return null;return copy(members.filter(m=>m.merchantId===mid));},
  async addMerchantMember(uid,mid,targetUser,role){if(!access(uid,mid,['owner']))return null;if(!users.has(targetUser))return false;const existing=members.find(m=>m.merchantId===mid&&m.userId===targetUser);if(existing){if(existing.role==='owner')return false;existing.role=role;existing.status='active';return copy(existing);}const x={id:id(),userId:targetUser,merchantId:mid,role,status:'active'};members.push(x);return copy(x);},
  async removeMerchantMember(uid,mid,targetUser){if(!access(uid,mid,['owner']))return null;const existing=members.find(m=>m.merchantId===mid&&m.userId===targetUser&&m.role!=='owner'&&m.status==='active');if(!existing)return false;existing.status='removed';return true;},
  async createReport(uid,v){const dup=reports.find(r=>r.userId===uid&&r.targetType===v.targetType&&r.targetId===v.targetId&&r.status==='pending');if(dup)return copy(dup);const x={id:id(),userId:uid,...v,status:'pending',createdAt:now()};reports.push(x);return copy(x);},
  async reportsQueue(){return copy(reports.filter(r=>r.status==='pending'));},
  async reportDecision(reportId,decision,note,publications){const r=reports.find(r=>r.id===reportId&&r.status==='pending');if(!r)return false;r.status=decision;r.reviewerNote=note;r.reviewedAt=now();if(decision==='removed'){
   const target=r.targetType==='publication'?publications.find(p=>p.id===r.targetId&&p.status==='published'):services.find(s=>s.id===r.targetId&&s.status==='published');
   if(target)target.status=r.targetType==='publication'?'closed':'disabled';
  }return true;},
  async serviceQueue(){return copy(services.filter(s=>s.status==='pending_review'));},
  async reviewService(serviceId,status){const s=services.find(s=>s.id===serviceId&&s.status==='pending_review');if(!s)return false;s.status=status==='published'?'published':'disabled';return true;},
  async publicReportTarget(type,targetId,publications){return type==='publication'?publications.some(p=>p.id===targetId&&p.status==='published'):services.some(s=>s.id===targetId&&s.status==='published');}
 };
}
module.exports={merchantOperations};
