'use strict';
function publicationReviewFields(root,rule) {
 const inputs = {};
 if(rule)root.append(cell('h4',rule.name));
 for(const check of rule?.checks||[]){
  const label = cell('label',check.label,'publication-review-check');
  const input = document.createElement('input');
  input.type = 'checkbox';
  label.prepend(input);root.append(label);inputs[check.key] = input;
 }
 return () => Object.fromEntries(Object.entries(inputs).map(([key,input]) => [key,input.checked]));
}

function publicationRecordsButton(root,id) {
 root.append(button('查看发布确认与处理记录',async()=>{
  const records = await api('/admin/api/publication-records/'+encodeURIComponent(id));
  renderPublicationRecords(root,records);
 }));
}

function renderPublicationRecords(root,records) {
 const panel = cell('details','','publication-records');panel.open = true;
 panel.append(cell('summary','发布确认与审核档案'));
 panel.append(cell('p','信息 ID '+records.item.id+' · 当前状态 '+records.item.status));
 panel.append(cell('p','用户确认记录用于留存承诺，平台仍须独立核查内容、主体资质和风险。','muted'));
 if(records.legacy)panel.append(cell('p',records.source?'发布须知确认随原业务留存，可读取来源档案。':'历史内容的须知确认情况待核实。'));
 if(records.source){panel.append(cell('p','来源业务 '+records.source.entryId+' · 连接时版本 '+records.source.revision));publicationRecordsButton(panel,records.source.entryId);}
 for(const record of records.confirmations){
  const block = cell('details');
  block.append(cell('summary','版本 '+record.revision+' · '+record.noticeVersion+' · '+record.confirmedAt));
  block.append(cell('p','用户 ID '+record.userId+' · 确认编号 '+record.id));
  block.append(cell('p','须知摘要 '+record.noticeHash+' · 内容摘要 '+record.contentHash,'muted'));
  const notice = cell('details');notice.append(cell('summary','确认时的须知原文'),cell('pre',record.noticeContent));block.append(notice);
  block.append(cell('h4','确认时的发布内容'),cell('pre',JSON.stringify(record.content,null,2)));
  block.append(cell('p',record.reviewRule?.name+' · '+record.reviewRule?.version));panel.append(block);
 }
 for(const [label,items] of [['展示及审核状态',records.history],['审核操作记录',records.audit],['举报与后续处理',records.reports],['关联账号处置记录',records.accountActions]]){
  const group=cell('details');group.append(cell('summary',label+' · '+items.length));
  for(const item of items)group.append(cell('pre',JSON.stringify(item,null,2)));
  panel.append(group);
 }
 root.append(panel);
}

document.getElementById('publication-record-search').addEventListener('submit',async event=>{
 event.preventDefault();const root=document.getElementById('publication-record-result');
 const id=document.getElementById('publication-record-id').value.trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)){root.replaceChildren(cell('p','请输入完整的信息 ID'));return;}
 root.replaceChildren(cell('p','正在读取发布档案…'));
 try{const records=await api('/admin/api/publication-records/'+encodeURIComponent(id));root.replaceChildren();renderPublicationRecords(root,records);}
 catch(error){root.replaceChildren(cell('p',error.message));}
});
