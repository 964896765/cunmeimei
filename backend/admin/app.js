'use strict';
let taskPage=1,taskGeneration=0;
const taskNames={businesscase:'业务争议',publication:'内容审核',risk:'风险及重复信息',qualification:'特殊资质',merchant:'商家核验',report:'举报',appeal:'申诉',privacy:'数据权利',contact:'联系超时',service:'服务审核',operations:'系统异常',points:'贡献积分复核',rewardappeal:'积分申诉',homecontent:'首页内容审核',homereport:'首页内容纠错',benefit:'权益核销',promotion:'推广素材',advertiser:'广告主体',industry:'行业业务',industrycredential:'项目主体资质',industryreport:'行业举报'};
const signalNames={duplicate_content:'重复正文',duplicate_image:'重复图片',image_manual_review_required:'图片需人工检查',contact_in_content:'正文含联系方式',external_contact:'外部联系引导',transfer_request:'资金转账风险',credential_request:'验证码或密码风险',same_phone:'互动双方绑定同一号码',shared_phone_history:'双方存在近期共用号码历史',reciprocal_interaction:'双方相互互动',new_account_burst:'新账号短时跨作者互动',account_restricted:'账号仍有严重行为限制',account_risk:'账号风险待核对',publication_risk:'信息风险待复核',recipient_unverified:'贡献作者号码未验证',actor_unverified:'互动账号号码未验证',insufficient_reversal_balance:'余额不足，待冲正'};
async function loadTasks(){
 const generation=++taskGeneration;
 try{
  const permissionFor=kind=>['qualification','merchant','advertiser','industrycredential'].includes(kind)?'qualification':kind==='privacy'?'privacy':'operations';
  for(const option of el('task-kind').querySelectorAll?.('option')||[])option.hidden=!!option.value&&!canAdmin(permissionFor(option.value));
  const data=await api('/admin/api/workbench?kind='+encodeURIComponent(el('task-kind').value)+'&page='+taskPage);
  if(generation!==taskGeneration)return;
  el('task-counts').replaceChildren();for(const [kind,label] of Object.entries(taskNames))el('task-counts').append(cell('span',label+' '+(data.counts[kind]||0),'badge'));
  renderItems('task-list',data.items,(root,x)=>{
   const signals=(x.metadata.signals||[]).map(k=>signalNames[k]||k).join('、');
   const r=row(root,taskNames[x.kind]+' · '+x.title,new Date(x.createdAt).toLocaleString('zh-CN')+' · '+(x.userId||'商家服务'),signals);
   r.append(button('查看并处理',()=>openTask(x.kind,x.id)));
  });
  const paging=el('task-paging');paging.replaceChildren();paging.append(cell('span','共 '+data.total+' 项 · 第 '+data.page+' 页'));
  if(taskPage>1)paging.append(button('上一页',async()=>{taskPage--;await loadTasks();}));
  if(taskPage*data.size<data.total)paging.append(button('下一页',async()=>{taskPage++;await loadTasks();}));
 }catch(e){if(generation!==taskGeneration)return;el('task-counts').replaceChildren();el('task-list').replaceChildren(cell('p','待办读取失败：'+e.message));el('task-paging').replaceChildren(button('重试',loadTasks));}
}
async function openTask(kind,id){
 const task=await api('/admin/api/workbench/'+kind+'/'+id),root=el('task-detail');root.replaceChildren();
 root.append(cell('h3',taskNames[kind]+' · '+task.title));const d=task.detail||{};
 if(['businesscase','benefit','promotion','advertiser','industry','industrycredential','industryreport'].includes(kind)){renderWorkflowTask(root,kind,id,d);return;}
 if(d.description||d.reason)root.append(cell('p',d.description||d.reason));
 const actions=cell('div','','actions');root.append(actions);
 for(const imageId of d.imageIds||[]){const image=document.createElement('img');image.src='/admin/api/media/'+imageId;image.alt='本次待审原图';image.loading='lazy';image.className='content-preview';root.append(image);}
 const finish=async(url,payload,label)=>{await process(url,payload,label);root.replaceChildren();};
 if(['homecontent','homereport'].includes(kind)&&typeof renderHomeTask==='function')renderHomeTask(root,kind,id,d);
 if(kind==='operations'&&canRole('operator'))actions.append(button('重试维护并核对',async()=>{const results=await api('/admin/api/operations/run','POST',{});notify(Object.values(results).some(x=>x.ok===false)?'仍有维护异常，请核对待办及运行记录':'维护执行完成');await reload();}));
 if(kind==='rewardappeal'){
  actions.append(button('读取相关账户账本（审计）',async()=>{const data=await api('/admin/api/points/users/'+task.userId);root.append(cell('p','可用 '+data.account.available+'；冻结 '+data.account.held));for(const item of data.items)root.append(cell('p',item.kind+' · '+item.amount+' · '+item.reason));}));
  root.append(cell('p','当前贡献：'+d.rewardStatus+'；积分：'+d.amount+'；原处理版本：'+d.source_reward_revision));
  for(const report of d.reports||[]){const panel=cell('div');panel.append(cell('p','相关已处置举报：'+report.id+' · '+report.reason));if(canAdmin('evidence'))panel.append(button('读取举报证据（审计）',async()=>{const evidence=await api('/admin/api/reports/'+report.id+'/evidence');panel.append(cell('p',evidence.body||evidence.description||'暂无文字证据'));}));root.append(panel);}
  if(canRole('operator'))for(const status of (d.sourceChanged?['rejected']:['accepted','rejected']))actions.append(button(d.sourceChanged?'归档旧版本申诉':status==='accepted'?'核实后申诉成立':'维持原处理',async()=>{const response=await adminPrompt('填写已核查的事实、处理依据和用户答复（至少8字）');if(!response)return;const historical=['reversed','reversal_pending'].includes(d.rewardStatus);if(status==='accepted'&&historical&&!await adminConfirm('已逐项核查所列举报，并确认该笔贡献当时有效；恢复只影响本笔积分，不恢复公开内容或撤销其他处置。'))return;const result=await api('/admin/api/points/appeals/'+id+'/review','POST',{status,revision:d.revision,rewardRevision:d.rewardRevision,confirmed:true,response,historicalContributionConfirmed:historical,reviewedReportIds:(d.reports||[]).map(x=>x.id)});notify(result.status==='superseded'?'贡献状态已变化，旧申诉归档，请用户按最新状态申请':'申诉处理完成：'+result.resolution);root.replaceChildren();await reload();}));
 }
 if(kind==='points'){

  root.append(cell('p','规则：'+d.ruleCode+'；积分：'+d.amount+'；状态：'+d.status+'；信息版本：'+d.publicationRevision));
  root.append(cell('p',(d.signals||[]).map(x=>signalNames[x]||x).join('、'),'muted'));
  actions.append(button('读取账户与账本（审计）',async()=>{const data=await api('/admin/api/points/users/'+task.userId);root.append(cell('p','可用 '+data.account.available+'；冻结 '+data.account.held+'；待结算 '+data.account.pending));for(const item of data.items)root.append(cell('p',item.kind+' · '+item.amount+' · '+item.reason));}));
  if(canRole('operator')&&d.status==='review')for(const decision of ['approve','reject'])actions.append(button(decision==='approve'?'核实后允许结算':'拒绝本次奖励',async()=>{const reason=await adminPrompt('填写核实依据或拒绝原因（至少8字，保留证据引用，不写敏感号码）');if(reason)await finish('/admin/api/points/rewards/'+id+'/review',{decision,revision:d.revision,confirmed:true,reason},decision==='approve'?'核实风险后允许按原观察期结算':'拒绝本次贡献奖励');}));
  if(d.openAppealId)actions.append(button('查看关联积分申诉',()=>openTask('rewardappeal',d.openAppealId)));
  if(canRole('operator')&&d.status==='reversal_pending'&&!d.openAppealId)actions.append(button('重试账本冲正',async()=>{const reason=await adminPrompt('填写已核实的重试原因');if(reason)await finish('/admin/api/points/rewards/'+id+'/reverse',{revision:d.revision,confirmed:true,reason},'重试贡献冲正；余额不足仍保留待办');}));
 }
 if(['publication','service'].includes(kind))publicationRecordsButton(root,id);
 if(kind==='publication'){
  const sectorChecks=publicationReviewFields(root,d.reviewRule);

  const textCheck=document.createElement('input'),imageCheck=document.createElement('input');textCheck.type=imageCheck.type='checkbox';
  for(const [input,label] of [[textCheck,'已检查正文和业务规则'],[imageCheck,'已逐张检查原图']]){const l=cell('label');l.append(input,document.createTextNode(label));root.append(l);}
  actions.append(button('审核通过',async()=>{if(!textCheck.checked||d.imageIds?.length&&!imageCheck.checked)throw Error('请先实际完成文字与图片检查');await finish('/admin/api/review',{target:'publication',id,status:'published',expectedRevision:d.revision,textReviewed:true,imagesReviewed:imageCheck.checked,...sectorChecks()},'审核通过');}));
  actions.append(button('退回并说明',async()=>{const reason=await adminPrompt('填写修改原因');if(reason)await finish('/admin/api/review',{target:'publication',id,status:'rejected',expectedRevision:d.revision,reason},'退回信息');}));
  actions.append(button('紧急下架',async()=>{const reason=await adminPrompt('填写已核实的下架原因（至少8字）');if(reason)await finish('/admin/api/emergency-remove',{id,reason},'紧急下架');},true));
 }
 if(kind==='risk'){
  if(canAdmin('evidence'))actions.append(button('读取证据（审计）',async()=>{const e=await api('/admin/api/trust/risks/'+id+'/evidence');root.append(cell('p',e.body||e.title||'无文字证据'));}));
  actions.append(button('记录复核结论',async()=>{const reason=await adminPrompt('填写核查结论，违规内容请先下架；结案不会自动公开内容');if(reason)await finish('/admin/api/trust/risks/'+id,{reason},'风险结案');}));
 }
 if(kind==='report'){
  actions.append(button('读取证据（审计）',async()=>{const e=await api('/admin/api/reports/'+id+'/evidence');root.append(cell('p',e.body||e.description||'暂无文字证据'));}));
  for(const decision of ['removed','dismissed'])actions.append(button(decision==='removed'?'确认违规并处置':'记录不予处理',async()=>{const note=await adminPrompt('填写已核实的处理说明');if(note)await finish('/admin/api/review-report',{id,decision,note},'处理举报');},decision==='removed'));
 }
 if(kind==='appeal')for(const status of ['accepted','rejected'])actions.append(button(status==='accepted'?'申诉成立':'维持处置',async()=>{const response=await adminPrompt('填写复核依据及用户答复');if(response)await finish('/admin/api/trust/appeals/'+id,{status,revision:d.revision,response},'复核申诉');}));
 if(kind==='privacy')actions.append(button('读取请求并答复（审计）',async()=>{const x=(await api('/admin/api/privacy-requests/'+id)).item;root.append(cell('p',x.reason));if(x.kind==='closure')root.append(closureButton(id,x));const answer=cell('textarea');answer.maxLength=800;answer.placeholder='写明已实际处理的范围及答复';root.append(answer);for(const status of (x.kind==='closure'?['reviewing','rejected']:['reviewing','responded','rejected']))root.append(button({reviewing:'开始处理',responded:'记录答复',rejected:'不予受理'}[status],()=>finish('/admin/api/privacy-requests/'+id,{status,response:answer.value,revision:x.revision},'处理数据请求')));}));
 if(kind==='service'&&d.industryLink){renderLinkedService(root,id,d);return;}
 if(kind==='service')for(const status of ['published','disabled'])actions.append(button(status==='published'?'上架服务':'驳回服务',()=>finish('/admin/api/review-service',{id,status},'审核服务')));
 if(kind==='qualification'||kind==='merchant'){
  root.append(cell('p','账号：'+task.userId+' · '+(task.metadata.scope||'商家申请：'+id),'muted'));
  if(!canRole('verifier'))root.append(cell('p','请使用业务资质核验账号处理此任务，当前账号不能读取私有材料或确认核验。'));
  else if(kind==='qualification')actions.append(button('核验本条材料',async()=>{
   const reference=await adminPrompt('填写已实际核验的外部材料工单编号'),reason=await adminPrompt('填写材料核查依据和授权范围'),validUntil=await adminPrompt('材料实际有效期 YYYY-MM-DD');
   if(reference&&reason&&validUntil)await finish('/admin/api/trust/users/'+task.userId+'/qualification',{scope:task.metadata.scope,reference,reason,validUntil,status:'verified',revision:d.qualificationRevision,manuallyVerified:true},'确认本条材料核验');
  }));
  else {
   root.append(cell('p','主体：'+(d.licenseHolder||'未提交')+'；登记编号：'+(d.registrationCode||'未提交')+'；材料引用：'+(d.evidenceReference||'未提交')));
   if(d.licenseFileId){const link=cell('a','查看私有证照材料（审计）');link.href='/admin/api/licenses/'+d.licenseFileId;link.target='_blank';link.rel='noopener';root.append(link);}
   for(const status of ['in_review','needs_documents','rejected'])actions.append(button({in_review:'标记初审',needs_documents:'要求补材料',rejected:'拒绝申请'}[status],async()=>{const reason=await adminPrompt('填写审核说明');if(reason)await finish('/admin/api/review',{target:'merchant',id,status,reason},'处理商家材料');}));
   if(d.status==='in_review'&&d.registrationCode&&d.licenseHolder&&d.evidenceReference)actions.append(button('人工核验后开通',async()=>{const note=await adminPrompt('记录实际完成的主体与业务资质核验依据');if(note)await finish('/admin/api/approve-merchant',{id,note,manuallyVerified:true},'人工确认开通');}));
  }
 }
 root.scrollIntoView({behavior:'smooth',block:'start'});
}
let csrf='',adminRole='operator',adminPermissions=[];
function canRole(role){return adminRole===role||adminRole==='superadmin';}
function canAdmin(permission){return adminPermissions.includes(permission);}
const el=id=>document.getElementById(id);
function notify(s){el('message').textContent=s;}
async function api(url,method='GET',payload){const r=await fetch(url,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},credentials:'same-origin',body:payload?JSON.stringify(payload):undefined});const data=await r.json();if(!r.ok)throw Error(data.message||'请求失败');return data;}
function cell(tag,t,cls){const e=document.createElement(tag);e.textContent=t==null?'':String(t);if(cls)e.className=cls;return e;}
function button(label,callback,danger=false){const b=cell('button',label,danger?'danger':'secondary');b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await callback();}catch(e){notify(e.message);}finally{b.disabled=false;}});return b;}
function row(root,title,subtitle,details){const card=cell('div','','item');card.append(cell('strong',title));card.append(cell('p',subtitle,'muted'));if(details)card.append(cell('p',details));root.append(card);return card;}
function renderItems(rootId,entries,render){const root=el(rootId);root.replaceChildren();if(!entries.length){root.append(cell('p','暂无待处理记录','muted'));return;}entries.forEach(x=>render(root,x));}
async function process(url,data,description){if(!await adminConfirm('确定执行“'+description+'”？'))return;await api(url,'POST',data);notify('处理成功');await reload();}
async function reload(){
 if(canAdmin('operations')&&typeof loadHomeConsole==='function')await loadHomeConsole();
 if(typeof loadWorkflowConsole==='function')await loadWorkflowConsole();
 if(typeof loadMemorialConsole==='function')await loadMemorialConsole();
 await loadTasks();
 if(canAdmin('operations'))await loadPointsRules();else el('points-rules').replaceChildren();
 const [stats,queue,config,comments,privacy,trust,projectCatalog]=await Promise.all([api('/admin/api/stats'),api('/admin/api/queue'),api('/admin/api/catalog'),canAdmin('operations')?api('/admin/api/comments'):Promise.resolve({items:[]}),canAdmin('privacy')?api('/admin/api/privacy-requests'):Promise.resolve({items:[]}),api('/admin/api/trust?limit=20'),api('/admin/api/trust/classification')]);
 renderItems('project-catalog',projectCatalog.items||[],(root,x)=>row(root,x.id+' · '+x.name,x.categoryName+' / '+x.group,(x.workflow?'行业业务流程 · '+(x.workflow.credential?'本项目主体/专项核验':'内容及来源审核'):x.publication?.enabled?'居民发布表单':'未开放')+' · '+(x.publication?.businessCodes||[]).join('/')+' · '+x.publication?.reviewPolicy));
 renderTrust(trust);
 renderItems('regions',config.regions||[],(root,x)=>{
  const r=row(root,x.name,x.enabled?'已启用 · 接受新发布':'已停用 · 不接收新发布'),actions=cell('div','','actions');
  if(canAdmin('operations'))actions.append(button(x.enabled?'停用':'启用',()=>process('/admin/api/regions/status',{name:x.name,enabled:!x.enabled},x.enabled?'停用地区':'启用地区'),x.enabled));r.append(actions);
 });
 renderItems('categories',config.categories||[],(root,x)=>{
  const r=row(root,x.name,x.restricted?'受限业务 · 不可由后台解锁':(x.enabled?'允许新业务':'暂停新业务')),actions=cell('div','','actions');
  if(canAdmin('operations')&&!x.restricted)actions.append(button(x.enabled?'暂停':'恢复',()=>process('/admin/api/categories/status',{id:x.id,enabled:!x.enabled},x.enabled?'暂停分类':'恢复分类'),x.enabled));
  r.append(actions);
 });
 el('stats').replaceChildren();for(const [title,num] of [['待审内容',stats.pendingPublications],['已公开内容',stats.published],['商家申请',stats.merchantApplications],['注册用户',stats.users]]){const c=cell('div','','card');c.append(cell('div',title,'muted'));c.append(cell('div',num,'value'));el('stats').append(c);}
 renderItems('publications',queue.publications||[],(root,x)=>{
  const r=row(root,x.title,({used:'二手闲置',housing:'房屋信息',community:'邻里社区',service:'服务需求'}[x.type]||x.type)+' · '+x.district,x.description||x.detail),actions=cell('div','','actions');
  if(canRole('verifier')&&x.type==='housing')actions.append(button('核验本条房源材料',async()=>{const reference=await adminPrompt('已实际核验的外部材料工单编号'),reason=await adminPrompt('房源产权或授权核验过程'),validUntil=await adminPrompt('材料真实有效期 YYYY-MM-DD');if(!reference||!reason||!validUntil)return;const scope='publication:'+x.id,prior=(await api('/admin/api/trust/users/'+x.userId+'/qualification?scope='+encodeURIComponent(scope))).qualification;await process('/admin/api/trust/users/'+x.userId+'/qualification',{scope,reference,reason,validUntil,status:'verified',revision:prior?.revision||0,manuallyVerified:true},'核验此条房源材料');}));
  if(x.attributes)r.append(cell('p',Object.values(x.attributes).filter(Boolean).join(' · '),'muted'));
  for(const id of x.imageIds||[]){if(!/^[a-f0-9-]{36}$/i.test(id))continue;const image=document.createElement('img');image.src='/admin/api/media/'+id+'?size=thumb';image.alt='待审核内容图片';image.className='content-preview';r.append(image);}
  if(canAdmin('operations'))actions.append(button('读取并逐项审核',()=>openTask('publication',x.id)));
  if(canAdmin('operations'))publicationRecordsButton(r,x.id);
  r.append(actions);
 });
 renderItems('merchants',queue.merchantApplications||[],(root,x)=>{
  const r=row(root,x.name,x.category+' · '+x.district+' · '+x.status,x.evidenceRestricted?'商家敏感材料仅供业务核验角色读取。':`主体名称：${x.licenseHolder||'未提交'} ；登记编号：${x.registrationCode||'未提交'} ；线下核验编号：${x.evidenceReference||'未提交'}`),actions=cell('div','','actions');
  if(x.licenseFileId&&/^[a-f0-9-]{36}$/i.test(x.licenseFileId)){
   const link=cell('a','下载私有证照图片（仅管理员）');link.href='/admin/api/licenses/'+x.licenseFileId;link.rel='noopener';r.append(link);
  }
  if(canAdmin('operations'))for(const [status,label] of [['in_review','标记初审'],['needs_documents','需要补充资料'],['rejected','拒绝申请']])actions.append(button(label,async()=>{const reason=await adminPrompt('审核备注')||'';await process('/admin/api/review',{target:'merchant',id:x.id,status,reason},label);},status==='rejected'));
  if(canRole('verifier')&&x.status==='in_review'&&x.registrationCode&&x.licenseHolder&&x.evidenceReference){
   actions.append(button('人工核验后开通',async()=>{
    const note=await adminPrompt('填写线下核验依据（不少于 8 字，不得只凭编号自动开通）');if(!note)return;
    if(!await adminConfirm('我已在平台外人工检查经营主体证照和适用资质，确认真实性，并愿意留存审计记录。'))return;
    await api('/admin/api/approve-merchant','POST',{id:x.id,note,manuallyVerified:true});notify('商家已通过人工确认');await reload();
   }));
  }r.append(actions);
 });
 renderItems('services',queue.services||[],(root,x)=>{
  const r=row(root,x.title,'参考价 '+x.price+' · '+x.district,x.description),actions=cell('div','','actions');
  for(const id of x.imageIds||[]){if(!/^[a-f0-9-]{36}$/i.test(id))continue;const image=document.createElement('img');image.src='/admin/api/media/'+id+'?size=thumb';image.alt='待审核服务图片';image.className='content-preview';r.append(image);}
  if(x.industryLink){actions.append(button('读取项目范围并审核',()=>openTask('service',x.id)));return;}
  for(const [status,label] of [['published','上架服务'],['disabled','驳回服务']])actions.append(button(label,()=>process('/admin/api/review-service',{id:x.id,status},label),status==='disabled'));
  r.append(actions);
 });
 renderItems('comments',comments.items||[],(root,x)=>{
  const r=row(root,x.title,'历史留言待处理',x.body),actions=cell('div','','actions');
  for(const [status,label] of [['rejected','拒绝历史留言']])actions.append(button(label,async()=>{const reason=await adminPrompt('审核说明')||'';await process('/admin/api/comments/review',{id:x.id,status,reason},label);},status==='rejected'));r.append(actions);
 });
 renderItems('privacy-requests',privacy.items||[],(root,x)=>{
  const r=row(root,({access:'数据访问',correction:'数据更正',deletion:'数据删除',closure:'账号注销'}[x.kind]||x.kind),x.status),actions=cell('div','','actions');
  actions.append(button('读取详情（审计）',async()=>{
   const detail=(await api('/admin/api/privacy-requests/'+x.id)).item;
   const prior=r.querySelector('.privacy-detail');if(prior)prior.remove();const panel=cell('div','','privacy-detail');panel.append(cell('p',detail.reason));if(detail.kind==='closure')panel.append(closureButton(x.id,detail));
   const answer=cell('textarea');answer.maxLength=800;answer.placeholder='写明实际处理范围和答复，不填写额外敏感资料';panel.append(answer);
   const replies=cell('div','','actions');for(const [state,label] of [['reviewing','标记处理中'],['responded','记录答复'],['rejected','不予受理']].filter(([state])=>detail.kind!=='closure'||state!=='responded'))replies.append(button(label,async()=>{await process('/admin/api/privacy-requests/'+x.id,{status:state,response:answer.value,revision:detail.revision},label);},state==='rejected'));panel.append(replies);r.append(panel);
  }));r.append(actions);
 });
 renderItems('reports',queue.reports||[],(root,x)=>{
  const r=row(root,`举报：${x.reason}`,x.targetType+' · '+x.targetId,x.description),actions=cell('div','','actions');
  if(canAdmin('evidence')&&x.targetType==='message')actions.append(button('读取被举报消息（记录审计）',async()=>{const evidence=await api('/admin/api/reports/'+x.id+'/evidence');r.append(cell('p',evidence.body||'消息不可用'));}));for(const [decision,label] of [['dismissed','不予处理'],['removed',x.targetType==='user'?'确认用户举报（另行处置）':'确认违规并移除']])actions.append(button(label,async()=>{const note=await adminPrompt('处理说明（不少于 5 字）');if(!note)return;await process('/admin/api/review-report',{id:x.id,decision,note},label);},decision==='removed'));
  r.append(actions);
 });
}
async function connected(){try{const result=await api('/admin/api/session');csrf=result.csrf;adminRole=result.role||'operator';adminPermissions=result.permissions||[];taskPage=1;el('task-kind').value='';el('region-form').hidden=!canAdmin('operations');el('login').hidden=true;el('dashboard').hidden=false;el('refresh').hidden=false;el('logout').hidden=false;await reload();}catch{el('login').hidden=false;el('dashboard').hidden=true;el('refresh').hidden=true;el('logout').hidden=true;}}
el('login-form').addEventListener('submit',async e=>{e.preventDefault();try{const result=await api('/admin/api/login','POST',{password:el('password').value,role:el('admin-role').value});csrf=result.csrf;el('password').value='';notify('登录成功');await connected();}catch(err){notify(err.message);}});
el('refresh').addEventListener('click',()=>reload().catch(e=>notify(e.message)));connected();

el('region-form').addEventListener('submit',async e=>{e.preventDefault();const name=el('region-name').value.trim();try{await api('/admin/api/regions','POST',{name});el('region-name').value='';notify('地区已创建');await reload();}catch(err){notify(err.message);}});

el('logout').addEventListener('click',async()=>{try{await api('/admin/api/logout','POST',{});csrf='';notify('已退出');await connected();}catch(err){notify(err.message);}});

function until(days){return new Date(Date.now()+days*86400e3).toISOString();}
let trustView={},trustCursors={},trustGenerations={};
async function loadTrustPage(section,delta){const state=trustCursors[section]||{index:0,cursors:['']},index=state.index+delta;if(index<0)return;const cursor=delta>0?trustView.pagination?.[section]?.nextCursor:state.cursors[index];if(delta>0&&!cursor)return;const session=csrf,generation=trustGenerations[section]=(trustGenerations[section]||0)+1;try{const result=await api('/admin/api/trust?limit=20&section='+encodeURIComponent(section)+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(session!==csrf||generation!==trustGenerations[section])return;const cursors=state.cursors.slice();cursors[index]=cursor||'';trustCursors[section]={index,cursors};renderTrust({...trustView,[section]:result[section],pagination:{...trustView.pagination,...result.pagination}},true);}catch(e){notify('列表读取失败：'+e.message);}}
function renderTrust(trust,preserve=false){
 if(!preserve){trustCursors={};trustGenerations={};}trustView=trust;
 adminRole=trust.role;
 renderItems('trust-users',trust.users||[],(root,x)=>{
  const r=row(root,x.name||'附近的街坊',x.id,`微信：${x.wechatLinked?'已关联':'未关联'}；手机号：${x.phoneVerified?'已验证 '+x.maskedPhone:'未验证'}；身份服务：未开通；内部风险：${x.riskLevel||'normal'}`),actions=cell('div','','actions');
  if(canRole('verifier'))actions.append(button('核验房源或分类授权',async()=>{
   const scope=await adminPrompt('填写适用范围：housing（分类发布资格）、具体分类 ID，或 publication:信息ID（仅本条材料）');if(!scope)return;
   const reference=await adminPrompt('填写实际已核验的外部材料工单编号（字母开头，不含身份证/手机号）');if(!reference)return;
   const reason=await adminPrompt('记录核验过程、授权范围及依据，不填写证件号码');if(!reason)return;const validUntil=await adminPrompt('材料实际有效期，填写 YYYY-MM-DD，不能晚于材料到期时间');if(!validUntil)return;
   const old=(await api('/admin/api/trust/users/'+x.id+'/qualification?scope='+encodeURIComponent(scope))).qualification;
   await process('/admin/api/trust/users/'+x.id+'/qualification',{scope,reference,reason,status:'verified',validUntil,revision:old?.revision||0,manuallyVerified:true},'确认已完成业务材料核验');
  }));
  if(canAdmin('operations'))actions.append(button('调整行为限制',async()=>{
   const level=await adminPrompt('内部等级：normal、suspicious、severe');if(!level)return;
   const reason=await adminPrompt('填写已经核查的事实及处置理由（用户可见、可申诉）');if(!reason)return;
   const confirmed=level==='severe'?await adminConfirm('已人工核实严重违规；限制有效期为7天，并允许申诉。确认？'):false;if(level==='severe'&&!confirmed)return;
   await process('/admin/api/trust/users/'+x.id+'/risk',{level,reason,revision:x.revision||0,until:until(7),confirmed,restrictPublish:level==='severe',restrictContact:level==='severe',removePublished:level==='severe'&&await adminConfirm('是否同时下架该账号已公开信息？')},'记录风险处置');
  }));r.append(actions);
 });
 renderItems('trust-qualifications',trust.qualifications||[],(root,x)=>{const r=row(root,x.scope,x.userId,`${x.status} · 到期 ${x.validUntil}`);if(canRole('verifier')&&x.status==='verified')r.append(button('撤销此项核验',async()=>{const reference=await adminPrompt('材料处理工单编号'),reason=await adminPrompt('撤销原因');if(reference&&reason)await process('/admin/api/trust/users/'+x.userId+'/qualification',{scope:x.scope,reference,reason,status:'revoked',revision:x.revision,validUntil:until(1),manuallyVerified:true},'撤销业务核验');},true));});
 renderItems('trust-risks',trust.risks||[],(root,x)=>{const r=row(root,x.targetType+' · '+x.targetId,x.userId,(x.signals||[]).join(' · ')),actions=cell('div','','actions');if(canAdmin('evidence'))actions.append(button('读取相关材料（记录审计）',async()=>{const evidence=await api('/admin/api/trust/risks/'+x.id+'/evidence');r.append(cell('p',evidence.body||'无可读文字'));for(const id of evidence.imageIds||[]){const img=document.createElement('img');img.src='/admin/api/media/'+id+'?size=thumb';img.className='content-preview';img.alt='需复核的图片';r.append(img);}}));actions.append(button('记录复核结果',async()=>{const reason=await adminPrompt('复核结论：说明实际检查内容和处置');if(!reason)return;await process('/admin/api/trust/risks/'+x.id,{reason},'记录人工复核');}));if(x.targetType==='message')actions.append(button('核实后放行暂缓消息',async()=>{const reason=await adminPrompt('说明实际检查消息内容后的放行依据');if(reason)await process('/admin/api/trust/risks/'+x.id,{reason,releaseMessage:true},'放行消息');}));r.append(actions);});
 renderItems('trust-appeals',trust.appeals||[],(root,x)=>{const r=row(root,x.userId,x.status,x.reason),actions=cell('div','','actions');for(const [status,label]of [['accepted','申诉通过'],['rejected','不予支持']])actions.append(button(label,async()=>{const response=await adminPrompt('实际复核结果及答复');if(response)await process('/admin/api/trust/appeals/'+x.id,{status,response,revision:x.revision},label);}));r.append(actions);});
 renderItems('trust-audit',trust.audit||[],(root,x)=>row(root,x.action,x.userId+' · '+x.actorRole,x.reason));
 for(const section of ['users','qualifications','risks','appeals','audit']){if(['risks','appeals','audit'].includes(section)&&!canAdmin('operations'))continue;const root=el('trust-'+section),meta=trust.pagination?.[section],state=trustCursors[section];if((state?.index||0)>0)root.append(button('上一页',()=>loadTrustPage(section,-1)));if(meta?.hasMore)root.append(button('下一页',()=>loadTrustPage(section,1)));}
}

el('task-kind').addEventListener('change',()=>{taskPage=1;el('task-detail').replaceChildren();loadTasks();});

function closureButton(id,detail){return button('执行账号注销',async()=>{const reason=await adminPrompt('填写本人申请核验依据和执行说明（至少8字，不含敏感号码）');if(!reason)return;await process('/admin/api/privacy-requests/'+id+'/execute-closure',{revision:detail.revision,confirmed:true,reason},'注销账号：撤销登录、手机号、公开内容和联系能力；清理个人资料、草稿与收藏，保留必要账本和审计。此操作无法从后台恢复');},true);}

const ruleNames={publication_approved:'信息首次审核通过',publication_valid_7d:'信息持续有效满7天',publication_valid_30d:'信息持续有效满30天',valid_favorite:'获得有效收藏',accepted_contact:'有效联系被接受'};
async function loadPointsRules(){
 try{
  const data=await api('/admin/api/points/rules');
  renderItems('points-rules',data.items,(root,r)=>{
   const card=row(root,ruleNames[r.code]||r.code,(r.enabled?'已启用':'已关闭')+' · 版本 '+r.revision),fields={};
   for(const [key,label,value] of [['amount','每次积分',r.amount],['dailyLimit','该规则每日上限',r.dailyLimit],['publicationDailyLimit','每条信息每日上限',r.publicationDailyLimit],['settlementHours','观察期（小时）',r.settlementHours]]){const l=cell('label',label),input=document.createElement('input');input.type='number';input.min=key==='settlementHours'?24:0;input.max=key==='settlementHours'?72:20;input.value=value;input.disabled=!canRole('operator');l.append(input);card.append(l);fields[key]=input;}
   if(canRole('operator'))for(const enabled of [true,false])card.append(button(enabled?'保存并启用':'保存并关闭',async()=>{const reason=await adminPrompt('记录规则变更依据（至少8字）；旧事件保留原规则快照');if(!reason)return;const values=Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,Number(input.value)]));await process('/admin/api/points/rules/'+r.code,{...values,enabled,revision:r.revision,reason},enabled?'保存并启用此贡献规则':'保存并关闭新事件采集');}));
  });
 }catch(e){el('points-rules').replaceChildren(cell('p','积分规则读取失败：'+e.message));}
}
