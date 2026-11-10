const api=require('../../utils/api'),flow=require('../../utils/workflow-client');
const status={open:'待约定',scheduled:'已约定',completion_pending:'待对方确认完成',completed:'双方确认完成',cancel_pending:'待对方确认取消',cancelled:'双方确认取消',disputed:'反馈待处理',resolved:'反馈已答复'};
const actions={propose_schedule:'提议时间',accept_schedule:'同意时间',reject_schedule:'不同意时间',withdraw_schedule:'撤回时间提议',request_completion:'申请确认完成',confirm_completion:'确认已经完成',reject_completion:'暂不确认完成',request_cancel:'申请取消',confirm_cancel:'同意取消',reject_cancel:'不同意取消',dispute:'反馈本次沟通问题',note:'补充处理说明',feedback:'提交结束反馈'};
Page({data:{historyExpanded:false,primaryAction:null,secondaryActions:[],secondarySummary:'',privateLocked:false,loading:false,busy:false,error:'',pending:null,items:[],item:null,offset:0,hasMore:false,filter:'all',filters:[{id:'all',name:'全部'},{id:'active',name:'处理中'},{id:'closed',name:'已结束'},{id:'disputed',name:'反馈'}],body:'',date:'',time:'',actionRows:[],createSource:null,statusNames:status},
 onLoad(o={}){this.options=o;},
 onShow(){this.disposed=false;this.version=(this.version||0)+1;require('../../utils/theme').apply(this);const uid=flow.owner();if(this.owner!==undefined&&this.owner!==uid)this.setData({item:null,items:[],body:'',date:'',time:'',actionRows:[]});this.owner=uid;this.setData({busy:false,privateLocked:!api.hasSession(),pending:flow.pending()});if(!api.hasSession()){this.setData({item:null,items:[],actionRows:[],loading:false});return;}return this.load();},
 onHide(){this.version=(this.version||0)+1;},onUnload(){this.disposed=true;this.version=(this.version||0)+1;},onAuthResumed(){return this.load();},onPullDownRefresh(){return this.load().finally(()=>wx.stopPullDownRefresh());},
 async signin(){try{await flow.login();if(!this.disposed){this.setData({privateLocked:false});return this.load();}}catch(e){if(!this.disposed)this.setData({error:e.message});}},
 async load(more=false){more=more===true;const uid=flow.owner(),version=this.version;if(!api.hasSession()){this.setData({privateLocked:true,item:null,items:[],actionRows:[],loading:false});return;}this.setData({privateLocked:false,loading:true,error:'',pending:flow.pending()});try{
  if(this.options.id){const r=await api.request('GET','/api/v1/business/cases/'+encodeURIComponent(this.options.id),null,true,uid);if(flow.alive(this,uid,version)){this.setData({item:this.present(r.item),items:[],createSource:null});this.renderActions();}return;}
  if(this.options.sourceId){const kind=this.options.sourceKind==='booking'?'booking':'contact',r=await api.request('GET','/api/v1/business/source?sourceKind='+kind+'&sourceId='+encodeURIComponent(this.options.sourceId),null,true,uid);if(!flow.alive(this,uid,version))return;if(r.item){this.options={id:r.item.id};return this.load();}this.setData({createSource:{kind,id:this.options.sourceId},item:null});return;}
  const offset=more?this.data.offset+20:0,r=await api.request('GET','/api/v1/business/cases?filter='+this.data.filter+'&offset='+offset,null,true,uid);if(flow.alive(this,uid,version))this.setData({items:(more?[...this.data.items,...r.items]:r.items).map(x=>this.present(x)),offset,hasMore:!!r.hasMore,item:null,createSource:null});
 }catch(e){if(flow.alive(this,uid,version))this.setData({error:e.message});}finally{if(flow.alive(this,uid,version))this.setData({loading:false});}},
 present(item) {
  const definition = require('../../utils/industry-workflows').workflow(item.project_id);
  const snapshotFields = (definition?.fields || []).filter(field => item.snapshot.fields?.[field.key] !== undefined)
   .map(field => ({key:field.key,label:field.label,value:typeof item.snapshot.fields[field.key] === 'boolean'
    ? '已确认' : field.type === 'datetime' ? flow.date(item.snapshot.fields[field.key]) : item.snapshot.fields[field.key]}));
  const events = (item.events || []).map(event => ({
   ...event,
   title:actions[event.action] || ({created:'建立沟通记录',resolve_dispute:'平台反馈答复'}[event.action]) || '处理记录',
   dateText:flow.date(event.created_at),
   timeText:flow.date(event.detail?.scheduledAt)
  }));
  return {
   ...item,
   resolutionText:({completed:'本次跟进已结束',cancelled:'本次联系已取消'}[item.resolution_outcome]) || '',
   snapshotFields,
   statusText:item.status === 'completed' && item.snapshot.bookingStatus === 'completed' ? '原预约已完成' : status[item.status] || '待核对',
   scheduledText:flow.date(item.scheduled_at),
   proposedText:flow.date(item.proposed_at),
   dateText:flow.date(item.updated_at),
   events,
   recentEvents:events.slice(-3)
  };
 },
 toggleHistory() { this.setData({historyExpanded:!this.data.historyExpanded}); },
 renderActions(){const row=this.data.item,uid=flow.owner();if(!row)return;const available=[];if(['open','scheduled'].includes(row.status)){if(row.source_kind!=='booking'&&row.kind!=='event')available.push('propose_schedule');if(row.proposed_at)available.push(row.proposed_by===uid?'withdraw_schedule':'accept_schedule',...(row.proposed_by===uid?[]:['reject_schedule']));if(!row.proposed_at)available.push('request_completion');available.push('request_cancel','note','dispute');}else if(row.status==='completion_pending'){if(row.requested_by!==uid)available.push('confirm_completion','reject_completion');available.push('request_cancel','note','dispute');}else if(row.status==='cancel_pending'){if(row.requested_by!==uid)available.push('confirm_cancel','reject_cancel');available.push('note','dispute');}else if(row.status==='disputed')available.push('note');else{if(!row.events.some(x=>x.mine&&x.action==='feedback'))available.push('feedback');if(row.status==='completed')available.push('dispute');}const actionRows=available.map(id=>({id,name:actions[id]}));
  const priority=['accept_schedule','confirm_completion','confirm_cancel','withdraw_schedule',row.status==='open'?'propose_schedule':'request_completion','feedback','note','request_cancel'];
  const primaryId=priority.find(id=>available.includes(id))||available[0];
  const secondaryActions=actionRows.filter(action=>action.id!==primaryId);
  this.setData({actionRows,primaryAction:actionRows.find(action=>action.id===primaryId)||null,secondaryActions,secondarySummary:secondaryActions.slice(0,2).map(action=>action.name).join(' · ')});},
 input(e){const key=e.currentTarget.dataset.key;if(['body','date','time'].includes(key)){this.setData({[key]:e.detail.value});if(this.data.body||this.data.date||this.data.time)wx.enableAlertBeforeUnload?.({message:'本次处理说明尚未提交'});else wx.disableAlertBeforeUnload?.();}},
 async create(){if(!this.data.createSource||this.data.busy)return;if(!await flow.confirm('建立参与人之间的沟通记录，用于约定时间、确认跟进状态和提交问题反馈。'))return;const source=this.data.createSource;return this.write('/api/v1/business/cases',{sourceKind:source.kind,sourceId:source.id,agreed:true},true);},
 async act(e){const action=e.currentTarget.dataset.action,row=this.data.item;if(!row||this.data.busy||!this.data.actionRows.some(x=>x.id===action))return;let scheduledAt;if(action==='propose_schedule'){if(!this.data.date||!this.data.time){this.setData({error:'请选择约定日期和时间'});return;}scheduledAt=this.data.date+'T'+this.data.time+':00+08:00';}const body=this.data.body.trim();if(body.length<8){this.setData({error:'请填写至少8个字的处理说明'});return;}if(!await flow.confirm(actions[action]+'？请按本页原始内容核对，完成与取消须由另一方确认。'))return;return this.write('/api/v1/business/cases/'+row.id,{action,revision:row.revision,body,...(scheduledAt?{scheduledAt}:{})},true);},
 async write(url,body,keyed){try{const r=await flow.write(this,'POST',url,body,{keyed});if(!r.live)return;this.options={id:r.result.item.id};this.setData({body:'',date:'',time:''});wx.disableAlertBeforeUnload?.();await this.load();return r.result;}catch(e){api.showError(e);}},
 async resume(){try{const pending=flow.pending();if(pending&&!pending.url.startsWith('/api/v1/business/')){this.setData({error:'此待核对请求来自其他业务，请回到原提交页面核对。'});return;}const r=await flow.resume(this);if(r?.live&&r.result?.item?.id){this.options={id:r.result.item.id};return this.load();}}catch(e){api.showError(e);}},
 async clearPending(){if(await flow.confirm('请先核对原记录。清除此请求不会撤销已提交操作；确认已经核对？')){flow.abandon();this.setData({pending:null});}},
 filter(e){if(this.data.busy||!this.data.filters.some(x=>x.id===e.currentTarget.dataset.id))return;this.version++;this.setData({filter:e.currentTarget.dataset.id,items:[],offset:0,hasMore:false});return this.load();},
 more(){if(!this.data.loading&&this.data.hasMore)return this.load(true);},open(e){wx.navigateTo({url:'/pages/business/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});},
 async original(){if(this.data.busy)return;if((this.data.body||this.data.date||this.data.time)&&!await flow.confirm('本次说明或时间尚未提交，确定放弃并查看原记录？'))return;wx.disableAlertBeforeUnload?.();const row=this.data.item;if(!row)return;if(row.source_kind==='booking')wx.navigateTo({url:'/pages/my-bookings/index'});else if(row.project_id&&require('../../utils/project-journeys').journey(row.project_id)?.route==='industry')wx.navigateTo({url:'/pages/industry/index?target='+encodeURIComponent(row.source_id)});else wx.navigateTo({url:'/pages/detail/index?id='+encodeURIComponent(row.publication_id)});},
 async back(){if(this.data.busy)return;if((this.data.body||this.data.date||this.data.time)&&!await flow.confirm('本次说明或时间尚未提交，确定放弃并返回？'))return;wx.disableAlertBeforeUnload?.();wx.navigateBack({fail:()=>require('../../utils/navigation').personalCenter('service')});}
});
