'use strict';
const api=require('../../utils/api');
const registry=require('../../utils/classification');
const schemas=require('../../utils/publication-schemas');
const geography=require('../../utils/geography');
const display=require('../../utils/publication-display');
const localDrafts=require('../../utils/local-drafts');
const owner=()=>wx.getStorageSync('city_life_user_id')||'guest';
const clone=value=>JSON.parse(JSON.stringify(value));
function cachedPhotoPath(path){if(!path)return '';try{wx.getFileSystemManager().accessSync(path);return path;}catch{return '';}}
function fingerprint(d){return JSON.stringify([d.kind,d.title,d.detail,d.price,d.district,d.attributes,d.photos.map(x=>x.id),d.clientKey,d.contactSettings]);}
Page({
 data:{neutralLight:'--background:#FFFFFF;--surface:#FFFFFF;--ink:#25303C;--text:#35404C;--muted:#626C77',neutralDark:'--background:#191A2B;--surface:#191A2B;--ink:#F0EDFF;--text:#DED9EB;--muted:#BBB6CF',contactSettings:{publicPhone:false,allowMessages:true,phoneConsent:false},trust:{},loading:true,loadFailed:false,showForm:false,kind:'used',projectName:'信息',breadcrumb:'',title:'',detail:'',price:'',amount:'',district:'',districts:[],attributes:{},photos:[],photoCount:0,canAddPhoto:true,clientKey:'',agreed:false,preview:false,error:'',submitting:false,uploading:false,saving:false,previewFields:[],previewFieldCount:0,publisherName:'',scopeRequired:false,showExitDialog:false,fromDraft:false,draftError:'',publishCities:geography.cities.map(x=>({code:x.code,name:x.name})),publishCityName:'',administrativeDistricts:[],publishDistrictName:'',focusedField:'',online:api.online()},
 async onLoad(options){this._options=options||{};this._openedFromDraft=['local','account'].includes(this._options.restore);this._sessionImageIds=new Set();await this.initialize();},
 onShow(){require('../../utils/theme').apply(this);if(this._draftOwner)api.request('GET','/api/v1/me/trust',null,true,this._draftOwner).then(trust=>{if(this.active())this.setData({trust});}).catch(()=>{});if(this._draftOwner&&owner()!==this._draftOwner){this._suspended=true;this.setData({error:'账号已切换，请返回后重新打开表单。',showForm:false});}},
 onHide(){},
 onUnload(){this._disposed=true;},
 active(){return !this._disposed&&!this._suspended&&owner()===this._draftOwner;},
 async initialize(){
  this.setData({loading:true,loadFailed:false,error:''});
  try{
   if(api.online()&&!api.hasSession()){try{await api.login();}catch(e){if(this._options.restore!=='local'||owner()!=='guest')throw e;}}
   this._draftOwner=owner();this._disposed=false;this._suspended=false;this._sessionImageIds=this._sessionImageIds||new Set();
   let config;
   try{config=await api.request('GET','/api/v1/config');try{wx.setStorageSync('city_life_publish_config',config);}catch{}}
   catch(e){if(this._options.restore!=='local')throw e;config=wx.getStorageSync('city_life_publish_config')||{areas:[]};}
   if(!this.active())return;this.setData({districts:config.areas||[]});
   api.request('GET','/api/v1/me/trust',null,true,this._draftOwner).then(trust=>{if(this.active())this.setData({trust});}).catch(()=>{});
   if(this._options.restore==='local')await this.restoreDraft();
   else if(this._options.restore==='account')await this.restoreAccountDraft();
   else{
    const project=registry.find(this._options.categoryId),kind=registry.kindsFor(project?.id)[0];
    if(!kind||!schemas.get(kind))throw Error('此项目尚未开放发布，请返回选择其他项目。');
    const attributes={categoryId:project.id,categoryVersion:registry.source.version,templateCode:schemas.get(kind).businessCode,templateVersion:String(schemas.formVersion)};
    if(kind!=='community')attributes.priceMode='amount';
    if(kind==='used')attributes.itemCategory=project.name;
    if(kind==='service')attributes.serviceType=project.name;
    if(kind==='community')attributes.topic=project.name;
    this._origin=null;
    this.setData({kind,attributes,showForm:true,clientKey:'pub_'+Date.now()+'_'+Math.random().toString(36).slice(2),district:config.areas.length===1?config.areas[0]:''});
    this.syncFormContext();this.markClean();
   }
  }catch(e){if(!this._disposed)this.setData({error:e.message,loadFailed:!this.data.showForm});}
  finally{if(!this._disposed)this.setData({loading:false});}
 },
 syncFormContext(){
  const d=this.data,project=registry.find(d.attributes.categoryId);
  if(d.kind!=='community'&&!d.attributes.priceMode)this.setData({'attributes.priceMode':d.price==='面议'?'negotiable':'amount'});
  this.setData({projectName:project?.name||({used:'二手闲置',housing:'房产信息',service:'服务需求',community:'社区信息'}[d.kind]),breadcrumb:project?[project.categoryName,project.group,project.name].join(' / '):'历史草稿',amount:d.price==='面议'?(d.amount||''):d.price});
  this.syncPublishCity();
 },
 syncPublishCity(){const city=geography.findCity(this.data.attributes.cityCode),district=geography.findDistrict(this.data.attributes.districtCode);this.setData({publishCityName:city?.name||'',administrativeDistricts:city?.districts||[],publishDistrictName:district?.cityCode===city?.code?district?.name||'':''});},
 async restoreDraft(){
  const items=localDrafts.list(this._draftOwner),draft=this._options.draftId?items.find(x=>x.clientKey===this._options.draftId):items[0];
  if(!draft)throw Error('这份本机草稿不存在或已被移除。');
  await this.applyDraft(draft,{source:'local',clientKey:draft.clientKey,revision:draft.draftRevision||0,token:draft._recordToken});
 },
 async restoreAccountDraft(){
  const r=await api.request('GET','/api/v1/me/draft',null,true,this._draftOwner);if(!this.active())return;
  if(!r.payload)throw Error('账号中暂无草稿。');
  const p=r.payload;await this.applyDraft({...p,photos:(p.imageIds||[]).map(id=>({id,path:''}))},{source:'account',clientKey:p.clientKey,revision:r.revision});
 },
 async applyDraft(draft,origin){
  const attrs=draft.attributes||{};
  if(!schemas.get(draft.kind)||!schemas.versionMatches(draft.kind,attrs)||(attrs.categoryId&&!registry.validateReference(attrs.categoryId,attrs.categoryVersion,draft.kind)))throw Error('这份草稿的分类或模板尚未开放，原内容仍保留。');
  const photos=await Promise.all((draft.photos||[]).map(async x=>{const cached=cachedPhotoPath(x.path);if(cached)return {...x,path:cached};try{return {...x,path:await api.privateImage(x.id)};}catch{return {...x,path:''};}}));
  if(!this.active())return;
  const {kind,title,detail,price,district,attributes,clientKey,amount=''}=clone(draft);
  this._origin=origin;this._openedFromDraft=true;this.setData({kind,title,detail,price,district,attributes:attributes||{},clientKey,amount,photos,photoCount:photos.length,canAddPhoto:photos.length<6,showForm:true,fromDraft:true,preview:false,agreed:false,contactSettings:{publicPhone:false,allowMessages:draft.contactSettings?.allowMessages!==false,phoneConsent:false}});
  this.syncFormContext();this.markClean();
 },
 markClean(){this._initialSnapshot=fingerprint(this.data);this._dirty=false;wx.disableAlertBeforeUnload?.();},
 changed(){this.setData({photoCount:this.data.photos.length,canAddPhoto:this.data.photos.length<6});this._dirty=fingerprint(this.data)!==this._initialSnapshot;this.setData({preview:false,agreed:false,error:'',draftError:''});if(this._dirty)wx.enableAlertBeforeUnload?.({message:'当前修改尚未保存，离开可能丢失填写内容。'});else wx.disableAlertBeforeUnload?.();},
 editable(){return this.active()&&this.data.showForm&&!this.data.preview&&!this.data.submitting&&!this.data.loading&&!this.data.saving&&!this.data.showExitDialog;},
 setField(e){const key=e.currentTarget.dataset.field;if(!this.editable()||!['title','detail'].includes(key))return;this.setData({[key]:e.detail.value});this.changed();},
 async saveDraft(){
  if(!this.active()||this.data.saving||this.data.submitting||this.data.uploading)return false;
  const d=clone(this.data),payload={kind:d.kind,title:d.title,detail:d.detail,price:d.price,district:d.district,attributes:d.attributes,clientKey:d.clientKey,contactSettings:d.contactSettings};
  this.setData({saving:true,draftError:''});
  try{
   if(this._origin?.source==='account'){
    const r=await api.request('PUT','/api/v1/me/draft',{expectedRevision:this._origin.revision,payload:{...payload,imageIds:d.photos.map(x=>x.id)}},true,this._draftOwner);
    if(!this.active())return false;this._origin={source:'account',clientKey:d.clientKey,revision:r.revision};
   }else{
    const r=localDrafts.save(this._draftOwner,{...payload,amount:d.amount,photos:d.photos},this._origin?.revision??null,this._origin?.token);
    this._origin={source:'local',clientKey:d.clientKey,revision:r.draftRevision,token:localDrafts.list(this._draftOwner).find(x=>x.clientKey===d.clientKey)?._recordToken};
   }
   this._sessionImageIds.clear();this.setData({fromDraft:true});this.markClean();
   wx.showToast({title:this._origin.source==='account'?'已保存到账号':'已保存到本机草稿',icon:'success'});return true;
  }catch(e){if(this.active())this.setData({draftError:'保存失败：'+(e.code==='DRAFT_CONFLICT'?'账号草稿已被其他设备更新，原草稿未覆盖；请继续编辑或稍后重新读取。':e.message)});return false;}
  finally{if(this.active())this.setData({saving:false});}
 },
 validate(){const d=this.data;let error=schemas.formError(d.kind,{...d,imageIds:d.photos.map(x=>x.id)});if(!error&&!geography.findCity(d.attributes.cityCode))error='请确认这条信息所属的城市。';if(!error&&d.attributes.districtCode&&geography.findDistrict(d.attributes.districtCode)?.cityCode!==d.attributes.cityCode)error='区县或镇街与所选城市不一致。';if(!error&&!d.districts.includes(d.district)){this.setData({scopeRequired:true});error='请选择平台已开放的发布范围。';}if(!error&&(d.uploading||d.photos.some(x=>!x.id||!x.path)))error='请等待照片上传完成，或重试读取失败的照片。';this.setData({error});return !error;},
 previewPost(){
  if(!this.editable()||this.data.uploading||!this.validate())return;
  const facts=display.describe(this.data.kind,this.data.attributes,this.data.price,this.data.district);this.setData({preview:true,agreed:false,previewFields:facts.displayFields,previewFieldCount:facts.displayFieldCount,previewPrice:facts.priceText,previewLocation:facts.locationText,photoCount:this.data.photos.length,focusedField:''});wx.pageScrollTo({scrollTop:0,duration:0});
  if(api.hasSession())api.request('GET','/api/v1/me/profile',null,true,this._draftOwner).then(p=>{if(this.active())this.setData({publisherName:p.displayName||''});}).catch(()=>{});
 },
 editPost(){if(this.data.submitting)return;this.setData({preview:false,agreed:false,error:''});wx.pageScrollTo({scrollTop:0,duration:0});},
 setAgree(e){if(this.data.preview&&!this.data.submitting)this.setData({agreed:!!e.detail.value.length});},
 confirmSubmit(){if(!this.data.preview||this.data.submitting)return;this.setData({agreed:true});return this.submit();},
 goBack(){if(this.busy())return;if(this.data.preview){this.editPost();return;}if(this._dirty)this.setData({showExitDialog:true,draftError:''});else this.leave();},
 busy(){if(this.data.submitting||this.data.saving||this.data.uploading){wx.showToast({title:'请等待当前操作完成',icon:'none'});return true;}return false;},
 continueEditing(){if(!this.data.saving)this.setData({showExitDialog:false,draftError:''});},
 async saveAndExit(){if(await this.saveDraft()){this.setData({showExitDialog:false});this.leave();}},
 discardAndExit(){if(this.busy())return;this.setData({showExitDialog:false});this.cancelPublish();},
 cancelPublish(){
  if(this.busy())return;
  for(const id of this._sessionImageIds||[])api.request('DELETE','/api/v1/me/media/'+id,null,true,this._draftOwner).catch(()=>{});
  this._sessionImageIds?.clear();this.setData({showForm:false,title:'',detail:'',price:'',amount:'',attributes:{},photos:[],preview:false});this._dirty=false;wx.disableAlertBeforeUnload?.();this.leave();
 },
 leave(){wx.disableAlertBeforeUnload?.();const route=this._openedFromDraft?'pages/drafts/index':'pages/publish/index',pages=getCurrentPages(),index=pages.map(p=>p.route).lastIndexOf(route);if(index>=0&&index<pages.length-1)wx.navigateBack({delta:pages.length-1-index});else if(this._openedFromDraft)wx.redirectTo({url:'/pages/drafts/index'});else wx.switchTab({url:'/pages/publish/index'});},
 openVerification(){require('../../utils/verification').open();},
 changeAllowMessages(e){if(!this.editable())return;this.setData({'contactSettings.allowMessages':!!e.detail.value});this.changed();},
 togglePublicPhone(){if(!this.editable())return;if(this.data.contactSettings.publicPhone){this.setData({'contactSettings.publicPhone':false,'contactSettings.phoneConsent':false});this.changed();return;}if(!this.data.trust.phoneVerified){this.openVerification();return;}const uid=this._draftOwner;wx.showModal({title:'单独确认公开联系电话',content:'是否在本条信息详情中公开已验证号码 '+this.data.trust.maskedPhone+'？号码默认不公开，可在我的发布中随时撤回。',success:r=>{if(r.confirm&&this.active()&&uid===this._draftOwner){this.setData({'contactSettings.publicPhone':true,'contactSettings.phoneConsent':true});this.changed();}}});},
 focusField(e){this.setData({focusedField:e.currentTarget.dataset.field});},blurField(){this.setData({focusedField:''});},
 templateFieldChange(e){if(!this.editable()||!schemas.keys(this.data.kind).includes(e.detail.field)||e.detail.field==='priceMode')return;this.setData({['attributes.'+e.detail.field]:e.detail.value});this.changed();},
 changeAmount(e){if(!this.editable()||this.data.attributes.priceMode==='negotiable')return;this.setData({amount:e.detail.value,price:e.detail.value});this.changed();},
 toggleNegotiable(){if(!this.editable())return;const negotiating=this.data.attributes.priceMode!=='negotiable';this.setData({'attributes.priceMode':negotiating?'negotiable':'amount',price:negotiating?'面议':this.data.amount});this.changed();},
 choosePublishCity(e){if(!this.editable())return;const city=this.data.publishCities[Number(e.detail.value)];if(!city)return;this.setData({'attributes.cityCode':city.code,'attributes.districtCode':''});this.syncPublishCity();this.changed();},
 chooseAdministrativeDistrict(e){if(!this.editable())return;const district=this.data.administrativeDistricts[Number(e.detail.value)];if(!district)return;this.setData({'attributes.districtCode':district.code,publishDistrictName:district.name});this.changed();},
 changeDistrict(e){if(!this.editable())return;const district=this.data.districts[Number(e.detail.value)];if(!district)return;this.setData({district});this.changed();},
 choosePhotos(){if(!this.editable()||this.data.uploading||this.data.photos.length>=6)return;const session=require('../../utils/tab-bar').context();require('../../utils/image-picker').chooseImages({count:6-this.data.photos.length,mediaType:['image'],sizeType:['compressed'],success:async r=>{if(!this.active())return;this.setData({uploading:true,error:''});try{for(const f of r.tempFiles){if(!this.active())break;const image=await api.uploadImage(f.tempFilePath,session);if(!this.active())break;this._sessionImageIds.add(image.id);this.setData({photos:[...this.data.photos,{id:image.id,path:f.tempFilePath}]});this.changed();}}catch(e){if(this.active())this.setData({error:e.message+'，请重新选择照片。'});}finally{if(this.active())this.setData({uploading:false});}}});},
 removePhoto(e){if(!this.editable()||this.data.uploading)return;const photo=this.data.photos[Number(e.currentTarget.dataset.index)];if(!photo)return;this.setData({photos:this.data.photos.filter(x=>x!==photo)});this.changed();},
 async retryPhotos(){if(!this.editable()||this.data.uploading)return;const request=(this._photoReadRequest||0)+1;this._photoReadRequest=request;const photos=await Promise.all(this.data.photos.map(async x=>{try{return {...x,path:await api.privateImage(x.id)};}catch{return {...x,path:''};}}));if(this.active()&&request===this._photoReadRequest){const results=new Map(photos.map(x=>[x.id,x]));this.setData({photos:this.data.photos.map(x=>results.get(x.id)||x),photoCount:this.data.photos.length,canAddPhoto:this.data.photos.length<6});}},
 previewPhoto(e){const urls=this.data.photos.map(x=>x.path).filter(Boolean);if(urls.length)wx.previewImage({current:e.currentTarget.dataset.path||urls[0],urls});},
 async submit(){
  if(this._submitted||!this.data.showForm||!this.active()||!this.data.preview||this.data.submitting||this.data.uploading||this.data.saving||!this.validate())return;
  if(!this.data.agreed){this.setData({error:'请点击“确认提交审核”确认本次发布。'});return;}
  this.setData({submitting:true,error:''});const d=clone(this.data);
  try{
   await api.request('POST','/api/v1/publications',{...(this._origin?.source==='account'?{sourceDraftRevision:this._origin.revision}:{}),clientKey:d.clientKey,type:d.kind,title:d.title.trim(),detail:d.detail.trim(),price:d.price.trim(),district:d.district,attributes:d.attributes,contactSettings:d.contactSettings,imageIds:d.photos.map(x=>x.id)},true,this._draftOwner);
   if(!this.active())return;this._submitted=true;this._sessionImageIds.clear();wx.disableAlertBeforeUnload?.();
   // Remove only the explicitly opened local draft, with its concurrency revision.
   try{
    if(this._origin?.source==='local')localDrafts.remove(this._draftOwner,d.clientKey,this._origin.revision,this._origin.token);
    else if(this._origin?.source==='account'){
     const local=localDrafts.list(this._draftOwner).find(x=>x.clientKey===d.clientKey);
     if(local&&fingerprint(local)===fingerprint(d))localDrafts.remove(this._draftOwner,d.clientKey,local.draftRevision||0);
    }
   }catch{/* The server committed; local cleanup failure must not turn it into a failed submission. */}
   this.setData({showForm:false});wx.redirectTo({url:'/pages/my-posts/index'});
  }catch(e){if(this.active())this.setData({error:e.message});}
  finally{if(this.active())this.setData({submitting:false});}
 }
});
