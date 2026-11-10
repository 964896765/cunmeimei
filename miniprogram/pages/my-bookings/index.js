const db=require('../../utils/storage'),api=require('../../utils/api'),pendingStore=require('../../utils/booking-pending');
const labels={pending_confirm:'待服务方确认',confirmed:'已确认',completed:'已完成',cancelled:'已取消',declined:'商家已拒绝',expired:'等待超时，已释放'};
const owner=()=>wx.getStorageSync('city_life_user_id')||'';
const session=()=>owner()+':'+(wx.getStorageSync('city_life_v2_auth_token')||'');
function slot(value){const n=value?new Date(value).getTime():NaN,date=new Date(n+8*3600e3);if(!Number.isFinite(date.getTime()))return {date:'时间待确认',time:''};const text=date.toISOString();return {date:text.slice(0,10),time:text.slice(11,16)};}
Page({
 data:{items:[],online:api.online(),loading:false,error:'',actionError:'',cancelingId:'',pendingItems:[],recoveryError:''},
 returnToMe(){require('../../utils/navigation').personalCenter();},
 onShow(){require('../../utils/theme').apply(this);this.bindOwner();return this.refresh();},
 onUnload(){this._disposed=true;this._request=(this._request||0)+1;this._epoch=(this._epoch||0)+1;},
 bindOwner(){const uid=owner();if(this._owner!==undefined&&uid!==this._owner){this._epoch=(this._epoch||0)+1;this._cancelTask=null;this.setData({items:[],error:'',actionError:'',cancelingId:'',pendingItems:[],recoveryError:''});}this._owner=uid;},
 loadRecoveries(){
  if(!api.online()||!api.hasSession()){this.setData({pendingItems:[],recoveryError:''});return;}
  try{this.setData({pendingItems:pendingStore.list(pendingStore.context()).map(entry=>({...entry.payload,title:entry.title})),recoveryError:''});}
  catch(e){this.setData({pendingItems:[],recoveryError:e.message||'待核对申请暂时无法读取。'});}
 },
 openBusiness(e){const row=this.data.items.find(x=>x.id===e.currentTarget.dataset.id);if(!row)return;wx.navigateTo({url:'/pages/business/index?'+(row.businessCaseId?'id='+encodeURIComponent(row.businessCaseId):'sourceKind=booking&sourceId='+encodeURIComponent(row.id))});},
 resumePending(e){const id=e.currentTarget.dataset.id;if(!this.data.pendingItems.some(p=>p.serviceId===id))return;wx.navigateTo({url:'/pages/booking/index?id='+encodeURIComponent(id)});},
 active(uid,request){return !this._disposed&&uid===owner()&&request===this._request;},
 async refresh(){
  if(this._disposed)return;this.bindOwner();this.loadRecoveries();
  if(!api.online()){this.setData({items:db.getStore().bookings,loading:false,error:'',actionError:''});return;}
  const request=this._request=(this._request||0)+1;let uid=owner();this.setData({loading:true,error:''});
  try{
   if(!api.hasSession())await api.login();if(this._disposed||request!==this._request)return;this.bindOwner();uid=owner();this.loadRecoveries();
   const r=await api.request('GET','/api/v1/me/bookings',null,true,uid);if(!this.active(uid,request))return;
   this.setData({items:(r.items||[]).map(x=>({...x,...slot(x.requestedAt),cancellationText:require('../../utils/booking-time').cancellationText(x.cancellationReason),statusText:labels[x.status]||'状态待更新',canCancel:x.status==='pending_confirm'})),loading:false,error:'',actionError:''});
  }catch(error){if(this.active(uid,request))this.setData({loading:false,error:error.message||'预约记录暂时无法读取，请重试。'});}
 },
 cancel(e){
  if(this._disposed||this.data.loading||this.data.cancelingId||this.data.actionError)return;
  const id=e.currentTarget.dataset.id,item=this.data.items.find(x=>x.id===id);
  if(!item||(api.online()?!item.canCancel:item.status==='已取消'))return;
  const uid=owner(),scope=session(),epoch=this._epoch,task={};this._cancelTask=task;
  const active=()=>!this._disposed&&uid===owner()&&epoch===this._epoch&&task===this._cancelTask;
  const release=()=>{if(active()){this._cancelTask=null;this.setData({cancelingId:''});}};
  this.setData({cancelingId:id});
  wx.showModal({title:'取消预约申请？',content:api.online()?'仅待确认申请可取消。':'将修改本机演示预约状态。',success:async({confirm})=>{
   if(!confirm||!active()||scope!==session()||(api.online()&&!this.data.items.some(x=>x.id===id&&x.canCancel))){release();return;}
   try{
    if(api.online())await api.request('POST','/api/v1/bookings/'+encodeURIComponent(id)+'/cancel',{},true,uid);else db.cancelBooking(id);
    if(!active())return;
    this.setData({items:this.data.items.map(x=>x.id===id?{...x,status:api.online()?'cancelled':'已取消',statusText:'已取消',canCancel:false}:x)});
    await this.refresh();
   }catch(error){if(active())this.setData({actionError:error.code==='CANNOT_CANCEL'?'该预约状态已变化，请刷新后查看。':'取消结果暂未确认，请刷新预约状态后再操作。'});}
   finally{release();}
  },fail:release});
 }
});
