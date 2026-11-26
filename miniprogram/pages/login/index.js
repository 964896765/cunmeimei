const api=require('../../utils/api'),auth=require('../../utils/auth-intent');
Page({
 data:{docs:null,busy:false,error:'',reason:'',needPrivacy:false},
 onLoad(){this.intent=auth.restore();this.setData({reason:this.intent.reason});},
 onShow(){this.disposed=false;require('../../utils/theme').apply(this);this.load();},
 onUnload(){this.disposed=true;if(!this.finishing)auth.leave(this.intent?.nonce);},
 async load(){
  try{
   const docs=await api.request('GET','/api/v1/legal');
   if(this.disposed)return;
   const previous=this.data.docs;
   const changed=!previous||['hash','configured','wechatAvailable','smsAvailable'].some(key=>previous[key]!==docs[key]);
   this.setData({...(changed?{docs}:{}),error:docs.configured&&docs.wechatAvailable?'':'登录服务尚未就绪，可以先浏览公开内容。'});
   wx.getPrivacySetting?.({success:r=>{if(!this.disposed)this.setData({needPrivacy:!!r.needAuthorization});}});
  }catch(e){if(!this.disposed)this.setData({error:e.message});}
 },
 async login(e){
  if(this.data.busy||!this.data.docs?.configured)return;
  const {docs}=this.data;
  this.setData({busy:true,error:''});
  try{
   const result=await api.completeLogin(this.intent.nonce,{
    consent:true,termsVersion:docs.termsVersion,privacyVersion:docs.privacyVersion,legalHash:docs.hash
   },e?.detail?.sms);
   if(this.disposed)return;
   this.finishing=true;
   await auth.finish(this.intent.nonce,result);
  }catch(e){
   this.finishing=false;
   if(e.code==='AUTH_RETURN_FAILED')this.intent=auth.restore(this.intent);
   if(e.code==='LEGAL_CONSENT_REQUIRED')await this.load();
   if(!this.disposed)this.setData({error:e.code==='AUTH_CANCELLED'?'本次登录已取消，可继续浏览或重试。':e.message});
  }finally{if(!this.disposed)this.setData({busy:false});}
 },
 smsPrivacy(){this.setData({needPrivacy:false});},
 guest(){this.finishing=true;auth.guest();},
 legal(e){wx.navigateTo({url:'/pages/legal/index?kind='+e.detail.kind});},
 back(){this.guest();}
});
