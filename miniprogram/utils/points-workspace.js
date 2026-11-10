'use strict';
const api=require('./api'),tabs=require('./tab-bar');
const views=['rewards','ledger','appeals','rules'];
const names={publication_approved:'首次审核通过',publication_valid_7d:'有效满7天',publication_valid_30d:'有效满30天',valid_favorite:'获得有效收藏',accepted_contact:'联系被接受'};
const statuses={pending:'观察期内',review:'待人工复核',settled:'已结算',cancelled:'已取消',rejected:'未通过',reversed:'已冲正',reversal_pending:'待冲正'};
const appealStatuses={pending:'待复核',accepted:'申诉成立',rejected:'维持原处理',withdrawn:'已撤回',superseded:'原版本已归档'};
const resolutions={queued:'已重新排队，仍需满足观察期与有效性检查',restored:'已追加恢复积分',reversal_cancelled:'已取消尚未执行的冲正，没有额外加分',source_changed:'贡献状态变化，请刷新后按最新记录申请',account_closed:'账号已注销，申诉归档'};
const kinds={earn:'贡献发放',hold:'冻结',release:'解除冻结',spend:'权益使用',reversal:'冲正',adjustment:'人工调整'};
const initialState={pointsFocusId:'',pointsAccount:null,pointsRules:[],pointsRows:[],pointsView:'rewards',pointsViewIndex:0,pointsViewNames:['奖励记录','积分账本','申诉记录','公开规则'],pointsBusy:false,pointsError:'',pointsHasMore:false,pointsOffset:0,pointsDraft:null,pointsRulesEnabled:false};
const live=(p,owner,version)=>!p.disposed&&owner===tabs.context()&&p.pointsVersion===version&&p.data.mode==='points';
const key=()=>'reward_appeal_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
const signed=n=>(Number(n)>0?'+':'')+String(n);
const date=value=>{const n=new Date(value).valueOf();return Number.isFinite(n)?new Date(n+8*3600e3).toISOString().replace('T',' ').slice(0,16):'';};
function present(view,row){
 if(view==='ledger')return {...row,title:kinds[row.kind]||'积分变动',subtitle:'可用 '+signed(row.available_delta)+' · 冻结 '+signed(row.held_delta),dateLabel:date(row.created_at)};
 if(view==='appeals')return {...row,title:'奖励申诉',statusLabel:appealStatuses[row.status]||row.status,resolutionLabel:resolutions[row.resolution]||'',dateLabel:date(row.created_at)};
 return {...row,title:names[row.rule_code]||'贡献奖励',statusLabel:statuses[row.status]||row.status,dateLabel:date(row.created_at),canAppeal:row.can_appeal===true,dueLabel:date(row.settle_after)};
}
async function open(view='rewards',targetId=''){
 if(!api.hasSession()){await this.signin();if(!api.hasSession())return;}
 view=views.includes(view)?view:'rewards';const owner=tabs.context(),version=this.pointsVersion=(this.pointsVersion||0)+1;
 this.setData({...initialState,mode:'points',pointsView:view,pointsViewIndex:views.indexOf(view),pointsBusy:true});
 try{
  const [account,rules]=await Promise.all([api.request('GET','/api/v1/points/account',null,true),api.request('GET','/api/v1/points/rules',null,true)]);
  if(!live(this,owner,version))return;
  this.setData({pointsAccount:account,pointsRules:rules.items.map(r=>({...r,title:names[r.code]||r.code})),pointsRulesEnabled:rules.items.some(r=>r.enabled),pointsBusy:false});
  if(view!=='rules')await load.call(this,true);
  if(targetId&&view!=='rules'&&live(this,owner,version)){
   if(!this.data.pointsRows.some(row=>row.id===targetId)){const result=await api.request('GET','/api/v1/points/'+view+'/'+encodeURIComponent(targetId),null,true);if(!live(this,owner,version))return;this.setData({pointsRows:[present(view,result.item),...this.data.pointsRows]});}
   this.setData({pointsFocusId:targetId},()=>{if(!live(this,owner,version)||!wx.createSelectorQuery)return;wx.createSelectorQuery().select('#points-record-'+targetId).boundingClientRect().selectViewport().scrollOffset().exec(r=>{if(live(this,owner,version)&&r[0]&&r[1])wx.pageScrollTo?.({scrollTop:Math.max(0,r[1].scrollTop+r[0].top-110),duration:this.data.displayPreferences?.reduceMotion?0:150});});});
  }
 }catch(e){if(live(this,owner,version))this.setData({pointsBusy:false,pointsError:e.message||'积分明细暂不可用，请稍后重试'});}
}
async function load(reset=false){
 if(this.data.pointsBusy||this.data.pointsView==='rules')return;
 const owner=tabs.context(),version=this.pointsVersion,view=this.data.pointsView,offset=reset?0:this.data.pointsOffset;
 this.setData({pointsBusy:true,pointsError:''});
 try{
  const result=await api.request('GET','/api/v1/points/'+view+'?offset='+offset,null,true);if(!live(this,owner,version)||view!==this.data.pointsView)return;
  const rows=new Map((reset?[]:this.data.pointsRows).map(x=>[x.id,x]));for(const row of result.items)rows.set(row.id,present(view,row));
  this.setData({pointsRows:[...rows.values()],pointsOffset:offset+result.items.length,pointsHasMore:result.items.length===20,pointsBusy:false});
 }catch(e){if(live(this,owner,version))this.setData({pointsBusy:false,pointsError:e.message});}
}
function selectView(e){return open.call(this,views[Number(e.detail.value)]||'rewards');}
function beginAppeal(e){
 if(this.data.pointsBusy)return;const row=this.data.pointsRows.find(x=>x.id===e.currentTarget.dataset.id);if(!row?.canAppeal)return;
 const owner=tabs.context(),version=this.pointsVersion;
 this.setData({pointsDraft:{id:row.id,revision:row.revision,clientKey:key(),reason:'',lastSentReason:null},pointsError:''},()=>{
  if(!live(this,owner,version)||!wx.createSelectorQuery)return;
  const header=Number(this.selectComponent?.('#navigation-header')?.data?.headerHeight)||96;
  wx.createSelectorQuery().select('#reward-appeal-'+row.id).boundingClientRect().selectViewport().scrollOffset().exec(result=>{
   if(!live(this,owner,version)||!result[0]||!result[1])return;
   wx.pageScrollTo?.({scrollTop:Math.max(0,result[1].scrollTop+result[0].top-header-12),duration:this.data.displayPreferences?.reduceMotion?0:150});
  });
 });
}
function appealReason(e){if(!this.data.pointsBusy&&this.data.pointsDraft)this.setData({pointsDraft:{...this.data.pointsDraft,reason:e.detail.value}});}
async function submitAppeal(){
 if(this.data.pointsBusy||!this.data.pointsDraft)return;
 const owner=tabs.context(),version=this.pointsVersion,draft={...this.data.pointsDraft};if(draft.lastSentReason!==null&&draft.lastSentReason!==draft.reason)draft.clientKey=key();draft.lastSentReason=draft.reason;
 this.setData({pointsDraft:draft,pointsBusy:true,pointsError:''});
 try{
  await api.request('POST','/api/v1/points/rewards/'+draft.id+'/appeals',{reason:draft.reason,clientKey:draft.clientKey,rewardRevision:draft.revision},true);
  if(live(this,owner,version))await open.call(this,'appeals');
 }catch(e){if(live(this,owner,version))this.setData({pointsBusy:false,pointsError:e.message});}
}
async function withdrawAppeal(e){
 if(this.data.pointsBusy)return;const owner=tabs.context(),version=this.pointsVersion,id=e.currentTarget.dataset.id;
 this.setData({pointsBusy:true,pointsError:''});
 try{
  const result=await new Promise(resolve=>wx.showModal({title:'撤回这条积分申诉？',content:'撤回只结束本次申请，不会自动恢复积分。',success:resolve,fail:()=>resolve({confirm:false})}));if(!result.confirm||!live(this,owner,version))return;
  await api.request('POST','/api/v1/points/appeals/'+id+'/withdraw',{},true);if(live(this,owner,version))await open.call(this,'appeals');
 }catch(e){if(live(this,owner,version))this.setData({pointsError:e.message});}finally{if(live(this,owner,version))this.setData({pointsBusy:false});}
}
module.exports={initialState,open,load,selectView,beginAppeal,appealReason,submitAppeal,withdrawAppeal};
