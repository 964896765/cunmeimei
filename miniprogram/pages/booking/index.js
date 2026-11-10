const db=require('../../utils/storage'),api=require('../../utils/api'),clock=require('../../utils/booking-time'),pendingStore=require('../../utils/booking-pending');
const uid=()=>wx.getStorageSync('city_life_user_id')||'guest';
const ownerKey=()=>JSON.stringify([uid(),!!wx.getStorageSync('city_life_acceptance_mode')]);
const timePattern=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
Page({
 data:{item:null,date:clock.today(),minDate:clock.today(),time:'',remark:'',online:api.online(),openSlots:[],slotLabels:[],slotIndex:0,loadingItem:true,itemError:'',loadingSlots:false,slotError:'',submitting:false,checking:false,pendingCheck:false,recoveryError:'',recoveryTitle:'',rejectedText:'',submitError:'',submitted:null,successText:''},
 onLoad(q={}){
  this.serviceId=String(q.id||'').toLowerCase();const date=clock.today();this.setData({date,minDate:date});this.bindOwner();this.restorePending();
  if(api.online()&&!/^[0-9a-f-]{36}$/i.test(this.serviceId)){this.setData({loadingItem:false,itemError:'服务标识无效，请返回重新选择。'});return;}
  return this.load();
 },
 onShow(){
  require('../../utils/theme').apply(this);const changed=this.bindOwner(),date=clock.today();this.setData({minDate:date});
  if(changed){this.restorePending();return this.load();}
  if(this.data.date<date&&!this.locked())return this.chooseDate({detail:{value:date}});
 },
 onUnload(){this._disposed=true;this._loadVersion=(this._loadVersion||0)+1;this._slotsVersion=(this._slotsVersion||0)+1;this._submitTask=null;this._checkTask=null;},
 bindOwner(){
  const owner=ownerKey(),changed=this._owner!==undefined&&owner!==this._owner;
  if(changed){this._loadVersion=(this._loadVersion||0)+1;this._slotsVersion=(this._slotsVersion||0)+1;this._submitTask=null;this._checkTask=null;this._pending=null;this._preferred=null;this._slotDate='';this.setData({item:null,date:clock.today(),time:'',remark:'',openSlots:[],slotLabels:[],submitting:false,checking:false,pendingCheck:false,recoveryError:'',recoveryTitle:'',submitted:null,itemError:'',slotError:'',submitError:'',successText:''});}
  if(changed)this.setData({rejectedText:''});this._owner=owner;return changed;
 },
 active(owner){return !this._disposed&&owner===ownerKey();},
 locked(){return this._disposed||!!this.data.recoveryError||this.data.submitting||this.data.checking||this.data.pendingCheck||!!this.data.submitted;},
 restorePending(){
  if(!api.online()||uid()==='guest')return;
  try{const stored=pendingStore.read(ownerKey(),this.serviceId);this.setData({recoveryError:''});if(!stored)return;
   this._slotsVersion=(this._slotsVersion||0)+1;this._pending={owner:ownerKey(),payload:stored.payload};this.setData({date:stored.payload.date,time:stored.payload.time,remark:stored.payload.remark,pendingCheck:true,recoveryTitle:stored.title,loadingSlots:false,submitError:'已恢复上次待核对申请，请核对原预约或重试原申请。'});
  }catch(e){this.setData({recoveryError:e.message||'本机预约恢复信息暂不可用，请重试。'});}
 },
 retryRecovery(){
  if(this.data.submitting||this.data.checking)return;
  if(this.data.submitted){try{const stored=pendingStore.read(ownerKey(),this.serviceId);if(stored){if(!this.validReceipt(this.data.submitted,stored.payload))throw Error('发现另一份待核对申请，请重新打开预约页面。');pendingStore.remove(ownerKey(),stored.payload);}this.setData({recoveryError:''});}catch(e){this.setData({recoveryError:e.message});}return;}
  this.restorePending();if(!this.locked()&&this.data.item)return this.loadSlots();
 },
 async load(){
  if(this._disposed)return;this.bindOwner();const owner=ownerKey(),version=this._loadVersion=(this._loadVersion||0)+1,id=this.serviceId;
  this.setData({loadingItem:true,itemError:''});
  try{
   const item=api.online()?(await api.request('GET','/api/v1/items/'+encodeURIComponent(id))).item:db.getItem(id);
   if(!this.active(owner)||version!==this._loadVersion||id!==this.serviceId)return;
   if(!item||item.kind!=='service')throw Error('该内容暂不可预约，请返回选择其他服务。');
   this.setData({item:api.online()?require('../../utils/presentation').item(item):item,loadingItem:false});
   if(api.online()){if(!this.locked())await this.loadSlots(this.data.date);}else this.setData({time:'10:00'});
  }catch(e){if(this.active(owner)&&version===this._loadVersion)this.setData({item:null,loadingItem:false,itemError:e.message||'服务暂时无法读取，请重试。'});}
 },
 async loadSlots(date=this.data.date){
  if(this._disposed||!api.online()||!this.data.item||date!==this.data.date||this.data.pendingCheck||this.data.submitted)return;
  const owner=ownerKey(),id=this.data.item.id,version=this._slotsVersion=(this._slotsVersion||0)+1;
  this._slotDate='';this.setData({loadingSlots:true,slotError:'',openSlots:[],slotLabels:[],time:''});
  try{
   const r=await api.request('GET','/api/v1/services/'+id+'/slots?date='+encodeURIComponent(date));
   if(!this.active(owner)||version!==this._slotsVersion||date!==this.data.date||id!==this.data.item?.id)return;
   const openSlots=[...new Set((r.slots||[]).filter(s=>s.available===true&&typeof s.time==='string'&&timePattern.test(s.time)).map(s=>s.time))].sort();
   const preferred=this._preferred?.id===id&&this._preferred.date===date?this._preferred.time:'',time=openSlots.includes(preferred)?preferred:openSlots[0]||'';
   this._slotDate=date;this._slotService=id;this._preferred={id,date,time};
   this.setData({openSlots,slotLabels:openSlots,slotIndex:Math.max(0,openSlots.indexOf(time)),time,loadingSlots:false});
  }catch(e){if(this.active(owner)&&version===this._slotsVersion&&date===this.data.date)this.setData({slotError:e.message||'时段暂时无法读取，请重试。',loadingSlots:false});}
 },
 retrySlots(){if(!this.locked())return this.loadSlots();},
 chooseDate(e){
  if(this.locked())return;const date=e.detail.value;
  if(!clock.validDate(date)||date<clock.today()){this.setData({slotError:'请选择有效的未来服务日期。'});return;}
  this.setData({date,slotError:'',submitError:'',rejectedText:''});if(api.online())return this.loadSlots(date);
 },
 chooseTime(e){if(!this.locked()&&!api.online())this.setData({time:e.detail.value});},
 chooseSlot(e){
  if(this.locked()||this.data.loadingSlots||this.data.slotError)return;const index=Number(e.detail.value),time=this.data.openSlots[index];
  if(Number.isInteger(index)&&time){this._preferred={id:this.data.item.id,date:this.data.date,time};this.setData({time,slotIndex:index,submitError:''});}
 },
 setRemark(e){if(!this.locked())this.setData({remark:String(e.detail.value||'').slice(0,300)});},
 submit(){
  if(this.locked()||this.data.loadingItem||!this.data.item)return;
  const {item,date,time,remark}=this.data;
  if(!clock.validDate(date)||date<clock.today()||!time||(api.online()&&(this.data.loadingSlots||this.data.slotError||this._slotDate!==date||this._slotService!==item.id||!this.data.openSlots.includes(time)))){this.setData({submitError:'请先读取并选择当前日期的可预约时段。'});return;}
  this.setData({rejectedText:''});return this.sendBooking({serviceId:item.id,date,time,remark:remark.trim(),...(api.online()?{clientKey:pendingStore.clientKey()}:{})});
 },
 retrySubmission(){if(this._pending&&this.data.pendingCheck&&!this.data.submitting&&!this.data.checking&&this._pending.owner===ownerKey())return this.sendBooking(this._pending.payload,true);},
 async sendBooking(payload,retry=false){
  if(this._disposed||this.data.submitting||this.data.submitted)return;
  const task={},started=uid();let owner=ownerKey(),dispatched=false;this._submitTask=task;
  const active=()=>this.active(owner)&&this._submitTask===task;
  this.setData({submitting:true,submitError:''});
  try{
   if(api.online()&&!api.hasSession())await api.login();
   if(this._disposed||this._submitTask!==task||(started!=='guest'&&owner!==ownerKey()))throw Error('账号已变化，请重新打开预约页面。');
   owner=ownerKey();this._owner=owner;
   let result;
   if(api.online()){
    try{const saved=pendingStore.save(owner,payload,this.data.item?.title||this.data.recoveryTitle);this._pending={owner,payload:{...saved.payload}};this.setData({pendingCheck:true,recoveryTitle:saved.title});}
    catch(error){this.setData({recoveryError:error.message||'预约恢复信息未能保存，申请尚未发送。'});throw error;}
    dispatched=true;result=await api.request('POST','/api/v1/bookings',payload,true,uid());
   }
   else{const booking=db.createBooking({...payload,serviceTitle:this.data.item.title});result={booking:booking||{id:'demo',status:'pending_confirm'}};}
   if(!active())return;
   if(!result?.booking?.id||(api.online()&&!this.validReceipt(result.booking,payload)))throw Error('预约结果暂未确认，请先核对原申请。');
   this.acknowledge(result);
  }catch(e){
   if(!active())return;
   const definite=['SLOT_TAKEN','SLOT_EXPIRED','INVALID_TIME','INVALID_SLOT','INVALID_SERVICE','INVALID_TEXT','INVALID_FIELD','INVALID_REQUEST_KEY','SERVICE_NOT_AVAILABLE','EXISTING_BOOKING_DIFFERENT'].includes(e.code);
   const uncertain=api.online()&&dispatched&&!definite;
   if(uncertain){this._pending={owner,payload:{...payload}};this.setData({pendingCheck:true,submitError:'预约结果暂未确认，请核对记录或重试原申请；当前保留原时段和备注。'});}
   else{if(dispatched)this.clearPending(payload,owner);this._pending=null;this.setData({submitError:e.message||'预约申请暂未提交，请重试。',pendingCheck:false,rejectedText:dispatched?'原申请未创建预约。'+(e.message||'请重新选择后申请。'):''});if(['SLOT_TAKEN','SLOT_EXPIRED','INVALID_TIME'].includes(e.code)){this._preferred=null;await this.loadSlots(payload.date);}}
  }finally{if(active()){this._submitTask=null;this.setData({submitting:false});}}
 },
 validReceipt(b,p){return /^[0-9a-f-]{36}$/i.test(b.id||'')&&b.clientKey===p.clientKey&&b.serviceId===p.serviceId&&Date.parse(b.requestedAt)===Date.parse(p.date+'T'+p.time+':00+08:00')&&['pending_confirm','confirmed','completed','cancelled','declined','expired'].includes(b.status);},
 clearPending(payload,owner){try{pendingStore.remove(owner,payload);}catch(e){this.setData({recoveryError:e.message||'本机恢复记录暂未更新，请稍后重试。'});}},
 acknowledge(result){
  if(api.online()&&this._pending)this.clearPending(this._pending.payload,this._pending.owner);this._pending=null;
  const labels={pending_confirm:'预约申请已提交，仍需服务方确认。',confirmed:'原预约已确认。',completed:'原预约已完成。',cancelled:'原预约已取消，没有重新申请。',declined:'原预约已被商家拒绝，没有重新申请。',expired:'原预约等待超时，时段已释放，没有重新申请。'};
  this.setData({submitted:result.booking,pendingCheck:false,submitError:'',successText:api.online()?(clock.cancellationText(result.booking.cancellationReason)||labels[result.booking.status]||'已找到原预约，请查看最新状态。'):'本机预约演示已创建，没有发生真实派单或付款。'});
 },
 async checkSubmission(){
  if(!this._pending||this._pending.owner!==ownerKey()||this.data.checking||this.data.submitting||this._disposed)return;
  const pending=this._pending,owner=ownerKey(),task={};this._checkTask=task;this.setData({checking:true,submitError:''});
  const active=()=>this.active(owner)&&this._checkTask===task&&this._pending===pending;
  try{
   const r=await api.request('GET','/api/v1/me/booking-submissions/'+encodeURIComponent(pending.payload.clientKey),null,true,uid());if(!active())return;
   const reasons={SLOT_TAKEN:'原时段已被占用，请重新选择。',SLOT_EXPIRED:'原时段已失效，请重新选择日期和时段。',SERVICE_NOT_AVAILABLE:'原服务暂不可预约。',EXISTING_BOOKING_DIFFERENT:'该时段已有您的另一份预约，请查看我的预约。'};
   if(r.rejected===true&&r.clientKey===pending.payload.clientKey&&reasons[r.errorCode]){this.clearPending(pending.payload,owner);this._pending=null;this.setData({pendingCheck:false,submitError:'',rejectedText:'已核对：原申请未创建预约。'+reasons[r.errorCode]});if(this.data.item&&this.data.date>=clock.today())await this.loadSlots();return;}
   if(r.booking&&this.validReceipt(r.booking,pending.payload))this.acknowledge({booking:r.booking,replayed:true});
   else this.setData({submitError:'暂未查到本次有效预约，请稍后再核对或重试原申请；尚不能确认原申请失败。'});
  }catch(e){if(active())this.setData({submitError:e.code==='BOOKING_SUBMISSION_NOT_FOUND'?'暂未查到本次申请，请稍后核对或重试原申请；尚不能确认原申请失败。':'预约核对暂未完成，请稍后重试。'});}
  finally{if(this.active(owner)&&this._checkTask===task){this._checkTask=null;this.setData({checking:false});}}
 },
 viewBookings(){if(!this._disposed)wx.redirectTo({url:'/pages/my-bookings/index'});}
});
