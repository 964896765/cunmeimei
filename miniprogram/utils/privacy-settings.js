const api=require('./api'),theme=require('./theme'),tabs=require('./tab-bar');
const kinds=['access','correction','deletion','closure'],labels={access:'数据访问',correction:'数据更正',deletion:'数据删除',closure:'账号注销'},status={pending:'待受理',reviewing:'处理中',responded:'已答复',rejected:'未受理',cancelled:'已撤回'};
const live=(page,owner,version)=>!page.disposed&&owner===tabs.context()&&page.settingsVersion===version&&page.data.mode==='privacy';
module.exports={
 async openPrivacy(section){
  section=typeof section==='string'?section:(this.data.settingsSection||'privacy');
  if(!['privacy','notifications','data'].includes(section))section='privacy';
  if(!api.hasSession()){await this.signin();if(!api.hasSession())return;}
  const owner=tabs.context(),version=this.settingsVersion=(this.settingsVersion||0)+1;
  this.setData({mode:'privacy',settingsSection:section,settingsTitle:{privacy:'隐私与显示',notifications:'通知设置',data:'个人数据'}[section],settingsBusy:true,settingsError:'',privacyItems:[],blockedItems:[],requestText:''});
  try{
   const prefs=await api.request('GET','/api/v1/me/preferences',null,true);
   const r=section==='data'?await api.request('GET','/api/v1/me/privacy-requests',null,true):section==='privacy'?await api.request('GET','/api/v1/me/blocks',null,true):{items:[]};
   if(!live(this,owner,version))return;
   theme.store(prefs);theme.apply(this);this.setData({preferences:prefs,privacyItems:section==='data'?r.items.map(x=>({...x,kindLabel:labels[x.kind],statusLabel:status[x.status]})):[],blockedItems:section==='privacy'?r.items.map((x,i)=>({...x,label:'已屏蔽用户 '+(i+1),dateLabel:String(x.createdAt||'').slice(0,10)})):[]});
  }catch(e){if(live(this,owner,version))this.setData({settingsError:e.message});}
  finally{if(live(this,owner,version))this.setData({settingsBusy:false});}
 },
 changePreference(e){const field=e.currentTarget.dataset.field;if(!this.data.settingsBusy&&['largeText','reduceMotion','notificationPreview','allowContacts'].includes(field))this.setData({['preferences.'+field]:e.detail.value});},
 selectTheme(e){if(!this.data.settingsBusy)this.setData({'preferences.theme':['prism','dark','clear','quiet','warm','gentle'][+e.detail.value]});},
 async savePreferences(){
  if(this.data.settingsBusy)return;const owner=tabs.context(),version=this.settingsVersion;
  this.setData({settingsBusy:true,settingsError:''});
  try{const p=await api.request('PUT','/api/v1/me/preferences',this.data.preferences,true);if(!live(this,owner,version))return;theme.store(p);theme.apply(this);this.setData({preferences:p});wx.showToast({title:'设置已保存'});}
  catch(e){if(live(this,owner,version))this.setData({settingsError:e.message});}finally{if(live(this,owner,version))this.setData({settingsBusy:false});}
 },
 requestKind(e){this.setData({requestKindIndex:+e.detail.value});},requestReason(e){this.setData({requestText:e.detail.value});},
 async submitPrivacyRequest(){
  if(this.data.settingsBusy)return;const owner=tabs.context(),version=this.settingsVersion;
  this.setData({settingsBusy:true,settingsError:''});
  try{
   const payload={kind:kinds[this.data.requestKindIndex||0],reason:this.data.requestText||''};
   if(payload.kind==='closure'){
    const readiness=await api.request('GET','/api/v1/me/account-closure',null,true);if(!live(this,owner,version))return;
    const blockerNames={industry:'未结束的业务申请',business:'双方业务进度或争议待处理',merchant:'商家所有权交接',booking:'未完成预约',holds:'冻结积分',ads:'未结束广告'};
    if(readiness.blockers.length)throw Error('注销前请先处理：'+readiness.blockers.map(k=>blockerNames[k]||k).join('、'));
    const result=await new Promise(resolve=>wx.showModal({title:'单独确认账号注销',content:readiness.notice+' 提交后仍需人工审核，执行前可以撤回申请。',confirmText:'确认申请',success:resolve,fail:()=>resolve({confirm:false})}));
    if(!result.confirm||!live(this,owner,version))return;
    payload.closureAcknowledged=true;payload.consentVersion=readiness.consentVersion;
   }
   await api.request('POST','/api/v1/me/privacy-requests',payload,true);if(live(this,owner,version))await module.exports.openPrivacy.call(this,'data');
  }
  catch(e){if(live(this,owner,version))this.setData({settingsError:e.message});}finally{if(live(this,owner,version))this.setData({settingsBusy:false});}
 },
 async exportPersonalData(){
  if(this.data.settingsBusy)return;
  const owner=tabs.context(),version=this.settingsVersion;
  this.setData({settingsBusy:true,settingsError:''});
  let filePath='',fs,fileCreated=false;
  try{
   if(typeof wx.shareFileMessage!=='function'||typeof wx.getFileSystemManager!=='function')throw Error('当前微信版本不支持导出文件，请升级微信或提交数据访问申请');
   fs=wx.getFileSystemManager();filePath=wx.env.USER_DATA_PATH+'/personal-data-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.jsonl';
   const fileCall=(method,args)=>new Promise((resolve,reject)=>fs[method]({...args,success:resolve,fail:reject}));
   const assertLive=()=>{if(!live(this,owner,version))throw Error('账号或页面已变化，已停止导出');};assertLive();
   await fileCall('writeFile',{filePath,data:JSON.stringify({format:'personal-data-v1',notice:'仅含本人资料及本人创作内容；不含他人消息、真实号码和登录凭据。'})+'\n',encoding:'utf8'});
   fileCreated=true;
   let totalCharacters=0;
   for(const section of ['memorial_halls','memorial_authorizations','memorial_tributes','memorial_reports','business_cases','business_case_events','industry_service_links','login_consents','phone_authorizations','benefit_orders','promotions','industry_entries','industry_responses','industry_credentials','industry_reports','profile','home_reports','bookings','booking_submissions','publications','draft','favorites','contacts','messages','points','rewards','reward_appeals','privacy','consent']){
    let cursor=null,pages=0;
    do{
     assertLive();const result=await api.request('GET','/api/v1/me/data-export?section='+section+(cursor?'&cursor='+encodeURIComponent(cursor):''),null,true);assertLive();
     const data=result.items.map(item=>JSON.stringify({section,item})).join('\n')+'\n';totalCharacters+=data.length;
     if(totalCharacters>2000000||++pages>100)throw Error('数据量较大，请提交数据访问申请获取完整导出');
     await fileCall('appendFile',{filePath,data,encoding:'utf8'});cursor=result.nextCursor;
    }while(cursor);
   }
   assertLive();await new Promise((resolve,reject)=>wx.shareFileMessage({filePath,fileName:'我的个人数据.jsonl',success:resolve,fail:reject}));
  }catch(e){if(live(this,owner,version))this.setData({settingsError:e.message||e.errMsg||'导出未完成，请重试'});}
  finally{
   if(filePath&&fs){const cleared=await new Promise(resolve=>fs.unlink({filePath,success:()=>resolve(true),fail:()=>resolve(false)}));if(!cleared&&fileCreated&&live(this,owner,version))this.setData({settingsError:'临时导出文件未能清理，请在隐私设置中清理小程序缓存'});}
   if(live(this,owner,version))this.setData({settingsBusy:false});
  }
 },
 cancelPrivacyRequest(e){
  const owner=tabs.context(),version=this.settingsVersion,id=e.currentTarget.dataset.id;
  wx.showModal({title:'撤回这条隐私请求？',content:'已受理的其他事项不会自动撤销。',success:async r=>{if(!r.confirm||!live(this,owner,version))return;try{await api.request('POST','/api/v1/me/privacy-requests/'+id+'/cancel',{},true);if(live(this,owner,version))await module.exports.openPrivacy.call(this,'data');}catch(e){if(live(this,owner,version))this.setData({settingsError:e.message});}}});
 },
 unblockUser(e){const owner=tabs.context(),version=this.settingsVersion,id=e.currentTarget.dataset.id;
  wx.showModal({title:'解除屏蔽？',content:'对方可以重新发起联系申请，已经拒绝的申请不会恢复。',success:async r=>{if(!r.confirm||!live(this,owner,version))return;try{await api.request('DELETE','/api/v1/me/blocks/'+id,{},true);if(live(this,owner,version))await module.exports.openPrivacy.call(this,'privacy');}catch(e){if(live(this,owner,version))this.setData({settingsError:e.message});}}});
 }
};
