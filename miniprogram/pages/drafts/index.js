'use strict';
const api=require('../../utils/api'),localDrafts=require('../../utils/local-drafts'),registry=require('../../utils/classification');
const owner=()=>wx.getStorageSync('city_life_user_id')||'guest';
function savedTime(value){const d=new Date(value);if(!value||isNaN(d))return '保存时间未知';const now=new Date(),pad=x=>String(x).padStart(2,'0');const day=d.toDateString()===now.toDateString()?'今天':d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日';return day+' '+pad(d.getHours())+':'+pad(d.getMinutes())+' 保存';}
Page({
 data:{requiresLogin:false,items:[],loading:false,deleting:false,error:'',cloudError:'',hasItems:false},
 onShow(){require('../../utils/theme').apply(this);this._disposed=false;return this.refresh({prompt:!require('../../utils/auth-intent').isReturning(this.route)});},
 signin(){return this.refresh({prompt:true});},
 onHide(){this._request=(this._request||0)+1;},onUnload(){this._disposed=true;this._request=(this._request||0)+1;},
 active(uid,request){return !this._disposed&&owner()===uid&&request===this._request;},
 row(d,source,revision){const project=registry.find(d.attributes?.categoryId),photos=d.photos||[],id=source+':'+d.clientKey;return {id,source,clientKey:d.clientKey,revision,token:d._recordToken,title:d.title?.trim()||'未命名草稿',category:project?[project.categoryName,project.name].join(' · '):({used:'二手闲置',housing:'房屋信息',service:'服务需求',community:'社区信息'}[d.kind]||'历史草稿'),savedAt:Number(d.savedAt)||0,savedText:savedTime(Number(d.savedAt)),sourceText:source==='local'?'本机保存':'账号保存',legacy:source==='local'&&!d.draftRevision,photoId:photos[0]?.id||'',thumbnail:'',recoverable:source==='account'||d._recoverable!==false};},
 async refresh(options={}){
  const uid=owner(),request=this._request=(this._request||0)+1;this._owner=uid;this.setData({loading:true,error:'',cloudError:'',items:[],hasItems:false});
  this.setData({requiresLogin:false});
  if(api.online()&&uid!=='guest'&&!api.hasSession()){this.setData({requiresLogin:true});if(options.prompt===false){this.setData({loading:false});return;}try{await api.login();}catch(e){if(this.active(uid,request))this.setData({loading:false,error:e.message});return;}if(!this.active(uid,request))return;if(!api.hasSession()){this.setData({loading:false});return;}this.setData({requiresLogin:false});}
  let rows;
  try{rows=localDrafts.list(uid).map(d=>this.row(d,'local',d.draftRevision||0));for(const r of require('../../utils/form-recovery').list(wx,uid)){const row=this.row({...r.payload,attributes:r.family==='industry'?{categoryId:r.projectId}:r.payload.attributes,photos:r.photos||r.payload.photos,clientKey:r.id,savedAt:r.savedAt},'recovery',r.revision);rows.push({...row,recoveryFamily:r.family,sourceText:r.family==='industry'?'行业填写 · 自动保存':'填写恢复 · 自动保存'});}}catch(e){if(this.active(uid,request))this.setData({error:'无法读取本机草稿：'+e.message,loading:false});return;}
  this.setData({items:rows,hasItems:!!rows.length});
  if(api.online()&&api.hasSession()){
   try{const remote=await api.request('GET','/api/v1/me/draft',null,true,uid);if(!this.active(uid,request))return;if(remote.payload){const d=remote.payload;rows.push(this.row({...d,photos:(d.imageIds||[]).map(id=>({id})),savedAt:Date.parse(remote.updatedAt)||0},'account',remote.revision));}}
   catch(e){if(!this.active(uid,request))return;this.setData({cloudError:'账号草稿读取失败：'+e.message});}
  }
  if(!this.active(uid,request))return;rows.sort((a,b)=>b.savedAt-a.savedAt);this.setData({items:rows,hasItems:!!rows.length,loading:false});
  for(const row of rows){if(!row.photoId)continue;api.privateImage(row.photoId).then(path=>{if(!this.active(uid,request))return;const i=this.data.items.findIndex(x=>x.id===row.id);if(i>=0)this.setData({['items['+i+'].thumbnail']:path});}).catch(()=>{});}
 },
 openDraft(e){if(this.data.deleting)return;const row=this.data.items.find(x=>x.id===e.currentTarget.dataset.id);if(!row)return;if(!row.recoverable){wx.showModal({title:'历史草稿暂无法恢复',content:'原始数据仍保留，未被清空。可以稍后重试；如不再需要，可点击卡片下方的删除并确认。',showCancel:false});return;}if(row.source==='recovery'){wx.navigateTo({url:(row.recoveryFamily==='industry'?'/pages/industry/index':'/pages/publish-form/index')+'?recoveryId='+encodeURIComponent(row.clientKey)});return;}wx.navigateTo({url:row.source==='account'?'/pages/publish-form/index?restore=account':'/pages/publish-form/index?restore=local&draftId='+encodeURIComponent(row.clientKey)});},
 // Compatibility for existing deep-link callers; both open the same secondary form.
 restoreDraft(e){const id=e?.currentTarget?.dataset?.id;const row=this.data.items.find(x=>x.source==='local'&&(!id||x.clientKey===id));if(row)this.openDraft({currentTarget:{dataset:{id:row.id}}});},
 restoreAccountDraft(){const row=this.data.items.find(x=>x.source==='account');if(row)this.openDraft({currentTarget:{dataset:{id:row.id}}});},
 deleteDraft(e){
  if(this.data.deleting||owner()!==this._owner)return;const row=this.data.items.find(x=>x.id===e.currentTarget.dataset.id);if(!row)return;const uid=this._owner;
  wx.showModal({title:'删除这份草稿？',content:'删除后无法恢复，请确认不再需要这份内容。',confirmText:'删除',success:async r=>{
   if(!r.confirm||this._disposed||owner()!==uid||this.data.deleting)return;this.setData({deleting:true,error:''});
   try{if(row.source==='recovery'){if(!require('../../utils/form-recovery').remove(wx,uid,row.clientKey,row.revision))throw Error('恢复草稿已更新，请重新读取');}else if(row.source==='account')await api.request('DELETE','/api/v1/me/draft',{expectedRevision:row.revision},true,uid);else if(!localDrafts.remove(uid,row.clientKey,row.revision,row.token))throw Error('草稿已发生变化，请刷新后重新确认。');if(owner()===uid&&!this._disposed)await this.refresh();}
   catch(e){if(owner()===uid&&!this._disposed)this.setData({error:'删除失败：'+e.message});}
   finally{if(owner()===uid&&!this._disposed)this.setData({deleting:false});}
  }});
 },
 goBack(){if(this.data.deleting)return;const pages=getCurrentPages(),index=pages.map(p=>p.route).lastIndexOf('pages/publish/index');if(index>=0&&index<pages.length-1)wx.navigateBack({delta:pages.length-1-index});else wx.switchTab({url:'/pages/publish/index'});}
});
