const pageLayout=require('../../utils/page-layout');
'use strict';
const api=require('../../utils/api'),tabs=require('../../utils/tab-bar');
const uid=()=>wx.getStorageSync('city_life_user_id')||'guest';
const ownerKey=()=>JSON.stringify([uid(),!!wx.getStorageSync('city_life_acceptance_mode')]);
const freshKey=()=> 'msg_'+Date.now()+'_'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
Page({
 onReady(){pageLayout.measure(this);},
 onResize(){pageLayout.measure(this);},
 headerMeasured(e){pageLayout.header(this,e);},
 onHistoryScroll(e){if(e.detail.scrollTop<(this._chatLastTop||0)-2)this._chatReadingHistory=true;this._chatLastTop=e.detail.scrollTop;},
 historyAtBottom(){this._chatReadingHistory=false;},
 scrollLatest(){this.setData({chatScrollAnchor:''},()=>this.setData({chatScrollAnchor:'chat-history-end'}));},

 data:{historyHasMore:false,historyCursor:'',historyLoading:false,historyError:'',layoutStyle:'',chatScrollAnchor:'',id:'',chat:null,messages:[],draft:'',loading:false,sending:false,error:'',sendError:'',warning:'',hasSession:false,permissionsReady:false,safetyBusy:false,reportBusy:false,reportDraft:'',reportError:''},
 onLoad(q){const id=q.id||'';this.setData({id});if(!/^[0-9a-f-]{36}$/i.test(id))this.setData({error:'会话标识无效，演示记录不会当作真实聊天发送。'});},
 onShow(){pageLayout.show(this,{keyboard:true,tabBar:false});this._visible=true;require('../../utils/theme').apply(this);this.refresh();clearInterval(this._timer);this._timer=setInterval(()=>{if(this._visible&&!this.data.sending)this.refresh(true);},8000);},
 onHide(){pageLayout.hide(this);this._visible=false;clearInterval(this._timer);this._version=(this._version||0)+1;this._readPromise=null;},
 onUnload(){pageLayout.hide(this);this._disposed=true;clearInterval(this._timer);this._version=(this._version||0)+1;},
 valid(owner,id=this.data.id){return !this._disposed&&owner===ownerKey()&&id===this.data.id;},
 syncOwner(){
  const owner=ownerKey();
  if(this._owner!==undefined&&this._owner!==owner){this._historyLoaded=false;this._historyTask=null;this._sendAttempt=null;this._sendTask=null;this._safetyTask=null;this._reportTask=null;this._readPromise=null;this.setData({historyHasMore:false,historyCursor:'',historyLoading:false,historyError:'',chat:null,messages:[],draft:'',warning:'',sendError:'',sending:false,safetyBusy:false,reportBusy:false,reportDraft:'',reportError:'',permissionsReady:false});}
  this._owner=owner;return owner;
 },
 refresh(quiet=false,force=false){quiet=quiet===true;if(!quiet){this._historyLoaded=false;this._chatReadingHistory=false;}
  if(quiet&&this.data.historyLoading&&!force)return Promise.resolve();
  if(this._disposed||!/^[0-9a-f-]{36}$/i.test(this.data.id))return Promise.resolve();
  const owner=this.syncOwner(),id=this.data.id;
  if(this._readPromise&&this._readOwner===owner&&!force)return this._readPromise;
  const version=this._version=(this._version||0)+1;this._readOwner=owner;
  if(!api.hasSession()){this.setData({historyHasMore:false,historyCursor:'',hasSession:false,chat:null,messages:[],permissionsReady:false,error:'请先微信登录后查看自己的会话',loading:false});return Promise.resolve();}
  if(!quiet)this.setData({loading:true,error:''});
  let attempt;
  attempt=(async()=>{
   try{
    const chat=await api.request('GET','/api/v1/me/chats/'+id,null,true,uid());
    if(!this.valid(owner,id)||version!==this._version)return;
    const last=this.data.messages[this.data.messages.length-1]?.id;const merged=new Map((quiet&&this._historyLoaded?this.data.messages:[]).map(m=>[m.id,m]));for(const message of chat.items||[])merged.set(message.id,message);const messages=[...merged.values()].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))||a.id.localeCompare(b.id));this.setData({chat,messages,...(!quiet||!this._historyLoaded?{historyHasMore:!!chat.hasMore,historyCursor:chat.nextCursor||''}:{}),hasSession:true,permissionsReady:true,error:'',loading:false},()=>{if(!this._chatReadingHistory&&last!==chat.items?.[chat.items.length-1]?.id)this.scrollLatest();});wx.setNavigationBarTitle({title:'站内会话'});
   }catch(e){if(this.valid(owner,id)&&version===this._version){const denied=['CHAT_UNAVAILABLE','NOT_FOUND','ACCOUNT_CLOSED','ACCOUNT_INACTIVE','SESSION_EXPIRED','LOGIN_REQUIRED'].includes(e.code);this.setData({chat:denied?null:this.data.chat?{...this.data.chat,canSend:false}:null,...(denied?{messages:[],historyHasMore:false,historyCursor:''}:{}),permissionsReady:false,error:e.message,loading:false});}}
  })().finally(()=>{if(this._readPromise===attempt)this._readPromise=null;});
  this._readPromise=attempt;return attempt;
 },
 async loadOlder(){if(this.data.historyLoading||this._readPromise||!this.data.historyHasMore||!this.data.historyCursor||!api.hasSession())return;const owner=ownerKey(),id=this.data.id,version=this._version,task={};this._historyTask=task;this.setData({historyLoading:true,historyError:''});try{const chat=await api.request('GET','/api/v1/me/chats/'+id+'?cursor='+encodeURIComponent(this.data.historyCursor),null,true,uid());if(!this.valid(owner,id)||this._historyTask!==task||version!==this._version)return;const first=this.data.messages[0]?.id,merged=new Map();for(const row of [...(chat.items||[]),...this.data.messages])merged.set(row.id,row);this._chatReadingHistory=true;this._historyLoaded=true;this.setData({chat,permissionsReady:true,messages:[...merged.values()].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))||a.id.localeCompare(b.id)),historyHasMore:!!chat.hasMore,historyCursor:chat.nextCursor||'',chatScrollAnchor:first?'message-'+first:''});}catch(e){if(this.valid(owner,id)){const denied=['CHAT_UNAVAILABLE','ACCOUNT_INACTIVE','SESSION_EXPIRED','LOGIN_REQUIRED'].includes(e.code);this.setData({historyError:e.message,...(denied?{messages:[],chat:null,permissionsReady:false,historyHasMore:false,historyCursor:''}:{})});}}finally{if(this.valid(owner,id)&&this._historyTask===task)this.setData({historyLoading:false});}},
 input(e){this._draftRevision=(this._draftRevision||0)+1;this.setData({draft:e.detail.value,warning:'',sendError:''});},
 async submit(){
  if(this.data.sending||!api.hasSession()||!this.data.chat?.canSend||!this.data.draft.trim())return;
  const owner=this.syncOwner(),id=this.data.id,body=this.data.draft.trim(),raw=this.data.draft,revision=this._draftRevision,task={};
  if(!this.data.chat?.canSend||!body)return;
  const fingerprint=JSON.stringify([owner,id,body]);if(this._sendAttempt?.fingerprint!==fingerprint)this._sendAttempt={fingerprint,key:freshKey()};
  const sent=this._sendAttempt;this._sendTask=task;
  const active=()=>this.valid(owner,id)&&this._sendTask===task;
  this.setData({sending:true,sendError:'',warning:''});
  try{
   const r=await api.request('POST','/api/v1/me/chats/'+id+'/messages',{body,clientKey:sent.key},true,uid());
   if(!active())return;if(this._sendAttempt===sent)this._sendAttempt=null;
   const unchanged=this._draftRevision===revision&&this.data.draft===raw;
   this.setData({...(unchanged?{draft:''}:{}),warning:[r.message?.warning||'',unchanged?'':'上条消息已提交，当前输入内容已保留。'].filter(Boolean).join(' ')});
   this._chatReadingHistory=false;await this.refresh(true,true);
  }catch(e){if(active()){const restricted=['CHAT_BLOCKED','CHAT_NOT_ACCEPTED','CONTACT_RESTRICTED','PHONE_VERIFICATION_REQUIRED','ACCOUNT_CLOSED','ACCOUNT_INACTIVE'].includes(e.code);this.setData({sendError:e.message,...(restricted?{chat:{...this.data.chat,canSend:false},permissionsReady:false}:{})});if(e.code==='PHONE_VERIFICATION_REQUIRED')require('../../utils/verification').open();}}
  finally{if(active()){this._sendTask=null;this.setData({sending:false});}}
 },
 openItem(){if(this.data.chat?.publicationStatus!=='published'){wx.showToast({title:'关联信息已结束或暂不可见',icon:'none'});return;}wx.navigateTo({url:'/pages/detail/index?id='+this.data.chat.publicationId});},
 safetyAction(){
  if(!this.data.chat||this.data.safetyBusy||this._disposed)return;
  const owner=ownerKey(),session=tabs.context(),id=this.data.id,peerId=this.data.chat.peerId,task={};this._safetyTask=task;this.setData({safetyBusy:true});
  const active=()=>this.valid(owner,id)&&this._safetyTask===task&&session===tabs.context()&&this.data.chat?.peerId===peerId;
  const release=()=>{if(this.valid(owner,id)&&this._safetyTask===task){this._safetyTask=null;this.setData({safetyBusy:false});}};
  wx.showActionSheet({itemList:['结束会话','拉黑对方','举报对方'],success:r=>{
   if(!active()||![0,1,2].includes(r.tapIndex)){release();return;}
   if(r.tapIndex===2){release();this.report({currentTarget:{dataset:{type:'user',id:peerId}}});return;}
   wx.showModal({title:r.tapIndex===0?'结束这段会话？':'拉黑对方？',content:'处理后停止新消息，已有记录按平台规则保留。',success:async v=>{
    if(!v.confirm||!active()){release();return;}
    try{await api.request('POST','/api/v1/me/chats/'+id+(r.tapIndex===0?'/end':'/block'),{},true,uid());if(this.valid(owner,id))await this.refresh();}
    catch(e){if(this.valid(owner,id))api.showError(e);}finally{release();}
   },fail:release});
  },fail:release});
 },
 report(e){
  if(!this.data.chat||this.data.reportBusy||this._disposed)return;
  const {id,type}=e.currentTarget.dataset;
  if(!['user','message'].includes(type)||(type==='user'?id!==this.data.chat.peerId:!this.data.messages.some(x=>x.id===id&&!x.mine)))return;
  const target=type+':'+id;if(this._reportDraftTarget!==target){this._reportDraftTarget=target;this.setData({reportDraft:''});}
  const owner=ownerKey(),session=tabs.context(),chatId=this.data.id,task={};this._reportTask=task;this.setData({reportBusy:true,reportError:''});
  const current=()=>this.valid(owner,chatId)&&this._reportTask===task;
  const active=()=>current()&&session===tabs.context();
  const release=()=>{if(current()){this._reportTask=null;this.setData({reportBusy:false});}};
  wx.showModal({title:type==='user'?'举报用户':'举报这条消息',editable:true,content:this.data.reportDraft||'',placeholderText:'说明问题，不要填写无关个人信息',success:async r=>{
   if(!r.confirm||!active()){release();return;}this.setData({reportDraft:r.content||''});
   try{await api.request('POST','/api/v1/reports',{targetType:type,targetId:id,reason:'unsafe',description:r.content||''},true,uid());if(current()){this.setData({reportDraft:'',reportError:''});wx.showToast({title:'举报已提交'});}}
   catch(e){if(current())this.setData({reportError:e.message});}finally{release();}
  },fail:release});
 }
});
