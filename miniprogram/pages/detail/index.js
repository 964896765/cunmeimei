const api=require('../../utils/api'),nav=require('../../utils/navigation'),present=require('../../utils/presentation');
const uid=()=>wx.getStorageSync('city_life_user_id')||'guest';
const ownerKey=()=>JSON.stringify([uid(),!!wx.getStorageSync('city_life_acceptance_mode')]);
const sessionKey=()=>ownerKey()+':'+(wx.getStorageSync('city_life_v2_auth_token')||'');
const freshKey=prefix=>prefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
function feedback(page,field,message,selector){const owner=ownerKey(),id=page.itemId;page.setData({[field]:message},()=>{if(!page.unloaded&&owner===ownerKey()&&id===page.itemId&&page.data[field]===message)wx.pageScrollTo?.({selector,duration:page.data.displayPreferences?.reduceMotion?0:150});});}
function action(page,name){
 const token={},id=page.itemId;let owner=ownerKey(),session=sessionKey();page[name]=token;
 const valid=()=>!page.unloaded&&page[name]===token&&id===page.itemId&&owner===ownerKey();
 return {id,valid,sameSession:()=>valid()&&session===sessionKey(),
  async auth(){
   if(!valid())throw Error('账号或页面已变化，请重新操作');
   const started=uid();if(!api.hasSession())await api.login();
   if(page.unloaded||page[name]!==token||id!==page.itemId||(started!=='guest'&&owner!==ownerKey()))throw Error('账号或页面已变化，请重新操作');
   if(started==='guest')page.pageOwner=ownerKey();
   owner=ownerKey();session=sessionKey();return uid();
  },
  finish(patch){if(valid()){page[name]=null;if(patch)page.setData(patch);}}
 };
}
Page({
 data:{item:null,loading:true,error:'',faved:false,saving:false,favoriteReady:false,favoriteLoading:false,favoriteError:'',typelabel:'',canBook:false,canChat:false,online:api.online(),contactBusy:false,contactDraft:'',contactError:'',phoneBusy:false,reportBusy:false,reportDraft:'',reportError:'',historyNotice:''},
 onLoad(opts){this.itemId=opts.id;if(!this.itemId)this.setData({loading:false,error:'缺少信息标识，请返回重新选择。'});},
 syncOwner(){
  const owner=ownerKey();
  if(this.pageOwner!==undefined&&this.pageOwner!==owner){
   for(const name of ['_contactTask','_phoneTask','_reportTask','_favoriteTask'])this[name]=null;
   this.setData({item:null,faved:false,saving:false,favoriteReady:false,favoriteLoading:false,contactDraft:'',contactBusy:false,contactError:'',reportDraft:'',reportBusy:false,reportError:'',phoneBusy:false});
  }
  this.pageOwner=owner;
 },
 onShow(){require('../../utils/theme').apply(this);if(require('../../utils/auth-intent').isReturning(this.route))return;if(this.itemId)return this.refresh();},
 onUnload(){this.unloaded=true;this.refreshVersion=(this.refreshVersion||0)+1;},
 refresh(){
  this.syncOwner();const context=sessionKey();
  if(this.refreshPromise&&this.refreshContext===context)return this.refreshPromise;
  const version=this.refreshVersion=(this.refreshVersion||0)+1;this.refreshContext=context;
  this.setData({loading:true,error:'',favoriteLoading:false,favoriteReady:!!this.data.saving,favoriteError:''});
  let attempt;
  attempt=(async()=>{
   try{
    const r=await api.request('GET','/api/v1/items/'+encodeURIComponent(this.itemId));
    if(this.unloaded||version!==this.refreshVersion||context!==sessionKey())return;
    if(r.item.attributes?.industryProjectId){wx.redirectTo({url:'/pages/industry/index?id='+encodeURIComponent(this.itemId)});return;}
    const item=present.item(r.item);this.setData({item,typelabel:item.category,canBook:item.kind==='service',loading:false});
    try{require('../../utils/recent').record?.(item.id);this.setData({historyNotice:''});}catch{this.setData({historyNotice:'浏览记录未能保存，不影响查看信息。'});}
    wx.setNavigationBarTitle({title:item.category});
    await this.loadFavorite(version);
   }catch(e){if(!this.unloaded&&version===this.refreshVersion&&context===sessionKey())this.setData({loading:false,error:e.message,item:null});}
  })().finally(()=>{if(this.refreshPromise===attempt)this.refreshPromise=null;});
  this.refreshPromise=attempt;return attempt;
 },
 async loadFavorite(version=this.refreshVersion){
  if(this.data.saving||this.data.favoriteLoading||!this.data.item)return;
  const owner=ownerKey();this.setData({favoriteLoading:true,favoriteReady:false,favoriteError:''});
  try{const saved=api.hasSession()?(await api.request('GET','/api/v1/items/'+this.itemId+'/saved',null,true,uid())).saved:false;if(!this.unloaded&&version===this.refreshVersion&&owner===ownerKey())this.setData({faved:saved,favoriteReady:true});}
  catch(e){if(!this.unloaded&&version===this.refreshVersion&&owner===ownerKey())this.setData({favoriteError:'收藏状态暂未同步，请重试。'});}
  finally{if(!this.unloaded&&version===this.refreshVersion&&owner===ownerKey())this.setData({favoriteLoading:false});}
 },
 retryFavorite(){return this.loadFavorite();},
 async toggleFavorite(){
  if(!this.data.item||this.data.saving||!this.data.favoriteReady)return;
  const a=action(this,'_favoriteTask');this.setData({saving:true});
  try{const owner=await a.auth();const r=await api.request(this.data.faved?'DELETE':'PUT','/api/v1/items/'+a.id+'/saved',{},true,owner);if(a.valid()){this.setData({faved:r.saved});wx.showToast({title:r.saved?'已收藏':'已取消收藏',icon:'none'});}}
  catch(e){if(a.valid())api.showError(e);}finally{a.finish({saving:false});}
 },
 previewImage(e){if(this.data.item)wx.previewImage({current:e.currentTarget.dataset.url,urls:this.data.item.images});},
 book(){if(this.data.item&&this.data.canBook)wx.navigateTo({url:'/pages/booking/index?id='+encodeURIComponent(this.itemId)});},
 openService(e){nav.detail(e.currentTarget.dataset.id);},
 async talk(){
  if(!this.data.item||this.data.contactBusy||this.data.item.contact?.allowMessages===false)return;
  const a=action(this,'_contactTask');this.setData({contactBusy:true,contactError:''});
  try{
   const owner=await a.auth();if(!a.valid())return;
   wx.showModal({title:'申请联系发布者',editable:true,content:this.data.contactDraft||'',placeholderText:'说明想了解的内容，勿填写敏感信息',success:async r=>{
    if(!r.confirm||!a.sameSession()){a.finish({contactBusy:false});return;}
    this.setData({contactDraft:r.content||''});
    try{await api.request('POST','/api/v1/items/'+a.id+'/contact',{message:r.content||''},true,owner);if(a.valid()){this.setData({contactDraft:'',contactError:''});wx.showToast({title:'申请已发送，请留意消息',icon:'none'});}}
    catch(e){if(a.valid())feedback(this,'contactError',e.message||'联系申请暂未完成，请重试。','#contact-feedback');}finally{a.finish({contactBusy:false});}
   },fail:()=>a.finish({contactBusy:false})});
  }catch(e){if(a.valid())this.setData({contactError:e.message});a.finish({contactBusy:false});}
 },
 async callPublisher(){
  if(!this.data.item?.contact?.phoneAvailable||this.data.phoneBusy)return;
  const a=action(this,'_phoneTask');this.setData({phoneBusy:true});
  try{const owner=await a.auth(),r=await api.request('POST','/api/v1/items/'+a.id+'/phone',{},true,owner);if(a.valid()&&this.data.item?.contact?.phoneAvailable)wx.makePhoneCall({phoneNumber:r.phone});}
  catch(e){if(a.valid()){if(e.code==='PHONE_VERIFICATION_REQUIRED')require('../../utils/verification').open();else api.showError(e);}}finally{a.finish({phoneBusy:false});}
 },
 onShareAppMessage(){return {title:this.data.item?.title||'同城生活',path:'/pages/detail/index?id='+this.itemId};},
 async report(){
  if(!api.online()){wx.showToast({title:'演示模式无法提交举报',icon:'none'});return;}
  if(!this.data.item||this.data.item.kind==='merchant'||this.data.reportBusy)return;
  const item=this.data.item,a=action(this,'_reportTask'),codes=['false_info','spam','unsafe','other'];this.setData({reportBusy:true,reportError:''});
  try{
   const owner=await a.auth();if(!a.valid())return;
   wx.showActionSheet({itemList:['信息失实','垃圾广告','存在安全风险','其他问题'],success:({tapIndex})=>{
    if(!a.sameSession()||!codes[tapIndex]){a.finish({reportBusy:false});return;}
    wx.showModal({title:'确认举报',editable:true,content:this.data.reportDraft||'',placeholderText:'补充描述（选填），不填写无关隐私',success:async r=>{
     if(!r.confirm||!a.sameSession()){a.finish({reportBusy:false});return;}this.setData({reportDraft:r.content||''});
     try{await api.request('POST','/api/v1/reports',{targetType:item.kind==='service'?'service':'publication',targetId:item.id,reason:codes[tapIndex],description:r.content||''},true,owner);if(a.valid()){this.setData({reportDraft:'',reportError:''});wx.showToast({title:'已提交举报'});}}
     catch(e){if(a.valid())feedback(this,'reportError',e.message||'举报暂未提交，请重试。','#report-feedback');}finally{a.finish({reportBusy:false});}
    },fail:()=>a.finish({reportBusy:false})});
   },fail:()=>a.finish({reportBusy:false})});
  }catch(e){if(a.valid())this.setData({reportError:e.message});a.finish({reportBusy:false});}
 },
 warn(){wx.showModal({title:'信息提示',content:'内容审核不代表质量保证。请自行核实商品、房源和服务情况，不提前向陌生人转账。',showCancel:false});}
});
