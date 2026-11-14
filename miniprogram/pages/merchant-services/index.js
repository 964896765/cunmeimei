const api=require('../../utils/api');
const owner=()=>wx.getStorageSync('city_life_user_id')||'';
const context=()=>owner()+':'+(wx.getStorageSync('city_life_v2_auth_token')||'');
const live=(page,uid)=>!page._disposed&&owner()===uid;
Page({data:{items:[],title:'',description:'',price:'面议',editingId:'',merchantId:'',canEdit:false,photos:[],uploading:false,saving:false,error:'',loading:false,loadError:'',online:api.online()},
 onLoad(q){this._ownerUid=owner();this.setData({merchantId:q.merchantId||''});},
 onShow(){require('../../utils/theme').apply(this);if(this._ownerUid!==undefined&&this._ownerUid!==owner()){this._editorVersion=(this._editorVersion||0)+1;this.serviceBusy=false;this.setData({items:[],canEdit:false,editingId:'',title:'',description:'',price:'面议',photos:[],uploading:false,saving:false,error:''});}this._ownerUid=owner();if(this.data.merchantId)this.load();},
 onUnload(){this._disposed=true;},
 async load(){
  const version=this._listVersion=(this._listVersion||0)+1,merchantId=this.data.merchantId;let uid=owner();this.setData({loading:true,loadError:''});
  try{
   if(!api.hasSession())await api.login();if(this._disposed||version!==this._listVersion)return;uid=owner();this._ownerUid=uid;
   const [r,m]=await Promise.all([api.request('GET','/api/v1/merchants/'+encodeURIComponent(merchantId)+'/services',null,true,uid),api.request('GET','/api/v1/me/merchants',null,true,uid)]);
   if(!live(this,uid)||version!==this._listVersion||merchantId!==this.data.merchantId)return;
   const role=(m.items||[]).find(x=>x.id===merchantId)?.role;this.setData({loading:false,items:r.items||[],canEdit:role==='owner'||role==='manager'});
  }catch(e){if(live(this,uid)&&version===this._listVersion)this.setData({loadError:e.message||'服务列表暂不可用，请重试',canEdit:false});}
  finally{if(live(this,uid)&&version===this._listVersion&&this.data.loading)this.setData({loading:false});}
 },
 async serviceAction(e){
  if(this.serviceBusy||this.data.saving||this.data.uploading)return;
  const serviceId=e.currentTarget.dataset.id, action=e.currentTarget.dataset.action;
  if(!['pause','resubmit'].includes(action)||!serviceId||!this.data.canEdit)return;
  if(action==='resubmit')return this.editService(e);
  const uid=owner(),session=context(),merchantId=this.data.merchantId;this.serviceBusy=true;
  const labels=action==='pause'?['暂停该服务？','暂停后不再接受新的预约，已有预约仍需正常处理。']:['重新提交审核？','提交后需平台审核通过才能再次上架。'];
  const answer=await new Promise(resolve=>wx.showModal({title:labels[0],content:labels[1],success:result=>resolve(!!result.confirm),fail:()=>resolve(false)}));
  if(!answer||!live(this,uid)||session!==context()||merchantId!==this.data.merchantId||!this.data.canEdit){this.serviceBusy=false;return;}
  try{
   await api.request('POST','/api/v1/merchants/'+encodeURIComponent(merchantId)+'/services/'+encodeURIComponent(serviceId)+'/action',{action},true,uid);
   if(!live(this,uid))return;
   wx.showToast({title:action==='pause'?'服务已暂停':'已重新提交审核',icon:'none'});
   await this.load();
  }catch(error){if(live(this,uid))api.showError(error);}finally{if(live(this,uid))this.serviceBusy=false;}
 },
 async editService(e){require('../../utils/publication-consent').reset(this);
  if(this.data.uploading||this.data.saving)return;const item=this.data.items.find(x=>x.id===e.currentTarget.dataset.id);if(!item||!this.data.canEdit)return;
  const uid=owner(),version=this._editorVersion=(this._editorVersion||0)+1;
  this.setData({editingId:item.id,title:item.title,description:item.description,price:item.price,photos:(item.imageIds||[]).map(id=>({id,path:''})),error:''});wx.pageScrollTo({scrollTop:9999,duration:200});
  const photos=await Promise.all((item.imageIds||[]).map(async id=>{try{return {id,path:await api.privateImage(id)};}catch{return {id,path:''};}}));
  if(live(this,uid)&&version===this._editorVersion&&this.data.editingId===item.id)this.setData({photos:this.data.photos.map(x=>photos.find(p=>p.id===x.id)||x)});
 },
 cancelEdit(){require('../../utils/publication-consent').reset(this);if(this.data.uploading||this.data.saving)return;this._editorVersion=(this._editorVersion||0)+1;this.setData({editingId:'',title:'',description:'',price:'面议',photos:[],error:''});},
 choosePhotos(){require('../../utils/publication-consent').reset(this);
  if(this.data.uploading||this.data.saving||!this.data.canEdit||this.data.photos.length>=6)return;
  const uid=owner(),session=context(),id=this.data.editingId,version=this._editorVersion,active=()=>live(this,uid)&&version===this._editorVersion&&id===this.data.editingId;
  require('../../utils/image-picker').chooseImages({count:6-this.data.photos.length,success:async r=>{
   if(!active()||!this.data.canEdit)return;this.setData({uploading:true,error:''});
   try{for(const f of r.tempFiles){if(!active()||!this.data.canEdit||this.data.photos.length>=6)break;const photo=await api.uploadImage(f.tempFilePath,session);if(!active()||!this.data.canEdit)break;this.setData({photos:[...this.data.photos,{id:photo.id,path:f.tempFilePath}]});}}
   catch(e){if(active())this.setData({error:e.message+'，可以重试上传'});}finally{if(active())this.setData({uploading:false});}
  }});
 },
 removePhoto(e){require('../../utils/publication-consent').reset(this);if(this.data.uploading||this.data.saving)return;this.setData({photos:this.data.photos.filter((_,i)=>i!==+e.currentTarget.dataset.index)});},
 previewPhoto(e){const urls=this.data.photos.map(x=>x.path).filter(Boolean);if(urls.length)wx.previewImage({current:e.currentTarget.dataset.path,urls});},
 input(e){require('../../utils/publication-consent').reset(this);const field=e.currentTarget.dataset.field;if(this.data.saving||this.data.uploading||!['title','description','price'].includes(field))return;this.setData({[field]:e.detail.value});},
 publicationConsentChanged(e){require('../../utils/publication-consent').changed(this,e);},
 async submit(){
  if(!require('../../utils/publication-consent').requireConsent(this))return;
  if(this.data.saving||this.data.uploading||!this.data.canEdit)return;
  const uid=owner(),version=this._editorVersion,id=this.data.editingId,merchantId=this.data.merchantId,active=()=>live(this,uid)&&version===this._editorVersion&&id===this.data.editingId&&merchantId===this.data.merchantId;
  this.setData({saving:true,error:''});
  try{
   await api.request(id?'PUT':'POST','/api/v1/merchants/'+encodeURIComponent(merchantId)+'/services'+(id?'/'+encodeURIComponent(id):''),{publicationConsent:this.data.publicationConsent,title:this.data.title,description:this.data.description,price:this.data.price,imageIds:this.data.photos.map(x=>x.id)},true,uid);
   if(!active())return;this.setData({editingId:'',title:'',description:'',price:'面议',photos:[]});wx.showToast({title:'已提交服务审核'});await this.load();
  }catch(e){if(active()){require('../../utils/publication-consent').recover(this,e);this.setData({error:e.message});}}finally{if(live(this,uid)&&version===this._editorVersion)this.setData({saving:false});}
 }
});
