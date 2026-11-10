const api=require('../../utils/api'),clock=require('../../utils/booking-time');
const labels={pending_confirm:'待确认',confirmed:'已确认',declined:'已拒绝',completed:'已完成',cancelled:'已取消',expired:'等待超时，已释放'};
const transitions={confirm:['pending_confirm','confirmed'],decline:['pending_confirm','declined'],complete:['confirmed','completed']};
const uid=()=>wx.getStorageSync('city_life_user_id')||'guest';
const ownerKey=()=>JSON.stringify([uid(),!!wx.getStorageSync('city_life_acceptance_mode')]);
const sessionKey=()=>ownerKey()+':'+(wx.getStorageSync('city_life_v2_auth_token')||'');
const row=b=>({...b,cancellationText:clock.cancellationText(b.cancellationReason),statusText:labels[b.status]||'状态待更新',requestedLabel:clock.requestedLabel(b.requestedAt),canConfirm:b.status==='pending_confirm',canComplete:b.status==='confirmed'});
Page({
 data:{merchantId:'',items:[],loading:false,error:'',canAct:false,busyId:'',actionError:'',actionNotice:''},
 onLoad(q={}){this.setData({merchantId:q.merchantId||''});},
 openBusiness(e){const row=this.data.items.find(x=>x.id===e.currentTarget.dataset.id);if(!row)return;wx.navigateTo({url:'/pages/business/index?'+(row.businessCaseId?'id='+encodeURIComponent(row.businessCaseId):'sourceKind=booking&sourceId='+encodeURIComponent(row.id))});},
 onShow(){require('../../utils/theme').apply(this);this.bindOwner();return this.load();},
 onUnload(){this._disposed=true;this._version=(this._version||0)+1;this._actionTask=null;},
 onPullDownRefresh(){return this.load().finally(()=>wx.stopPullDownRefresh());},
 bindOwner(){const owner=ownerKey();if(this._owner!==undefined&&this._owner!==owner){this._version=(this._version||0)+1;this._actionTask=null;this.setData({items:[],canAct:false,busyId:'',error:'',actionError:'',actionNotice:''});}this._owner=owner;},
 active(owner,merchantId=this.data.merchantId){return !this._disposed&&owner===ownerKey()&&merchantId===this.data.merchantId;},
 async load(){
  if(this._disposed)return;this.bindOwner();const version=this._version=(this._version||0)+1,merchantId=this.data.merchantId;let owner=ownerKey();
  if(!/^[0-9a-f-]{36}$/i.test(merchantId)){this.setData({items:[],loading:false,canAct:false,error:'商家标识无效，请返回商家中心重新打开。'});return;}
  this.setData({loading:true,error:''});
  try{
   const started=uid();if(!api.hasSession())await api.login();
   if(this._disposed||version!==this._version||(started!=='guest'&&owner!==ownerKey()))return;
   if(started==='guest')this._owner=ownerKey();else this.bindOwner();owner=ownerKey();
   const r=await api.request('GET','/api/v1/merchants/'+encodeURIComponent(merchantId)+'/bookings',null,true,uid());
   if(!this.active(owner,merchantId)||version!==this._version)return;
   this.setData({items:(r.items||[]).map(row),canAct:true,loading:false,error:'',actionError:''});
  }catch(e){if(this.active(owner,merchantId)&&version===this._version){const denied=['MERCHANT_FORBIDDEN','FORBIDDEN','ACCOUNT_CLOSED','ACCOUNT_INACTIVE','LOGIN_REQUIRED','SESSION_EXPIRED'].includes(e.code);this.setData({...(denied?{items:[]}:{}),loading:false,canAct:false,error:e.message||'预约列表暂不可用，请重试。'});}}
 },
 action(e){
  if(this._disposed||this.data.loading||!this.data.canAct||this.data.busyId||this.data.actionError)return;
  const {id,action}=e.currentTarget.dataset,transition=transitions[action],item=this.data.items.find(x=>x.id===id);
  if(!transition||!item||item.status!==transition[0])return;
  const owner=ownerKey(),session=sessionKey(),merchantId=this.data.merchantId,task={};this._actionTask=task;this.setData({busyId:id,actionError:'',actionNotice:''});
  const active=()=>this.active(owner,merchantId)&&this._actionTask===task;
  const release=()=>{if(active()){this._actionTask=null;this.setData({busyId:''});}};
  wx.showModal({title:{confirm:'确认接受该预约？',decline:'拒绝该预约？',complete:'标记服务已完成？'}[action],content:'此操作更新预约状态，不涉及线上付款。请核实后再确认。',success:async r=>{
   const current=this.data.items.find(x=>x.id===id);
   if(!r.confirm||!active()||session!==sessionKey()||this.data.loading||!this.data.canAct||!current||current.status!==transition[0]){release();return;}
   try{
    const result=await api.request('POST','/api/v1/merchants/'+encodeURIComponent(merchantId)+'/bookings/'+encodeURIComponent(id)+'/action',{action},true,uid());
    if(!active())return;
    if(result?.booking?.id!==id||result.booking.status!==transition[1])throw Error('预约处理结果暂未确认');
    this.setData({items:this.data.items.map(x=>x.id===id?row({...x,...result.booking}):x),actionNotice:{confirm:'已确认预约。',decline:'已拒绝预约。',complete:'已标记服务完成。'}[action]});
    await this.load();
   }catch(error){if(active()){const denied=error.code==='MERCHANT_FORBIDDEN';this.setData({...(denied?{items:[],canAct:false}:{}),actionError:error.code==='STALE_BOOKING'?'预约状态已变化，请先刷新后查看。':'处理结果暂未确认，请先刷新预约状态，避免重复操作。'});}}
   finally{release();}
  },fail:release});
 }
});
