const db=require('../../utils/storage');
const api=require('../../utils/api');
const labels={pending:'待审核',published:'已发布',rejected:'已驳回',closed:'已结束'};
const owner=()=>wx.getStorageSync('city_life_user_id')||'';
const context=()=>owner()+':'+(wx.getStorageSync('city_life_v2_auth_token')||'');
const live=(page,uid)=>!page._disposed&&owner()===uid;
Page({returnToMe(){require('../../utils/navigation').personalCenter();},
 contactSettings(e){const id=e.currentTarget.dataset.id,owner=wx.getStorageSync('city_life_user_id');wx.showActionSheet({itemList:['撤回本条公开电话','切换陌生人联系权限'],success:async r=>{try{const settings=await api.request('GET','/api/v1/me/publications/'+id+'/contact-settings',null,true,owner);const next=r.tapIndex===0?{...settings,publicPhone:false}:{...settings,allowMessages:!settings.allowMessages};if(next.publicPhone){wx.showToast({title:'请先撤回公开电话再修改其他联系设置',icon:'none'});return;}await api.request('PUT','/api/v1/me/publications/'+id+'/contact-settings',next,true,owner);wx.showToast({title:'联系设置已更新'});}catch(e){api.showError(e);}}});},
 data:{hasMore:false,nextCursor:'',items:[],online:api.online(),busy:false,editing:false,editForm:null,editDistricts:[],loading:false,loadError:''},
 onShow(){require('../../utils/theme').apply(this);if(this._ownerUid!==undefined&&this._ownerUid!==owner()){this._editorVersion=(this._editorVersion||0)+1;this.setData({hasMore:false,nextCursor:'',items:[],editing:false,editForm:null,busy:false,loadError:''});}this._ownerUid=owner();this.refresh();},
 onUnload(){this._disposed=true;},
 more(){return this.refresh(true);},
 async refresh(more=false){more=more===true;if(more&&(this.data.loading||!this.data.hasMore))return;
  if(!api.online()){
   this.setData({items:db.getStore().publications.map(x=>({...x,canWithdraw:x.status==='待审核（演示）',canEdit:x.status==='待审核（演示）'}))});return;
  }
  const version=this._listVersion=(this._listVersion||0)+1;let uid=owner();this.setData({loading:true,loadError:''});
  try{
   if(!api.hasSession())await api.login();if(this._disposed||version!==this._listVersion)return;if(more&&uid!==owner()){this.setData({items:[],hasMore:false,nextCursor:''});more=false;}uid=owner();this._ownerUid=uid;
   const r=await api.request('GET','/api/v1/me/publications?limit=20'+(more?'&cursor='+encodeURIComponent(this.data.nextCursor):''),null,true,uid);
   if(!live(this,uid)||version!==this._listVersion)return;
   const unique=new Map((more?this.data.items:[]).map(x=>[x.id,x]));for(const item of r.items||[])unique.set(item.id,item);
   this.setData({hasMore:!!r.hasMore,nextCursor:r.nextCursor||'',loading:false,items:[...unique.values()].map(x=>({...x,statusLabel:x.status==='published'&&x.expiresAt&&new Date(x.expiresAt)<new Date()?'已过期':labels[x.status]||x.status,expiryText:x.status==='published'&&x.expiresAt?(new Date(x.expiresAt)<=new Date()?'已到期，编辑后可重新提交审核':'展示至 '+new Date(x.expiresAt).toLocaleDateString()):'',dateText:x.createdAt?new Date(x.createdAt).toLocaleDateString():'',detail:x.detail||x.description,canWithdraw:['pending','published'].includes(x.status),canEdit:['pending','published','rejected'].includes(x.status)}))});
  }catch(e){if(live(this,uid)&&version===this._listVersion)this.setData({loadError:e.message||'发布记录暂不可用，请重试'});}
  finally{if(live(this,uid)&&version===this._listVersion&&this.data.loading)this.setData({loading:false});}
 },
 async startEdit(e){require('../../utils/publication-consent').reset(this);
  if(this.data.busy)return;
  const item=this.data.items.find(x=>x.id===e.currentTarget.dataset.id);
  if(!item||!item.canEdit)return;
  if(item.attributes?.industryProjectId){wx.navigateTo({url:'/pages/industry/index?own='+item.id});return;}
  const uid=owner(),version=this._editorVersion=(this._editorVersion||0)+1;
  let districts=[item.district];
  if(api.online()){
   try{const config=await api.request('GET','/api/v1/config');districts=(config.areas||[]).slice();}
   catch(e){if(live(this,uid)&&version===this._editorVersion)api.showError(e);return;}
  }
  if(!live(this,uid)||version!==this._editorVersion)return;
  if(!districts.includes(item.district))districts.unshift(item.district);
  this.setData({editing:true,editDistricts:districts,editForm:{id:item.id,type:item.type,title:item.title,detail:item.detail||item.description||'',price:item.price||'',district:item.district,revision:item.revision||1,attributes:item.attributes||{},photos:(item.imageIds||[]).map(id=>({id,path:''})),originalImageIds:item.imageIds||[]}});
  if(api.online()){const photos=await Promise.all((item.imageIds||[]).map(async id=>{try{return {id,path:await api.privateImage(id)};}catch{return {id,path:''};}}));if(live(this,uid)&&version===this._editorVersion&&this.data.editForm?.id===item.id)this.setData({'editForm.photos':this.data.editForm.photos.map(x=>photos.find(photo=>photo.id===x.id)||x)});}
 },
 editAttribute(e){require('../../utils/publication-consent').reset(this);this.setData({['editForm.attributes.'+e.currentTarget.dataset.field]:e.detail.value});},
 async addPhoto(){require('../../utils/publication-consent').reset(this);
  if(this.data.busy||!this.data.editForm||this.data.editForm.photos.length>=6)return;
  const uid=owner(),session=context(),id=this.data.editForm.id,version=this._editorVersion;
  const active=()=>live(this,uid)&&this.data.editing&&this.data.editForm?.id===id&&version===this._editorVersion;
  require('../../utils/image-picker').chooseImages({count:6-this.data.editForm.photos.length,success:async r=>{
   if(!active())return;this.setData({busy:true});
   try{for(const file of r.tempFiles){if(!active()||this.data.editForm.photos.length>=6)break;const image=await api.uploadImage(file.tempFilePath,session);if(!active())break;this.setData({'editForm.photos':[...this.data.editForm.photos,{id:image.id,path:file.tempFilePath}]});}}
   catch(e){if(active())api.showError(e);}finally{if(active())this.setData({busy:false});}
  }});
 },removePhoto(e){if(this.data.busy||!this.data.editForm)return;require('../../utils/publication-consent').reset(this);this.setData({'editForm.photos':this.data.editForm.photos.filter((_,i)=>i!==+e.currentTarget.dataset.index)});},
 editTemplateField(e){if(this.data.busy||!require('../../utils/publication-schemas').keys(this.data.editForm.type).includes(e.detail.field))return;this.setData({['editForm.attributes.'+e.detail.field]:e.detail.value});},
 changeEdit(e){require('../../utils/publication-consent').reset(this);if(this.data.busy)return;const key=e.currentTarget.dataset.field;if(!['title','detail','price'].includes(key))return;this.setData({['editForm.'+key]:e.detail.value});if(key==='price'&&this.data.editForm.attributes.templateVersion==='2')this.setData({'editForm.attributes.priceMode':e.detail.value==='面议'?'negotiable':'amount'});},
 changeEditDistrict(e){require('../../utils/publication-consent').reset(this);this.setData({'editForm.district':this.data.editDistricts[Number(e.detail.value)]});},
 cancelEdit(){if(!this.data.busy){this._editorVersion=(this._editorVersion||0)+1;this.setData({editing:false,editForm:null});}},
 publicationConsentChanged(e){require('../../utils/publication-consent').changed(this,e);},
 async saveEdit(){
  if(!require('../../utils/publication-consent').requireConsent(this))return;
  if(this.data.busy)return;
  const f=this.data.editForm;if(!f)return;
  const uid=owner(),version=this._editorVersion,active=()=>live(this,uid)&&version===this._editorVersion&&this.data.editForm?.id===f.id;
  const title=f.title.trim(),detail=f.detail.trim();
  if(title.length<4||detail.length<10){wx.showToast({title:'标题至少4字，内容至少10字',icon:'none'});return;}
  this.setData({busy:true});
  try{
   const value={publicationConsent:this.data.publicationConsent,type:f.type,title,detail,price:f.price.trim(),district:f.district,attributes:f.attributes||{},imageIds:(f.photos||[]).map(x=>x.id)};
   if(api.online())await api.request('PUT','/api/v1/me/publications/'+encodeURIComponent(f.id),{...value,expectedRevision:f.revision},true,uid);
   else if(!db.updatePublication(f.id,value,f.revision))throw Error('内容已经变化，无法修改');
   if(!active())return;
   for(const id of f.originalImageIds||[])if(!value.imageIds.includes(id))api.request('DELETE','/api/v1/me/media/'+id,null,true,uid).catch(()=>{});
   this.setData({editing:false,editForm:null});await this.refresh();
   if(!live(this,uid))return;
   wx.showModal({title:'重新提交成功',content:api.online()?'修改后的内容需重新审核，通过前不会公开。':'修改只保存于当前设备，仍为待审核演示记录。',showCancel:false});
  }catch(e){if(active()){require('../../utils/publication-consent').recover(this,e);api.showError(e);}}finally{if(live(this,uid)&&version===this._editorVersion)this.setData({busy:false});}
 },
 showItem(e){const item=this.data.items.find(i=>i.id===e.currentTarget.dataset.id);if(!item)return;
  wx.showModal({title:item.title,content:'状态：'+(item.statusLabel||item.status)+'\n'+item.detail+(item.moderationReason?'\n审核备注：'+item.moderationReason:''),showCancel:false});
 },
 withdraw(e){if(this.data.busy)return;
  const id=e.currentTarget.dataset.id,item=this.data.items.find(i=>i.id===id);
  if(!item||!item.canWithdraw)return;
  const uid=owner(),session=context();
  wx.showModal({title:'撤回这条信息？',content:'撤回后不再公开展示，无法直接恢复。',success:async r=>{
   if(!r.confirm||!live(this,uid)||session!==context()||this.data.busy)return;
   this.setData({busy:true});
   try{
    if(api.online())await api.request('POST','/api/v1/me/publications/'+encodeURIComponent(id)+'/withdraw',{},true,uid);
    else if(!db.withdrawPublication(id))throw Error('这条信息的状态已变化');
    if(!live(this,uid))return;await this.refresh();if(live(this,uid))wx.showToast({title:'已撤回',icon:'success'});
   }catch(error){if(live(this,uid))api.showError(error);}finally{if(live(this,uid))this.setData({busy:false});}
  }});
 }
});
