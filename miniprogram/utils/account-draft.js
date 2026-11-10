const api=require('./api');
function owner(){return wx.getStorageSync('city_life_user_id')||'guest';}
function snapshot(d){return JSON.stringify([d.kind,d.title,d.detail,d.price,d.district,d.attributes,(d.photos||[]).map(x=>x.id),d.clientKey]);}
function confirm(content){return new Promise(resolve=>wx.showModal({title:'账号草稿',content,success:r=>resolve(!!r.confirm),fail:()=>resolve(false)}));}
module.exports={
 async loadAccountDraft(){
  if(!api.online()||!api.hasSession())return;
  const uid=owner();
  try{const r=await api.request('GET','/api/v1/me/draft',null,true,uid);if(owner()!==uid||this.active&&!this.active())return;
   this._accountDraft=r;const local=wx.getStorageSync('city_life_draft_'+uid);
   this._draftRevision=Number.isInteger(local?.cloudRevision)?local.cloudRevision:r.revision;
   this.setData({cloudAvailable:!!r.payload,cloudStatus:r.payload?'账号中有一份草稿，可跨设备继续编辑':'填写时自动保存本机，可手动保存到账号'});
  }catch(e){if(owner()===uid&&(!this.active||this.active()))this.setData({cloudStatus:'账号草稿暂不可用，本机保存不受影响'});}
 },
 async saveAccountDraft(){
  if(this.data.cloudBusy||this.data.submitting||this.data.uploading||this.active&&!this.active())return;
  if(!api.hasSession()){try{await api.login();await this.loadAccountDraft();}catch(e){this.setData({cloudStatus:e.message});return;}}
  const uid=owner(),key=this.data.clientKey;this._draftOwner=uid;
  if(this._accountDraft?.payload&&this._accountDraft.payload.clientKey!==key){if(!await confirm('账号中已有另一份草稿，保存将替换它。本机草稿仍会保留。'))return;}
  if(owner()!==uid||this.active&&!this.active())return;
  this.setData({cloudBusy:true});
  try{
   const d=this.data,payload={kind:d.kind,title:d.title,detail:d.detail,price:d.price,district:d.district,attributes:{...d.attributes},imageIds:d.photos.map(x=>x.id),clientKey:key};
   const r=await api.request('PUT','/api/v1/me/draft',{expectedRevision:this._draftRevision||0,payload},true,uid);
   if(owner()!==uid||this.active&&!this.active()||this.data.clientKey!==key)return;
   this._accountDraft=r;this._draftRevision=r.revision;this.saveDraft();
   const current=this.data;
   const changed=['kind','title','detail','price','district'].some(k=>current[k]!==payload[k])||JSON.stringify(current.attributes)!==JSON.stringify(payload.attributes)||JSON.stringify(current.photos.map(x=>x.id))!==JSON.stringify(payload.imageIds);
   this.setData({cloudAvailable:true,cloudStatus:changed?'已保存到账号；保存期间新增的修改仍在本机，请再次保存':'已保存到账号，其他设备登录后可继续编辑'});
  }catch(e){if(owner()!==uid||this.active&&!this.active())return;this.setData({cloudStatus:e.code==='DRAFT_CONFLICT'?'其他设备已更新草稿。本机内容已保留，请先查看账号草稿。':e.message});}
  finally{if(!this.active||this.active())this.setData({cloudBusy:false});}
 },
 async restoreAccountDraft(){
  if(this.data.cloudBusy||this.data.submitting||this.data.uploading||this.active&&!this.active())return;
  const uid=owner();
  if(this.data.showForm&&!await confirm('查看账号草稿会替换当前编辑内容。请先保存需要保留的文字。'))return;
  if(owner()!==uid||this.active&&!this.active())return;
  const before=snapshot(this.data);this.setData({cloudBusy:true});
  try{
   const r=await api.request('GET','/api/v1/me/draft',null,true,uid);if(owner()!==uid||this.active&&!this.active())return;
   if(!r.payload){this.setData({cloudAvailable:false,cloudStatus:'账号中暂无草稿，本机内容保留'});return;}
   const p=r.payload,photos=await Promise.all(p.imageIds.map(async id=>{try{return {id,path:await api.privateImage(id)};}catch{return {id,path:''};}}));
   if(owner()!==uid||this.active&&!this.active())return;
   if(snapshot(this.data)!==before){this.saveDraft();this.setData({cloudStatus:'读取期间有新修改，已保留本机内容，请再次读取账号草稿。'});return false;}
   this._accountDraft=r;this._draftRevision=r.revision;
   this.setData({...p,attributes:{...p.attributes},photos,showForm:true,preview:false,agreed:false,error:'',cloudAvailable:true,cloudStatus:'已读取账号草稿；后续修改会自动保存在本机'});this.syncPublishCity?.();this.saveDraft();return true;
  }catch(e){if(owner()===uid&&(!this.active||this.active()))this.setData({cloudStatus:e.message});}finally{if(!this.active||this.active())this.setData({cloudBusy:false});}
 }
};
