'use strict';
const api=require('./api'),tabs=require('./tab-bar'),geo=require('./geography'),cache=require('./avatar-cache');
const live=(page,owner)=>!page.disposed&&owner===tabs.context();
function fields(profile){return {displayName:profile.displayName||'附近的街坊',bio:profile.bio||'',profileCityCode:profile.cityCode||'',profileCityName:geo.findCity(profile.cityCode)?.name||'',avatarImageId:profile.avatarImageId||'',loginIdentity:(profile.loginProviders||[]).includes('wechat_miniapp')?'微信登录':(profile.loginProviders||[]).includes('dev_local')?'本地开发身份':'已登录账号'};}
async function avatar(profile,owner){
 if(!profile.avatarImageId){this.setData({avatarSrc:'',avatarError:''});return;}
 const id=profile.avatarImageId;
 if(this.data.avatarSrc&&this.loadedAvatar===id)return;
 try{const src=await cache.read(this.data.myUserId,id);if(live(this,owner)&&this.data.avatarImageId===id){this.loadedAvatar=id;this.setData({avatarSrc:src,avatarError:''});}}
 catch{if(live(this,owner)&&this.data.avatarImageId===id)this.setData({avatarSrc:'',avatarError:'头像暂未加载，点击重试'});}
}
async function save(patch,owner){
 if(!live(this,owner)||this.data.profileBusy)return;
 this.setData({profileBusy:true,profileError:''});
 try{await api.request('PUT','/api/v1/me/profile',patch,true);if(!live(this,owner))return;await this.refresh();if(live(this,owner))wx.showToast({title:'资料已保存'});}
 catch(e){if(live(this,owner))this.setData({profileError:e.message});}
 finally{if(live(this,owner))this.setData({profileBusy:false});}
}
module.exports={fields,avatar,save,
 async openProfile(){if(!api.hasSession()){await this.signin();if(!api.hasSession())return;}this.setData({mode:'profile',profileError:''});await this.refresh();},
 editProfileField(e){
  if(this.data.profileBusy||this.data.summaryLoading||this.data.summaryError)return;
  const field=e.currentTarget.dataset.field;if(!['displayName','bio'].includes(field))return;
  const owner=tabs.context();wx.showModal({title:field==='displayName'?'修改昵称':'个人简介',editable:true,content:field==='displayName'?this.data.displayName:this.data.bio,placeholderText:field==='displayName'?'2–40字，不填写联系方式':'最多120字，可留空',success:r=>{if(r.confirm&&live(this,owner))save.call(this,{[field]:r.content||''},owner);}});
 },
 async chooseAvatar(e){
  if(this.data.profileBusy||this.data.summaryLoading||this.data.summaryError||!api.hasSession())return;
  const owner=tabs.context(),path=e.detail.avatarUrl;if(!path)return;
  this.setData({profileBusy:true,profileError:''});
  try{const image=await api.uploadImage(path,owner);if(!live(this,owner))return;await api.request('PUT','/api/v1/me/profile',{avatarImageId:image.id},true);if(!live(this,owner))return;this.loadedAvatar='';await this.refresh();if(live(this,owner))wx.showToast({title:'头像已保存'});}
  catch(e){if(live(this,owner))this.setData({profileError:e.message});}
  finally{if(live(this,owner))this.setData({profileBusy:false});}
 },
 selectProfileCity(){
  if(this.data.profileBusy||this.data.summaryLoading||this.data.summaryError)return;
  const owner=tabs.context();wx.navigateTo({url:'/pages/regions/index?purpose=profile&returnTo=previous',events:{citySelected:value=>{if(live(this,owner))save.call(this,{cityCode:value.cityCode},owner);}}});
 },
 retryAvatar(){this.loadedAvatar='';return avatar.call(this,{avatarImageId:this.data.avatarImageId},tabs.context());},
 inspectCache(){
  const uid=wx.getStorageSync('city_life_user_id'),owner=tabs.context();let bytes;
  try{bytes=cache.size(uid);}catch{api.showError(Error('暂时无法读取图片缓存'));return;}
  const amount=bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(2)+' MB';
  wx.showModal({title:'清理缓存',content:'当前账号头像缓存：'+amount+'。仅清理可重新下载的头像图片，保留登录、草稿、发布、收藏、浏览记录与显示偏好。',confirmText:bytes?'确认清理':'知道了',showCancel:bytes>0,success:r=>{if(!bytes||!r.confirm||!live(this,owner))return;try{cache.clear(uid);this.loadedAvatar='';this.setData({avatarSrc:''});wx.showToast({title:'缓存已清理'});}catch{api.showError(Error('部分缓存未清理，请重试'));}}});
 }
};
