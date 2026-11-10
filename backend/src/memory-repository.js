'use strict';
const crypto=require('node:crypto');
const {merchantOperations}=require('./operations-memory');
const {DEFAULT_CATEGORIES}=require('./taxonomy');
const {toPublicItem}=require('./public-item');
const {isBookableSlot}=require('./booking-window');
const id=()=>crypto.randomUUID(), when=()=>new Date().toISOString();
const HOLD_MS=30*60*1000;
const clone=x=>JSON.parse(JSON.stringify(x));
function createMemoryRepository(){
 const users=new Map(), identities=new Map(), sessions=new Map(), pubs=[], apps=[], services=[], bookings=[], audits=[];
 const regions=[], categories=DEFAULT_CATEGORIES.map(c=>({...c})),configAudits=[];
 const seedRegions=(names=[])=>{if(regions.length)return;for(const name of names){if(!regions.some(r=>r.name===name))regions.push({name,enabled:true});}};
 const repository={
 ...require('./search-popularity').memorySearchPopularity(),
 ...merchantOperations({users,apps,services,bookings}),
 __publications:pubs,
 async seedRegions(names){seedRegions(names);},
 async listRegions(seed=[]){seedRegions(seed);return clone(regions);},
 async addRegion(name){if(regions.some(r=>r.name===name))return null;const r={name,enabled:true};regions.push(r);configAudits.push({action:'region_add',name});return clone(r);},
 async setRegionEnabled(name,enabled){const r=regions.find(r=>r.name===name);if(!r)return null;if(!enabled&&r.enabled&&regions.filter(x=>x.enabled).length===1)return false;r.enabled=enabled;configAudits.push({action:'region_status',name,enabled});return clone(r);},
 async listCategories(){return clone(categories);},
 async setCategoryEnabled(id,enabled){const c=categories.find(x=>x.id===id);if(!c||c.restricted&&enabled)return null;c.enabled=enabled;configAudits.push({action:'category_status',id,enabled});return clone(c);},

 async upsertIdentity(provider,openid){const key=provider+':'+openid;let userId=identities.get(key);if(!userId){userId=id();users.set(userId,{id:userId,status:'active'});identities.set(key,userId);}return userId;},
 async newSession(userId,tokenHash,expiresAt){sessions.set(tokenHash,{userId,expiresAt});},
 async authenticate(tokenHash){const s=sessions.get(tokenHash);return s&&Date.parse(s.expiresAt)>Date.now()&&users.get(s.userId)?.status==='active'?s.userId:null;},
 async revokeSession(tokenHash){return sessions.delete(tokenHash);},
 async ping(){return true;},
 async listFeed({type='all',area='全部地区',q='',limit=100,offset=0,sort='latest',categoryId='',cityCode='',districtCode='',days=0,radiusKm=0,images='all',publicOnly=false}){
  // Memory mode has no verified public coordinates or saved-item ledger.
  if(sort==='distance'||radiusKm>0||publicOnly)return [];
  const amount=value=>{const clean=String(value||'').replace(/[¥￥ ,]/g,'');return /^\d+(\.\d{1,2})?$/.test(clean)?Number(clean):null;};
  const active=new Set(regions.filter(r=>r.enabled).map(r=>r.name));const visible=d=>!regions.length||active.has(d);
  const pictured=x=>images!=='with'||!!x.imageIds?.length;
  const list=pubs.filter(x=>pictured(x)&&x.status==='published'&&visible(x.district)&&(!categoryId||x.attributes?.categoryId?.startsWith(categoryId))&&(!cityCode||x.attributes?.cityCode===cityCode)&&(!districtCode||x.attributes?.districtCode?.startsWith(districtCode))).map(x=>({...toPublicItem(x,'publication'),createdAt:x.createdAt}));
  const svc=services.filter(x=>pictured(x)&&!categoryId&&!cityCode&&x.status==='published'&&visible(x.district)).map(x=>({...toPublicItem({...x,type:'service'},'catalog'),createdAt:x.createdAt}));
  return clone([...list,...svc].filter(x=>(!days||Date.parse(x.createdAt)>=Date.now()-days*86400000)&&(type==='all'||x.type===type||type==='public'&&x.type==='community')&&(area==='全部地区'||x.district===area)&&(!q||[x.title,x.description,x.district].join(' ').toLowerCase().includes(q.toLowerCase())))
   .sort((a,b)=>{if(['price_low','price_high'].includes(sort)){const av=amount(a.price),bv=amount(b.price);if(av===null&&bv!==null)return 1;if(bv===null&&av!==null)return -1;if(av!==null&&bv!==null&&av!==bv)return sort==='price_low'?av-bv:bv-av;}if(sort==='recommended'&&q){const am=a.title.toLowerCase().includes(q.toLowerCase()),bm=b.title.toLowerCase().includes(q.toLowerCase());if(am!==bm)return bm-am;}return (Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0))||(a.id<b.id?1:-1);}).slice(offset,offset+limit));
 },
 async getItem(itemId){
  // Item detail is independent of feed pagination: old approved records must remain addressable.
  const active=new Set(regions.filter(r=>r.enabled).map(r=>r.name));
  const visible=x=>x&&x.status==='published'&&(!regions.length||active.has(x.district));
  const p=pubs.find(x=>x.id===itemId);if(visible(p))return clone(toPublicItem(p,'publication'));
  const s=services.find(x=>x.id===itemId);return visible(s)?clone(toPublicItem({...s,type:'service'},'catalog')):null;
 },
 async createPublication(uid,v){const x={id:id(),userId:uid,...v,detail:v.description,createdAt:when(),updatedAt:when(),revision:1,status:'pending',moderationReason:''};pubs.unshift(x);return clone(x);},
 async myPublications(uid){return clone(pubs.filter(x=>x.userId===uid));},
 async updatePublication(uid,pid,v,expectedRevision){
  const x=pubs.find(x=>x.id===pid&&x.userId===uid&&['pending','published','rejected'].includes(x.status)&&x.type===v.type);
  if(!x)return false;
  if(x.revision!==expectedRevision)return {error:'revision_conflict'};
  const extras=require('./product-repository').publicationEditExtras(x,v);
  Object.assign(x,{attributes:extras.attributes,imageIds:extras.imageIds,title:v.title,description:v.description,detail:v.description,price:v.price,district:v.district,status:'pending',moderationReason:'',updatedAt:when(),revision:x.revision+1});
  audits.push({action:'user_edit_resubmitted',id:pid,revision:x.revision,time:when()});
  return clone(x);
 },
 async withdrawPublication(uid,pid){const x=pubs.find(x=>x.id===pid&&x.userId===uid&&['pending','published'].includes(x.status));if(!x)return false;x.status='closed';x.withdrawnAt=when();audits.push({action:'user_withdraw',id:pid,time:when()});return true;},
 async createMerchant(uid,v){const old=apps.find(x=>x.userId===uid&&['pending','in_review','needs_documents'].includes(x.status));if(old)return clone(old);const x={id:id(),userId:uid,...v,status:'pending',createdAt:when()};apps.unshift(x);return clone(x);},
 async myMerchant(uid){return clone(apps.find(x=>x.userId===uid)||null);},
 async createBooking(uid,v){const s=services.find(x=>x.id===v.serviceId&&x.status==='published'&&(!regions.length||regions.some(r=>r.name===x.district&&r.enabled)));if(!s)return null;
  const instant=Date.now();for(const b of bookings){if(b.status==='pending_confirm'&&Date.parse(b.holdExpiresAt||'2099-01-01T00:00:00Z')<=instant)b.status='expired';}
  const occupied=bookings.find(b=>b.serviceId===v.serviceId&&b.requestedAt===v.requestedAt&&['pending_confirm','confirmed'].includes(b.status));
  if(occupied&&occupied.userId===uid)return {...clone(occupied),replayed:true};
  if(!isBookableSlot(v.requestedAt))return {error:'slot_expired'};
  if(occupied)return {error:'slot_taken'};
  const x={id:id(),userId:uid,...v,serviceTitle:s.title,status:'pending_confirm',holdExpiresAt:new Date(instant+HOLD_MS).toISOString(),createdAt:when()};bookings.unshift(x);return clone(x);},
 async availableSlots(serviceId,date){const s=services.find(x=>x.id===serviceId&&x.status==='published'&&(!regions.length||regions.some(r=>r.name===x.district&&r.enabled)));if(!s)return null;
  const instant=Date.now();for(const b of bookings){if(b.status==='pending_confirm'&&Date.parse(b.holdExpiresAt||'2099-01-01T00:00:00Z')<=instant)b.status='expired';}
  return Array.from({length:10},(_,i)=>{const time=String(i+9).padStart(2,'0')+':00',when=Date.parse(date+'T'+time+':00+08:00');return {time,available:when>instant+10*60000&&!bookings.some(b=>b.serviceId===serviceId&&Date.parse(b.requestedAt)===when&&['pending_confirm','confirmed'].includes(b.status))};});},
 async myBookings(uid){for(const b of bookings){if(b.status==='pending_confirm'&&b.holdExpiresAt&&Date.parse(b.holdExpiresAt)<=Date.now())b.status='expired';}return clone(bookings.filter(x=>x.userId===uid));},
 async cancelBooking(uid,bookingId){const x=bookings.find(x=>x.id===bookingId&&x.userId===uid&&x.status==='pending_confirm');if(!x)return false;
  if(!x.holdExpiresAt||Date.parse(x.holdExpiresAt)<=Date.now()){x.status='expired';return false;}
  x.status='cancelled';return true;},
 async queue(){return {publications:clone(pubs.filter(x=>x.status==='pending')),merchantApplications:clone(apps.filter(x=>['pending','in_review','needs_documents'].includes(x.status)))};},
 async reviewPublication(pid,status,reason){const x=pubs.find(x=>x.id===pid&&x.status==='pending');if(!x)return false;x.status=status;x.moderationReason=reason;audits.push({action:status,id:pid,time:when()});return true;},
 async reviewMerchant(pid,status,note){const x=apps.find(x=>x.id===pid&&['pending','in_review','needs_documents'].includes(x.status));if(!x)return false;x.status=status;x.reviewerNote=note;audits.push({action:status,id:pid,time:when()});return true;},
 async stats(){return {pendingPublications:pubs.filter(x=>x.status==='pending').length,published:pubs.filter(x=>x.status==='published').length,merchantApplications:apps.length,users:users.size};},
 async addTestService(v){const x={id:id(),status:'published',...v};services.push(x);return x;},
 async recordAdminAccess(event){audits.push({action:'admin_access',...clone(event),time:when()});},
 async close(){}
 };
 return require('./booking-submissions').attachMemoryBookingSubmissions(repository);
}
module.exports={createMemoryRepository};
