const regionPref=require('../../utils/region');const db=require('../../utils/storage');const api=require('../../utils/api');
const labels={pending:'待初审',in_review:'等待人工核验',needs_documents:'需要补充材料',rejected:'已驳回',approved:'已通过人工核验'};
const owner=()=>wx.getStorageSync('city_life_user_id')||'';
const context=()=>owner()+':'+(wx.getStorageSync('city_life_v2_auth_token')||'');
const live=(page,uid)=>!page._disposed&&owner()===uid;
Page({
 data:{loading:false,loadError:'',mode:'apply',name:'',category:'餐饮',district:'',categories:['餐饮','零售','家政','维修','其他'],districts:[],request:null,merchants:[],registrationCode:'',licenseHolder:'',evidenceReference:'',notice:'',demoBookings:0,online:api.online(),submitting:false,uploading:false,licenseUploaded:false,licenseEnabled:!api.online()},
 onShow(){require('../../utils/theme').apply(this);if(this._ownerUid!==undefined&&this._ownerUid!==owner())this.setData({mode:'apply',name:'',request:null,merchants:[],registrationCode:'',licenseHolder:'',evidenceReference:'',notice:'',submitting:false,uploading:false,licenseUploaded:false,licenseEnabled:false});this._ownerUid=owner();this.refresh();},
 onUnload(){this._disposed=true;},
 async refresh(){
  if(!api.online()){const s=db.getStore();this.setData({request:s.merchantRequest,notice:s.merchantNotice,demoBookings:s.bookings.length,mode:s.merchantRequest?'status':'apply'});return;}
  const version=this._listVersion=(this._listVersion||0)+1;let uid=owner();this.setData({loading:true,loadError:''});
  try{if(!api.hasSession())await api.login();if(this._disposed||version!==this._listVersion)return;uid=owner();this._ownerUid=uid;
   const [r,c,m]=await Promise.all([api.request('GET','/api/v1/me/merchant-application',null,true,uid),api.request('GET','/api/v1/config'),api.request('GET','/api/v1/me/merchants',null,true,uid)]);
   if(!live(this,uid)||version!==this._listVersion)return;
   const a=r.application;const merchants=m.items||[];this.setData({request:a?{...a,statusText:labels[a.status]||a.status}:null,merchants,districts:c.areas||[],district:(c.areas||[]).includes(this.data.district)?this.data.district:(regionPref.selected(c.areas||[])==='全部地区'?c.areas[0]||'':regionPref.selected(c.areas||[])),mode:merchants.length?'operate':a?'status':'apply',registrationCode:a?.registrationCode||'',licenseHolder:a?.licenseHolder||'',evidenceReference:a?.evidenceReference||'',licenseUploaded:!!a?.licenseFileId,licenseEnabled:c.features?.licenseUpload==='private_development'});
  }catch(e){if(live(this,uid)&&version===this._listVersion)this.setData({loadError:e.message});}finally{if(live(this,uid)&&version===this._listVersion)this.setData({loading:false});}
 },
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value});},
 chooseCategory(e){this.setData({category:this.data.categories[+e.detail.value]});},chooseDistrict(e){this.setData({district:this.data.districts[+e.detail.value]});},
 async submit(){
  // Prevent repeated taps while the first request is in flight. The server
  // independently deduplicates submissions from multiple devices.
  if(this.data.submitting)return;
  const uid=owner();
  const name=this.data.name.trim();
  if(name.length<2){wx.showToast({title:'请填写商家名称',icon:'none'});return;}
  this.setData({submitting:true});
  try{
   if(api.online()){
    await api.request('POST','/api/v1/merchant-applications',{name,category:this.data.category,district:this.data.district},true,uid);
    if(!live(this,uid))return;
    wx.showToast({title:'已提交申请'});
   }else{
    db.requestMerchant({name,category:this.data.category,district:this.data.district});
    wx.showToast({title:'演示申请已保存'});
   }
   if(live(this,uid))await this.refresh();
  }catch(e){if(live(this,uid))api.showError(e);}
  finally{if(live(this,uid))this.setData({submitting:false});}
 },
 async submitEvidence(){const {request,registrationCode,licenseHolder,evidenceReference}=this.data;if(!request||!this.data.licenseEnabled)return;
  const uid=owner(),session=context(),id=request.id;
  wx.showModal({title:'确认提交主体资料',content:'仅登记资质编号与线下材料核验编号，不是线上证照上传或自动认证。请勿填写身份证号等敏感资料。',success:async({confirm})=>{if(!confirm||!live(this,uid)||session!==context()||this.data.request?.id!==id||!this.data.licenseEnabled)return;try{await api.request('POST','/api/v1/merchant-applications/'+encodeURIComponent(id)+'/evidence',{registrationCode,licenseHolder,evidenceReference},true,uid);if(!live(this,uid))return;wx.showToast({title:'已提交人工核验'});this.refresh();}catch(e){if(live(this,uid))api.showError(e);}}});
 },
 chooseLicense(){
  if(!api.online()||!this.data.request||this.data.uploading||!this.data.licenseEnabled)return;
  const uid=owner(),session=context(),id=this.data.request.id,active=()=>live(this,uid)&&this.data.request?.id===id&&this.data.licenseEnabled;
  require('../../utils/image-picker').chooseImages({count:1,sourceType:['album','camera'],success:res=>{
   if(!active())return;
   const image=res.tempFiles&&res.tempFiles[0];if(!image)return;
   if(image.size>2*1024*1024){wx.showToast({title:'图片不得超过 2MB',icon:'none'});return;}
   this.setData({uploading:true});
   wx.getFileSystemManager().readFile({filePath:image.tempFilePath,success:async r=>{
    try{if(!active())return;await api.uploadLicense(id,r.data,undefined,session);if(!active())return;wx.showToast({title:'材料已私有上传',icon:'success'});this.refresh();}
    catch(e){if(active())api.showError(e);}finally{if(live(this,uid))this.setData({uploading:false});}
   },fail:()=>{if(live(this,uid)){this.setData({uploading:false});wx.showToast({title:'图片读取失败',icon:'none'});}}});
  }});
 },
 goPanel(e){const mid=e.currentTarget.dataset.id,kind=e.currentTarget.dataset.kind;wx.navigateTo({url:'/pages/merchant-'+kind+'/index?merchantId='+encodeURIComponent(mid)});},
 demo(){if(api.online())return;this.setData({mode:'demo'});},back(){this.setData({mode:this.data.request?'status':'apply'});},
 saveNotice(){if(api.online())return;db.saveMerchantNotice(this.data.notice);wx.showToast({title:'已本地保存',icon:'success'});}
});
