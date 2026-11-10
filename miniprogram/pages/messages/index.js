const api=require('../../utils/api');
const tabs=require('../../utils/tab-bar');
const view=require('../../utils/message-view');
function contactTask(page,id){
 const owner=tabs.context(),uid=owner.split(':')[0],task={};page.contactTask=task;page.setData({contactBusyId:id,contactError:''});
 const active=()=>!page.disposed&&page.contactTask===task&&uid===tabs.context().split(':')[0];
 return {active,confirmed:()=>active()&&owner===tabs.context(),uid:uid||'guest',finish(){if(active()){page.contactTask=null;page.setData({contactBusyId:''});}}};
}
Page({
 data:{tab:'contacts',items:[],contacts:[],visibleContacts:[],visibleNotices:[],pendingContacts:0,contactPage:0,contactsHasMore:false,contactsLoading:false,contactFilter:'all',noticeFilter:'all',query:'',searchOpen:false,expandedId:'',unread:0,page:0,hasMore:false,loading:false,reading:false,error:'',contactBusyId:'',contactError:'',hasSession:api.hasSession()},
 onShow(){this.disposed=false;require('../../utils/theme').apply(this);this.refresh();},
 onUnload(){this.disposed=true;this.version=(this.version||0)+1;},
 onPullDownRefresh(){return this.refresh().finally(()=>wx.stopPullDownRefresh());},
 async signin(){try{await api.login();return this.refresh();}catch(e){api.showError(e);}},
 valid(version,owner){return !this.disposed&&version===this.version&&owner===tabs.context();},
 filter(){this.setData({visibleContacts:view.filterContacts(this.data.contacts,this.data.query,this.data.contactFilter),visibleNotices:this.data.items.filter(x=>this.data.noticeFilter==='all'||x.category===this.data.noticeFilter)});},
 async refresh(){
  const version=this.version=(this.version||0)+1,owner=tabs.context();
  if(this.owner!==owner){this.owner=owner;this.contactTask=null;this.contactResponse=null;this.setData({contactPage:0,contactsHasMore:false,contactsLoading:false,items:[],contacts:[],visibleContacts:[],visibleNotices:[],unread:0,pendingContacts:0,expandedId:'',query:'',searchOpen:false,page:0,hasMore:false,reading:false,contactBusyId:'',contactError:''});}
  if(!api.hasSession()){this.setData({contactPage:0,contactsHasMore:false,contactsLoading:false,hasSession:false,items:[],contacts:[],visibleContacts:[],visibleNotices:[],unread:0,pendingContacts:0,loading:false,error:'',page:0,hasMore:false});tabs.setUnread(0,this);return;}
  this.setData({hasSession:true,loading:true,error:''});
  try{
   const [r,c]=await Promise.all([api.request('GET','/api/v1/me/notifications',null,true),api.request('GET','/api/v1/me/contacts',null,true)]);
   if(!this.valid(version,owner))return;
   const contacts=c.items.map(view.contact);
   this.setData({items:r.items.map(view.notice),contacts,contactPage:1,contactsHasMore:!!c.hasMore,contactsLoading:false,pendingContacts:Number.isInteger(c.pendingCount)?c.pendingCount:contacts.filter(x=>x.needsReply).length,unread:r.unread,page:1,hasMore:typeof r.hasMore==='boolean'?r.hasMore:r.items.length===20,loading:false,contactError:''});
   this.filter();tabs.setUnread(r.unread,this,owner);
  }catch(e){if(this.valid(version,owner))this.setData({loading:false,error:e.message});}
 },
 tab(e){const tab=e.currentTarget.dataset.tab;if(!['contacts','notices'].includes(tab))return;this.setData({tab});},
 toggleSearch(){this.setData({searchOpen:!this.data.searchOpen,query:''});this.filter();},
 search(e){this.setData({query:String(e.detail.value||'').slice(0,100)});this.filter();},
 showPending(){this.setData({tab:'contacts',contactFilter:'pending'});this.filter();},
 showAllContacts(){this.setData({contactFilter:'all'});this.filter();},
 async moreContacts(){
  if(this.data.loading||this.data.contactsLoading||this.data.contactBusyId||!this.data.contactsHasMore)return;const owner=tabs.context(),version=this.version,page=this.data.contactPage+1;this.setData({contactsLoading:true,error:''});
  try{const result=await api.request('GET','/api/v1/me/contacts?page='+page,null,true);if(!this.valid(version,owner))return;const rows=new Map(this.data.contacts.map(x=>[x.id,x]));for(const item of result.items)rows.set(item.id,view.contact(item));this.setData({contacts:[...rows.values()],contactPage:page,contactsHasMore:!!result.hasMore});this.filter();}catch(e){if(this.valid(version,owner))this.setData({error:e.message});}finally{if(this.valid(version,owner))this.setData({contactsLoading:false});}
 },
 toggleContact(e){const id=e.currentTarget.dataset.id;if(this.data.contacts.some(x=>x.id===id))this.setData({expandedId:this.data.expandedId===id?'':id});},
 filterNotices(e){
  const category=e.currentTarget.dataset.category;
  if(!['all','review','booking','business','merchant','points'].includes(category))return;
  this.setData({noticeFilter:this.data.noticeFilter===category?'all':category});this.filter();
 },
 async more(){
  if(this.data.loading||!this.data.hasMore||!api.hasSession())return;
  const version=this.version,owner=tabs.context();this.setData({loading:true,error:''});
  try{
   const page=this.data.page+1,r=await api.request('GET','/api/v1/me/notifications?page='+page,null,true);
   if(!this.valid(version,owner))return;
   const ids=new Set(this.data.items.map(x=>x.id));
   this.setData({items:[...this.data.items,...r.items.filter(x=>!ids.has(x.id)).map(view.notice)],page,hasMore:typeof r.hasMore==='boolean'?r.hasMore:r.items.length===20,loading:false});this.filter();
  }catch(e){if(this.valid(version,owner))this.setData({error:e.message,loading:false});}
 },
 async readAll(){
  if(this.data.reading||!this.data.unread||!api.hasSession())return;
  const owner=tabs.context();this.setData({reading:true});
  try{await api.request('POST','/api/v1/me/notifications/read',{id:null},true);if(!this.disposed&&owner===tabs.context())await this.refresh();}
  catch(e){if(owner===tabs.context())api.showError(e);}
  finally{if(!this.disposed&&owner===tabs.context())this.setData({reading:false});}
 },
 async open(e){
  const n=this.data.items.find(x=>x.id===e.currentTarget.dataset.id);if(!n||this.opening)return;
  this.opening=true;
  const owner=tabs.context();
  try{
   await api.request('POST','/api/v1/me/notifications/read',{id:n.id},true);
   if(this.disposed||owner!==tabs.context())return;
   this.setData({items:this.data.items.map(x=>x.id===n.id?{...x,readAt:x.readAt||new Date().toISOString()}:x),unread:Math.max(0,this.data.unread-(n.readAt?0:1))});this.filter();tabs.setUnread(this.data.unread,this,owner);
   if(['points-appeal','points-ledger','points-reward'].includes(n.targetKind)){getApp().globalData.openPoints=true;getApp().globalData.pointsTarget={view:n.targetKind==='points-appeal'?'appeals':n.targetKind==='points-ledger'?'ledger':'rewards',id:n.targetId};wx.switchTab({url:'/pages/me/index'});return;}
   if(n.targetKind==='privacy'){getApp().globalData.openPrivacy=true;wx.switchTab({url:'/pages/me/index'});return;}
   if(n.targetKind==='home-report'){wx.navigateTo({url:'/pages/information/index?reportId='+encodeURIComponent(n.targetId)});return;}
   if(n.targetKind==='commerce'||n.targetKind==='promotion'){wx.navigateTo({url:'/pages/commerce/index?tab='+(n.targetKind==='promotion'?'promotion':'orders')+'&focusId='+encodeURIComponent(n.targetId)});return;}
   if(n.targetKind==='businesscase'){wx.navigateTo({url:'/pages/business/index?id='+encodeURIComponent(n.targetId)});return;}
   if(n.targetKind==='industry'){wx.navigateTo({url:'/pages/industry/index?target='+encodeURIComponent(n.targetId)});return;}
   if(n.targetKind==='publication-expiry'){wx.navigateTo({url:'/pages/my-posts/index'});return;}
   if(n.targetKind==='contact'){this.setData({tab:'contacts',contactFilter:'all',query:'',expandedId:n.targetId});this.filter();this.refresh();return;}
   if(n.targetKind==='merchant'){wx.navigateTo({url:'/pages/merchant/index'});return;}
   if(n.targetKind==='booking'){wx.navigateTo({url:'/pages/my-bookings/index'});return;}
   if(n.targetKind==='merchant-booking'){wx.navigateTo({url:'/pages/merchant-bookings/index?merchantId='+encodeURIComponent(n.targetId)});return;}
   try{await api.request('GET','/api/v1/items/'+encodeURIComponent(n.targetId));if(owner===tabs.context()&&!this.disposed)wx.navigateTo({url:'/pages/detail/index?id='+encodeURIComponent(n.targetId)});}
   catch{if(owner===tabs.context()&&!this.disposed)wx.navigateTo({url:'/pages/my-posts/index'});}
  }catch(e){if(owner===tabs.context())api.showError(e);}
  finally{this.opening=false;}
 },
 block(e){
  if(this.disposed||this.data.contactBusyId||this.data.loading)return;
  const id=e.currentTarget.dataset.id,item=this.data.contacts.find(x=>x.id===id);if(!item||item.outgoing)return;
  const blocked=item.blocked,a=contactTask(this,id);
  wx.showModal({title:blocked?'解除屏蔽？':'屏蔽此申请者？',content:blocked?'对方可以重新发起申请，已经拒绝的申请不会自动恢复。':'屏蔽后，对方不能再向你发起新的联系申请。现有待处理申请将不予接受。',success:async r=>{
   const current=this.data.contacts.find(x=>x.id===id);if(!r.confirm||!a.confirmed()||!current||current.outgoing||current.blocked!==blocked){a.finish();return;}
   try{await api.request(blocked?'DELETE':'POST','/api/v1/me/contacts/'+id+'/block',{},true,a.uid);if(a.active()){wx.showToast({title:blocked?'已解除屏蔽':'已屏蔽'});await this.refresh();}}catch(e){if(a.active())this.setData({contactError:e.message});}finally{a.finish();}
  },fail:()=>a.finish()});
 },
 openBusiness(e){const row=this.data.contacts.find(x=>x.id===e.currentTarget.dataset.id);if(!row)return;wx.navigateTo({url:'/pages/business/index?'+(row.businessCaseId?'id='+encodeURIComponent(row.businessCaseId):'sourceKind=contact&sourceId='+encodeURIComponent(row.id))});},
 openChat(e){const item=this.data.contacts.find(x=>x.id===e.currentTarget.dataset.id);if(item?.status==='accepted')wx.navigateTo({url:'/pages/chat/index?id='+encodeURIComponent(item.id)});},
 openPoints(){getApp().globalData.openPoints=true;getApp().globalData.pointsTarget={view:'rewards'};wx.switchTab({url:'/pages/me/index'});},
 contactAction(e){
  if(this.disposed||this.data.contactBusyId||this.data.loading)return;
  const id=e.currentTarget.dataset.id,action=e.currentTarget.dataset.action,item=this.data.contacts.find(x=>x.id===id);
  if(!item||item.status!=='pending'||!['accept','reject','withdraw'].includes(action)||((action==='withdraw')!==!!item.outgoing)||(action==='accept'&&item.blocked))return;
  const a=contactTask(this,id),saved=this.contactResponse,prefill=saved?.uid===a.uid&&saved.id===id&&saved.action===action?saved.body:'';
  wx.showModal({title:action==='accept'?'回复并同意联系':action==='withdraw'?'撤回联系申请？':'不接受本次联系？',content:action==='accept'?prefill:'对方不会获得新的联系方式。',editable:action==='accept',placeholderText:'填写问候（选填），勿填写电话或外部链接',success:async r=>{
   const current=this.data.contacts.find(x=>x.id===id);
   if(!r.confirm||!a.confirmed()||!current||current.status!=='pending'||((action==='withdraw')!==!!current.outgoing)||(action==='accept'&&current.blocked)){a.finish();return;}
   this.contactResponse={uid:a.uid,id,action,body:r.content||''};
   try{await api.request('POST','/api/v1/me/contacts/'+id,{action,response:r.content||'已接受联系，可以开始站内聊天'},true,a.uid);if(a.active()){this.contactResponse=null;await this.refresh();}}catch(e){if(a.active())this.setData({contactError:e.message});}finally{a.finish();}
  },fail:()=>a.finish()});
 }
});
