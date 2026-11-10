'use strict';
let homePage=1,homeReportPage=1,homeAdvertiserPage=1,homeGeneration=0;
const homeKinds={news:'同城资讯',banner:'平台轮播',ad:'广告轮播'};
function homeField(root,label,key,value='',type='text'){
 const wrapper=cell('label',label),input=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');input.name=key;
 if(!['textarea','select'].includes(type))input.type=type;
 if(type!=='select')input.value=value??'';
 wrapper.append(input);root.append(wrapper);return input;
}
function homePager(id,page,total,change){const root=el(id);root.replaceChildren(cell('span','第 '+page+' 页'+(total===null?'':' · 共 '+total+' 条')));if(page>1)root.append(button('上一页',()=>change(page-1)));if(total===null||page*20<total)root.append(button('下一页',()=>change(page+1)));}
function homeEditor(entry,cities){
 const root=el('home-editor');root.replaceChildren();if(!canRole('operator')){root.append(cell('p','业务核验角色可查看内容；创建和发布需运营角色。','muted'));return;}
 const form=document.createElement('form');form.className='home-editor-grid';const fields={};
 const kind=fields.kind=homeField(form,'内容类型','kind','','select');for(const [value,name]of Object.entries(homeKinds)){const option=cell('option',name);option.value=value;kind.append(option);}kind.value=entry?.kind||'news';
 const city=fields.cityCode=homeField(form,'浏览城市（资讯可选全平台）','cityCode','','select');for(const c of [{code:'',name:'全平台通用'},...cities]){const option=cell('option',c.name+' '+c.code);option.value=c.code;city.append(option);}city.value=entry?.cityCode||'';
 for(const [key,label,type]of [['title','标题（2–80字）','text'],['summary','摘要（最多240字）','textarea'],['body','资讯正文（最多8000字）','textarea'],['sourceName','资讯原始来源名称','text'],['sourceUrl','资讯原始来源HTTPS链接','url'],['targetId','轮播关联的公开信息ID','text'],['imageId','轮播图片ID（须属于关联信息）','text'],['advertiserId','广告主档案ID（广告必填）','text'],['priority','展示排序（0–100，数字越大越靠前）','number'],['startsAt','排期开始','datetime-local'],['endsAt','排期结束','datetime-local']])fields[key]=homeField(form,label,key,entry?.[key]||'',type);
 for(const key of ['startsAt','endsAt']){const time=entry?.[key]?Date.parse(entry[key]):Date.now()+(key==='endsAt'?7*86400000:0);fields[key].value=new Date(time-new Date(time).getTimezoneOffset()*60000).toISOString().slice(0,16);}
 fields.priority.value=entry?.priority||0;fields.priority.min=0;fields.priority.max=100;fields.title.maxLength=80;fields.summary.maxLength=240;fields.body.maxLength=8000;
 const references=document.createElement('details');references.className='home-references';references.append(cell('summary','查看或手动填写关联编号'));for(const key of ['targetId','imageId','advertiserId'])references.append(fields[key].parentElement);form.append(references);
 const picker=document.createElement('div');picker.className='home-target-picker';const search=homeField(picker,'搜索已审核公开信息','targetSearch');search.maxLength=80;const target=homeField(picker,'选择轮播落地信息','targetChoice','','select'),image=homeField(picker,'选择该信息已审核的图片','imageChoice','','select'),advertiser=homeField(picker,'选择该发布者有效的广告主体','advertiserChoice','','select'),note=cell('p','','muted'),preview=document.createElement('img');preview.className='content-preview';preview.alt='轮播图片预览';preview.hidden=true;
 const nav=cell('div','','actions');let candidates=[],targetPage=1,targetVersion=0;
 const option=(select,value,label)=>{const node=cell('option',label);node.value=value;select.append(node);};
 function chooseImage(){fields.imageId.value=image.value;preview.hidden=!image.value;if(image.value)preview.src='/admin/api/media/'+encodeURIComponent(image.value);}
 function chooseAdvertiser(){fields.advertiserId.value=advertiser.value;}
 function choices(keep){const item=candidates.find(x=>x.id===target.value);image.replaceChildren();advertiser.replaceChildren();option(image,'','请选择已审核图片');option(advertiser,'','请选择有效广告主体');if(!item){if(!keep)for(const key of ['targetId','imageId','advertiserId'])fields[key].value='';preview.hidden=true;return;}if(!keep){fields.targetId.value=item.id;fields.imageId.value='';fields.advertiserId.value='';}for(const id of item.image_ids||[])option(image,id,'图片 '+((item.image_ids||[]).indexOf(id)+1)+' · '+id.slice(-8));for(const a of item.advertisers||[])option(advertiser,a.id,a.name);image.value=fields.imageId.value;advertiser.value=fields.advertiserId.value;if(!keep&&item.image_ids?.length===1)image.value=item.image_ids[0];if(!keep&&item.advertisers?.length===1)advertiser.value=item.advertisers[0].id;chooseImage();chooseAdvertiser();note.textContent=!(item.image_ids||[]).length?'此信息没有已审核图片，不能用于广告。':kind.value==='ad'&&!(item.advertisers||[]).length?'该发布者没有有效广告主体，请先完成主体核验。':'选择后仍须逐项核对原图、正文和广告证明。';}
 async function loadTargets(page=1){const version=++targetVersion;note.textContent='正在读取已审核信息…';try{const data=await api('/admin/api/home-targets?cityCode='+encodeURIComponent(city.value)+'&q='+encodeURIComponent(search.value)+'&page='+page);if(version!==targetVersion||!form.isConnected)return;candidates=data.items;targetPage=page;target.replaceChildren();option(target,'','请选择已审核公开信息');for(const item of candidates)option(target,item.id,item.title+' · '+item.district+' · '+item.id.slice(-8));target.value=fields.targetId.value;choices(true);nav.replaceChildren();if(page>1)nav.append(button('上一页信息',()=>loadTargets(targetPage-1)));if(data.hasMore)nav.append(button('下一页信息',()=>loadTargets(targetPage+1)));note.textContent=candidates.length?'仅列出当前城市有效的公开信息，选择后核对原图与证明。':'没有符合条件的已审核信息，请更换关键词或城市。';}catch(error){if(version===targetVersion)note.textContent='读取失败：'+error.message;}}
 target.addEventListener('change',()=>choices(false));image.addEventListener('change',chooseImage);advertiser.addEventListener('change',chooseAdvertiser);picker.append(button('查询已审核信息',()=>loadTargets()),note,preview,nav);form.append(picker);
 const sync=()=>{for(const key of ['body','sourceName','sourceUrl'])fields[key].parentElement.hidden=kind.value!=='news';for(const key of ['targetId','imageId'])fields[key].parentElement.hidden=kind.value==='news';fields.advertiserId.parentElement.hidden=kind.value!=='ad';references.hidden=picker.hidden=kind.value==='news';advertiser.parentElement.hidden=kind.value!=='ad';if(kind.value!=='news')loadTargets();};kind.addEventListener('change',sync);city.addEventListener('change',()=>{if(kind.value!=='news'){for(const key of ['targetId','imageId','advertiserId'])fields[key].value='';loadTargets();}});sync();
 const save=cell('button',entry?'保存修改并重新审核':'保存新草稿');save.type='submit';form.append(save);form.append(button('清空编辑器',async()=>homeEditor(null,cities)));form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{
  const v=Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value]));v.priority=Number(v.priority);v.startsAt=new Date(v.startsAt).toISOString();v.endsAt=new Date(v.endsAt).toISOString();
  if(v.kind==='news'){v.targetId=null;v.imageId=null;v.advertiserId=null;}else{v.body='';v.sourceName='';v.sourceUrl='';if(v.kind!=='ad')v.advertiserId=null;}
  if(entry)v.revision=entry.revision;
  await api('/admin/api/home-content'+(entry?'/'+entry.id:''),entry?'PUT':'POST',v);notify('草稿已保存，尚未公开。');await loadHomeConsole();
 }catch(error){notify(error.message);}finally{save.disabled=false;}});root.append(form);
}
async function loadHomeConsole(){
 const generation=++homeGeneration;try{
  const [data,reports,advertisers,cities]=await Promise.all([api('/admin/api/home-content?page='+homePage),api('/admin/api/home-reports?page='+homeReportPage),api('/admin/api/home-advertisers?page='+homeAdvertiserPage),api('/admin/api/home-cities')]);if(generation!==homeGeneration)return;
  homeEditor(null,cities.items||[]);
  renderItems('home-content-list',data.items,(root,entry)=>{
   const card=row(root,homeKinds[entry.kind]+' · '+entry.title,entry.id+' · '+entry.status+' · 版本 '+entry.revision,entry.startsAt+' 至 '+entry.endsAt+' · '+(entry.sourceName||entry.summary||''));
   if(!canRole('operator'))return;
   card.append(button('编辑草稿',()=>{homeEditor(entry,cities.items);el('home-editor').scrollIntoView({block:'start',behavior:'auto'});}));
   const checks={};for(const [key,label]of [['textReviewed','已核查正文及内容规则'],['imagesReviewed','已检查原始图片和使用权'],['sourceReviewed','已核查资讯来源、日期与引用范围'],['advertisingReviewed','已核查本条广告内容与证明']]){const labelNode=cell('label',label),input=document.createElement('input');input.type='checkbox';labelNode.prepend(input);card.append(labelNode);checks[key]=input;}
   card.append(button('核查后发布',async()=>{const reason=prompt('填写实际审核依据（至少8字，不含敏感证件号）');if(!reason)return;await api('/admin/api/home-content/'+entry.id+'/review','POST',{revision:entry.revision,status:'published',reason,...Object.fromEntries(Object.entries(checks).map(([key,input])=>[key,input.checked]))});notify('内容已审核，按排期展示。');await loadHomeConsole();}));
   card.append(button('立即停止展示',async()=>{const reason=prompt('填写停止展示的原因（至少8字）');if(!reason)return;await api('/admin/api/home-content/'+entry.id+'/review','POST',{revision:entry.revision,status:'disabled',reason});await loadHomeConsole();},true));
  });
  homePager('home-content-pages',homePage,data.total,page=>{homePage=page;return loadHomeConsole();});
  renderItems('home-report-list',reports.items,(root,report)=>{const card=row(root,report.title,report.id+' · '+report.status,report.reason);if(report.response)card.append(cell('p',report.response));if(canRole('operator')&&report.status==='pending')for(const status of ['resolved','rejected'])card.append(button(status==='resolved'?'记录已处理答复':'记录不予处理说明',async()=>{const response=prompt('先完成核查或下架，再填写实际处理范围和用户答复（至少8字）');if(response){await api('/admin/api/home-reports/'+report.id,'POST',{revision:report.revision,status,response});await loadHomeConsole();}}));});
  homePager('home-report-pages',homeReportPage,reports.total,page=>{homeReportPage=page;return loadHomeConsole();});
  const advertiserRoot=el('home-advertiser-editor');advertiserRoot.replaceChildren();if(canRole('operator'))advertiserRoot.append(button('创建待核验广告主档案',async()=>{const userId=prompt('广告主本人账号ID'),name=prompt('主体名称'),reference=prompt('实际材料工单引用（不填证件号）');if(userId&&name&&reference){await api('/admin/api/home-advertisers','POST',{userId,name,reference});await loadHomeConsole();}}));
  renderItems('home-advertiser-list',advertisers.items,(root,a)=>{const card=row(root,a.name,a.id+' · '+a.status+' · 账号 '+a.user_id,'材料引用 '+a.evidence_reference+' · 核验到期 '+(a.valid_until||'尚未核验'));if(canRole('verifier'))for(const status of ['verified','revoked'])card.append(button(status==='verified'?'完成主体核验':'撤销主体核验',async()=>{const reason=prompt('填写实际核查依据（至少8字）'),validUntil=prompt('材料真实有效期 YYYY-MM-DD');if(reason&&validUntil&&confirm('已实际核验主体与材料，确认记录本次结果？')){await api('/admin/api/home-advertisers/'+a.id,'POST',{revision:a.revision,status,reason,validUntil,manuallyVerified:true});await loadHomeConsole();}},status==='revoked'));});
  homePager('home-advertiser-pages',homeAdvertiserPage,advertisers.items.length===20?null:(homeAdvertiserPage-1)*20+advertisers.items.length,page=>{homeAdvertiserPage=page;return loadHomeConsole();});
 }catch(error){el('home-content-list').replaceChildren(cell('p','首页管理读取失败：'+error.message));}
}
if(!el('dashboard').hidden)loadHomeConsole();
function renderHomeTask(root,kind,id,d){
 if(kind==='homecontent'){
  root.append(cell('p',homeKinds[d.kind]+' · '+(d.cityCode||'全平台')+' · '+d.startsAt+' 至 '+d.endsAt));root.append(cell('p',d.summary));root.append(cell('p',d.body));if(d.sourceUrl){const link=cell('a','打开原始来源：'+d.sourceName);link.href=d.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';root.append(link);}if(d.imageId){const image=document.createElement('img');image.src='/admin/api/media/'+d.imageId;image.alt='待核查原始图片';image.className='content-preview';root.append(image);}
  if(!canRole('operator'))return;
  const checks={};for(const [key,label]of [['textReviewed','已核查正文与业务规则'],['imagesReviewed','已核查原图与使用权'],['sourceReviewed','已核查原始来源和日期'],['advertisingReviewed','已核查本条广告证明']]){const wrapper=cell('label',label),input=document.createElement('input');input.type='checkbox';wrapper.prepend(input);root.append(wrapper);checks[key]=input;}
  root.append(button('核查后发布首页内容',async()=>{const reason=prompt('实际审核依据（至少8字）');if(!reason)return;await api('/admin/api/home-content/'+id+'/review','POST',{status:'published',revision:d.revision,reason,...Object.fromEntries(Object.entries(checks).map(([key,input])=>[key,input.checked]))});root.replaceChildren();await reload();}));
 }else{
  root.append(cell('p',d.title+' · '+d.contentStatus));
  if(!canRole('operator'))return;
  root.append(button('先停止相关首页内容',async()=>{const reason=prompt('已核实的停止展示原因（至少8字）');if(!reason)return;await api('/admin/api/home-content/'+d.contentId+'/review','POST',{status:'disabled',revision:d.contentRevision,reason});await openTask(kind,id);await loadHomeConsole();},true));
  for(const status of ['resolved','rejected'])root.append(button(status==='resolved'?'记录已处理答复':'记录不予处理说明',async()=>{const response=prompt('填写实际处理范围和用户答复（至少8字）');if(!response)return;await api('/admin/api/home-reports/'+id,'POST',{status,revision:d.revision,response});root.replaceChildren();await reload();}));
 }
}
