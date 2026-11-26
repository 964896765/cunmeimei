const pageLayout=require('../../utils/page-layout');
const api=require('../../utils/api');const nav=require('../../utils/navigation');const present=require('../../utils/presentation');
const privacy=require('../../utils/privacy-settings');const pointsUI=require('../../utils/points-workspace');
const tabs=require('../../utils/tab-bar');const profileUI=require('../../utils/personal-profile');
Page({
 onReady(){pageLayout.measure(this);},
 onResize(){pageLayout.measure(this);},
 headerMeasured(e){pageLayout.header(this,e);},
 onPageScroll(e){this.sectionScrollTop=e.scrollTop;pageLayout.scroll(this,e);},
exportPersonalData(){return privacy.exportPersonalData.call(this);},openProfile(){this.enterSection('profile');return profileUI.openProfile.call(this);},editProfileField(e){return profileUI.editProfileField.call(this,e);},chooseAvatar(e){return profileUI.chooseAvatar.call(this,e);},selectProfileCity(){return profileUI.selectProfileCity.call(this);},retryAvatar(){return profileUI.retryAvatar.call(this);},inspectCache(){return profileUI.inspectCache.call(this);},openPrivacy(){this.enterSection('privacy');return privacy.openPrivacy.call(this,'privacy');},openNotifications(){this.enterSection('privacy');return privacy.openPrivacy.call(this,'notifications');},openPersonalData(){this.enterSection('privacy');return privacy.openPrivacy.call(this,'data');},reloadSettings(){return privacy.openPrivacy.call(this,this.data.settingsSection);},unblockUser(e){return privacy.unblockUser.call(this,e);},changePreference(e){return privacy.changePreference.call(this,e);},selectTheme(e){return privacy.selectTheme.call(this,e);},savePreferences(){return privacy.savePreferences.call(this);},requestKind(e){return privacy.requestKind.call(this,e);},requestReason(e){return privacy.requestReason.call(this,e);},submitPrivacyRequest(){return privacy.submitPrivacyRequest.call(this);},cancelPrivacyRequest(e){return privacy.cancelPrivacyRequest.call(this,e);},data:{officialWebsite:'https://dgqfl.xyz/',officialEmail:'chenjun@qingfanglai.cn',signingOut:false,layoutStyle:'',pageCompact:false,...pointsUI.initialState,hasSession:api.hasSession(),online:api.online(),mode:'main',preferences:require('../../utils/theme').current(),settingsBusy:false,settingsError:'',privacyItems:[],requestText:'',requestKindIndex:0,themeNames:['VM 经典','深海夜色','清晰高对比','静谧灰墨','温暖关怀','柔和中性'],requestNames:['数据访问','数据更正','数据删除','账号注销'],myUserId:'',draftCount:null,postCount:null,bookingCount:null,favCount:null,summaryLoading:false,summaryError:'',unread:0,displayName:'附近的街坊',bio:'',profileCityCode:'',profileCityName:'',avatarImageId:'',avatarSrc:'',avatarError:'',profileError:'',profileBusy:false,loginIdentity:'',blockedItems:[],merchantLabel:'申请商家入驻',items:[],page:0,hasMore:false,loading:false,error:''},
 onShow(){pageLayout.show(this,{tabBar:true});this.disposed=false;const hub=getApp().globalData.personalCenterSection;delete getApp().globalData.personalCenterSection;if(getApp().globalData.openPersonalCenter){getApp().globalData.openPersonalCenter=false;getApp().globalData.openPrivacy=false;this.settingsVersion=(this.settingsVersion||0)+1;this.setData({mode:'main',loading:false,settingsBusy:false});}require('../../utils/theme').apply(this);this.refresh();this.loadDraftCount();if(hub==='service')this.openServiceCenter();if(hub==='saved')this.showFavorites();if(hub==='points')this.showPoints();if(getApp().globalData.openPoints){getApp().globalData.openPoints=false;const target=getApp().globalData.pointsTarget||{view:'appeals'};delete getApp().globalData.pointsTarget;pointsUI.open.call(this,target.view,target.id||'');}else if(this.data.mode==='points')pointsUI.open.call(this,this.data.pointsView);if(getApp().globalData.openPrivacy){getApp().globalData.openPrivacy=false;this.openPersonalData();}},
 onAuthResumed(result,context={}){if(context.view==='points')return pointsUI.open.call(this,context.pointsView||'rewards');if(context.view==='privacy')return privacy.openPrivacy.call(this,context.section||'privacy');if(context.view==='saved')return this.showFavorites();if(context.view==='history')return this.showHistory();if(context.view==='profile')return profileUI.openProfile.call(this);if(context.view==='service'){this.refresh();return this.openServiceCenter();}if(context.view==='account')this.setData({mode:'account'});return this.refresh();},
 onHide(){pageLayout.hide(this);this.pointsVersion=(this.pointsVersion||0)+1;if(this.data.mode==='points')this.setData({pointsAccount:null,pointsRows:[],pointsDraft:null,pointsBusy:false});},
 onUnload(){pageLayout.hide(this);this.disposed=true;this.version=(this.version||0)+1;},
 async refresh(){
  const version=this.version=(this.version||0)+1,owner=tabs.context(),publicMode=['service','account','help','about'].includes(this.data.mode)?this.data.mode:'main';
  if(this.owner!==owner){this.sectionStack=[];this.listVersion=(this.listVersion||0)+1;this.owner=owner;this.settingsVersion=(this.settingsVersion||0)+1;this.pointsVersion=(this.pointsVersion||0)+1;this.setData({...pointsUI.initialState,hasSession:api.hasSession(),mode:publicMode,items:[],privacyItems:[],blockedItems:[],requestText:'',settingsBusy:false,settingsError:'',preferences:require('../../utils/theme').current(),myUserId:'',displayName:'附近的街坊',bio:'',profileCityCode:'',profileCityName:'',avatarImageId:'',avatarSrc:'',profileBusy:false,profileError:'',avatarError:'',loginIdentity:'',draftCount:null,postCount:null,bookingCount:null,favCount:null,unread:0,loading:false});}
  if(!api.hasSession()){tabs.setUnread(0,this);this.pointsVersion=(this.pointsVersion||0)+1;this.setData({...pointsUI.initialState,hasSession:false,mode:publicMode,items:[],privacyItems:[],blockedItems:[],requestText:'',settingsBusy:false,settingsError:'',preferences:require('../../utils/theme').current(),myUserId:'',displayName:'附近的街坊',bio:'',profileCityCode:'',profileCityName:'',avatarImageId:'',avatarSrc:'',avatarError:'',profileError:'',profileBusy:false,loginIdentity:'',blockedItems:[],merchantLabel:'申请商家入驻',draftCount:null,postCount:null,bookingCount:null,favCount:null,unread:0,summaryLoading:false,summaryError:''});return;}
  this.setData({hasSession:true,summaryLoading:true,summaryError:''});
  try{
   const [s,u,m,a,profile]=await Promise.all([api.request('GET','/api/v1/me/summary',null,true),api.request('GET','/api/v1/me',null,true),api.request('GET','/api/v1/me/merchants',null,true),api.request('GET','/api/v1/me/merchant-application',null,true),api.request('GET','/api/v1/me/profile',null,true)]);
   if(this.disposed||version!==this.version||owner!==tabs.context())return;
   this.setData({hasSession:true,...profileUI.fields(profile),myUserId:u.userId,postCount:s.publications,bookingCount:s.bookings,favCount:s.saved,unread:s.unread,merchantLabel:m.items?.length?'商家工作台':a.application?'入驻申请进度':'申请商家入驻',summaryLoading:false});
   profileUI.avatar.call(this,profile,owner);
  }catch(e){if(!this.disposed&&version===this.version&&owner===tabs.context())this.setData({summaryLoading:false,summaryError:e.message});}
 },
 async loadDraftCount(){const owner=tabs.context();try{const count=await require('../../utils/draft-summary').read();if(!this.disposed&&owner===tabs.context())this.setData({draftCount:count});}catch{if(!this.disposed&&owner===tabs.context())this.setData({draftCount:null});}},
 openDrafts(){wx.navigateTo({url:'/pages/drafts/index'});},
 openVerification(){require('../../utils/verification').open();},openLegal(e){wx.navigateTo({url:'/pages/legal/index?kind='+(e.currentTarget.dataset.kind==='terms'?'terms':'privacy')});},
 openAccount(){this.enterSection('account');},openHelp(){this.enterSection('help');},
 openServiceCenter(){this.enterSection('service');},openServiceSection(e){const section=e.currentTarget.dataset.section;if(section==='cases')return wx.navigateTo({url:'/pages/business/index'});if(section==='merchant')return this.goMerchant();if(section==='verification')return this.openVerification();if(['mine','sent','received','credentials','reports'].includes(section))wx.navigateTo({url:'/pages/industry/index?tab='+section});},goPublish(){nav.publish();},openCommerce(e){const tab=e?.currentTarget?.dataset?.tab;wx.navigateTo({url:'/pages/commerce/index'+(['offers','orders','promotion'].includes(tab)?'?tab='+tab:'')});},openIndustry(){wx.navigateTo({url:'/pages/industry/index'});},showPoints(){this.enterSection('points');return pointsUI.open.call(this,'rewards');},retryPoints(){return pointsUI.open.call(this,this.data.pointsView);},loadPoints(){return pointsUI.load.call(this);},selectPointsView(e){return pointsUI.selectView.call(this,e);},beginRewardAppeal(e){return pointsUI.beginAppeal.call(this,e);},rewardAppealReason(e){return pointsUI.appealReason.call(this,e);},submitRewardAppeal(){return pointsUI.submitAppeal.call(this);},cancelRewardAppeal(){if(!this.data.pointsBusy)this.setData({pointsDraft:null});},withdrawRewardAppeal(e){return pointsUI.withdrawAppeal.call(this,e);},
 async signin(){try{await api.login();await this.refresh();}catch(e){api.showError(e);}},
 signout(){
  if(!api.hasSession()||this.data.signingOut)return;
  const owner=tabs.context();
  wx.showModal({title:'退出登录？',content:'发布、收藏和预约记录仍保存在你的账号中。',confirmText:'退出登录',success:async result=>{
   if(!result.confirm||this.disposed||this.data.signingOut||owner!==tabs.context())return;
   this.setData({signingOut:true});
   try{
    const logout=await api.logout();
    if(!logout.serverRevoked)wx.showToast({title:'已退出本机，服务端会话暂未确认',icon:'none',duration:3500});
    this.sectionStack=[];
    this.setData({hasSession:false,mode:'main',myUserId:''});
    await this.refresh();
    wx.pageScrollTo?.({scrollTop:0,duration:0});
   }catch(error){api.showError(error);}
   finally{this.setData({signingOut:false});}
  }});
 },
 enterSection(mode) {
  if(this.data.mode===mode)return;
  this.sectionStack=this.sectionStack||[];
  this.sectionStack.push({mode:this.data.mode,settingsSection:this.data.settingsSection,scrollTop:this.sectionScrollTop||0});
  this.listVersion=(this.listVersion||0)+1;
  this.settingsVersion=(this.settingsVersion||0)+1;
  this.setData({mode,loading:false,settingsBusy:false,error:''});
  this.sectionScrollTop=0;
  wx.pageScrollTo?.({scrollTop:0,duration:0});
 },
 async openClosure() {
  await this.openPersonalData();
  if(this.data.mode==='privacy'&&this.data.settingsSection==='data')this.setData({requestKindIndex:3});
 },
 goDiscover(){nav.discover('all');},
 async showHistory() {
  this.enterSection('history');
  if(!api.hasSession()){await this.signin();if(!api.hasSession())return;this.enterSection('history');}
  const version=this.listVersion=(this.listVersion||0)+1,owner=tabs.context();
  this.setData({items:[],loading:true,error:''});
  const ids=require('../../utils/recent').ids();
  try {
   const results=await Promise.allSettled(ids.slice(0,30).map(id=>api.request('GET','/api/v1/items/'+id)));
   if(this.disposed||owner!==tabs.context()||version!==this.listVersion||this.data.mode!=='history')return;
   this.setData({items:results.filter(x=>x.status==='fulfilled').map(x=>present.item(x.value.item)),error:results.some(x=>x.status==='rejected'&&x.reason.code!=='NOT_FOUND')?'部分记录暂未加载，请重试。':'',loading:false});
  } catch(e) {
   if(!this.disposed&&owner===tabs.context()&&version===this.listVersion&&this.data.mode==='history')this.setData({error:e.message,loading:false});
  }
 },
 clearHistory() {
  const owner=tabs.context(),version=this.listVersion;
  wx.showModal({title:'清空本机浏览记录？',content:'清除当前账号在这台设备的浏览记录。',success:r=>{
   if(!r.confirm||this.disposed||owner!==tabs.context()||version!==this.listVersion||this.data.mode!=='history')return;
   require('../../utils/recent').clear();this.setData({items:[]});
  }});
 },
 goPosts(){wx.navigateTo({url:'/pages/my-posts/index'});},goBookings(){wx.navigateTo({url:'/pages/my-bookings/index'});},goMerchant(){wx.navigateTo({url:'/pages/merchant/index'});},goMessages(){wx.switchTab({url:'/pages/messages/index'});},
 async showFavorites() {
  this.enterSection('saved');
  if(!api.hasSession()){await this.signin();if(!api.hasSession())return;this.enterSection('saved');}
  this.listVersion=(this.listVersion||0)+1;
  this.setData({items:[],page:0,hasMore:true,savedRecheck:false,loading:false,error:''});
  return this.loadSaved();
 },
 async loadSaved() {
  if(this.data.loading||this.data.mode!=='saved')return;
  const owner=tabs.context(),version=this.listVersion;
  const readVersion=this.savedReadVersion=(this.savedReadVersion||0)+1;
  this.setData({loading:true,error:''});
  try {
   const page=this.data.savedRecheck?Math.max(1,this.data.page):this.data.page+1;
   const r=await api.request('GET','/api/v1/me/saved?page='+page,null,true);
   if(this.disposed||owner!==tabs.context()||version!==this.listVersion||readVersion!==this.savedReadVersion||this.data.mode!=='saved')return;
   const items=[...this.data.items,...r.items.map(item=>({...present.item(item),isSaved:true,favoriteBusy:this.savingIds?.has(item.id)||false}))];
   this.setData({items:[...new Map(items.map(item=>[item.id,item])).values()],page,hasMore:r.hasMore,savedRecheck:false,loading:false});
  } catch(e) {
   if(!this.disposed&&owner===tabs.context()&&version===this.listVersion&&readVersion===this.savedReadVersion&&this.data.mode==='saved')this.setData({loading:false,error:e.message});
  }
 },
 async removeSaved(e) {
  const id=e.detail.id,owner=tabs.context(),version=this.listVersion;
  this.savingIds=this.savingIds||new Set();
  if(this.savingIds.has(id)||!this.data.items.some(item=>item.id===id))return;
  this.savingIds.add(id);
  this.setData({items:this.data.items.map(item=>item.id===id?{...item,favoriteBusy:true}:item)});
  try {
   await api.request('DELETE','/api/v1/items/'+encodeURIComponent(id)+'/saved',{},true);
   if(this.disposed||owner!==tabs.context()||version!==this.listVersion||this.data.mode!=='saved')return;
   this.setData({items:this.data.items.filter(item=>item.id!==id),favCount:this.data.favCount===null?null:Math.max(0,this.data.favCount-1)});
   wx.showToast({title:'已取消收藏',icon:'none'});
   this.refresh();
   if(this.data.hasMore){
    this.savedReadVersion=(this.savedReadVersion||0)+1;
    this.setData({savedRecheck:true,loading:false});
    await this.loadSaved();
   }
  } catch(e) {if(!this.disposed&&owner===tabs.context())api.showError(e);}
  finally {
   this.savingIds.delete(id);
   if(!this.disposed&&owner===tabs.context()&&version===this.listVersion&&this.data.mode==='saved')this.setData({items:this.data.items.map(item=>item.id===id?{...item,favoriteBusy:false}:item)});
  }
 },
 openSaved(e){nav.detail(e.detail.id);},
 async back() {
  const target=this.sectionStack?.pop()||{mode:'main',scrollTop:0};
  const version=this.listVersion=(this.listVersion||0)+1,owner=tabs.context();
  this.settingsVersion=(this.settingsVersion||0)+1;
  this.setData({mode:target.mode,loading:false,settingsBusy:false,error:''});
  if(target.mode==='privacy')await privacy.openPrivacy.call(this,target.settingsSection);
  else if(target.mode==='main')this.refresh();
  if(this.disposed||version!==this.listVersion||owner!==tabs.context())return;
  this.sectionScrollTop=target.scrollTop;
  wx.nextTick?.(()=>wx.pageScrollTo?.({scrollTop:target.scrollTop,duration:0}));
 },
 copyId(){if(this.data.myUserId)wx.setClipboardData({data:this.data.myUserId});},
 showAbout(){this.enterSection('about');},
 copySupportContact(e){
  const kind=e.currentTarget.dataset.kind;
  if(kind!=='website'&&kind!=='email')return;
  wx.setClipboardData({data:kind==='website'?this.data.officialWebsite:this.data.officialEmail,fail:()=>wx.showToast({title:'复制失败，请稍后重试',icon:'none'})});
 }
});
