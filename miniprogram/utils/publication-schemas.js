'use strict';
// Version 1 describes the four existing resident forms. Future business families stay closed.
const schemas={
 used:{businessCode:'GOODS',version:1,fields:[{key:'condition',label:'物品成色',type:'select',options:['全新','几乎全新','正常使用','需维修'],placeholder:'请选择成色'},{key:'itemCategory',type:'text',render:false}]},
 housing:{businessCode:'PROPERTY',version:1,fields:[{key:'intent',label:'发布类型',type:'select',options:['出租','求租'],placeholder:'请选择出租或求租'},{key:'area',label:'面积（㎡）',type:'number',inputType:'digit',placeholder:'填写面积'},{key:'layout',label:'户型',type:'text',placeholder:'如两室一厅'}]},
 community:{businessCode:'PUBLIC',version:1,fields:[{key:'topic',label:'话题（选填）',type:'text',maxLength:40,placeholder:'如邻里互助、周末生活'}]},
 service:{businessCode:'SERVICE',version:1,fields:[{key:'serviceType',type:'text',render:false},{key:'expectedDate',label:'期望日期（选填）',type:'date',placeholder:'选择日期'}],notice:'这里发布的是服务需求，可预约的商家服务请到发现页查看。'}
};
function get(kind){return Object.hasOwnProperty.call(schemas,kind)?schemas[kind]:null;}
// Versions 1/2 remain readable/editable. New forms use version 3 with optional phone metadata.
function keys(kind){return [...(get(kind)?.fields||[]).map(x=>x.key),...(kind==='used'?['brand','model']:[]),...(['used','housing','service'].includes(kind)?['priceMode']:[])];}
function fieldsFor(kind,attributes={}){const fields=(get(kind)?.fields||[]).filter(x=>x.render!==false).map(x=>['2','3'].includes(attributes.templateVersion)&&['condition','intent','area','layout'].includes(x.key)?{...x,label:x.label+' *'}:x);return kind==='used'&&attributes.categoryId==='C04G01S01'&&attributes.templateVersion!=='3'?[{key:'brand',label:'品牌 *',type:'text',placeholder:'如 Apple、华为、小米'},{key:'model',label:'型号 *',type:'text',placeholder:'如 iPhone 15 Pro 256G'},...fields]:fields;}
function versionMatches(kind,attributes){const schema=get(kind);return !attributes.templateCode&&!attributes.templateVersion||!!schema&&attributes.templateCode===schema.businessCode&&['1','2','3'].includes(attributes.templateVersion);}
function formError(kind,value,{enforceCurrent=false}={}){
 const a=value.attributes||{};
 if((value.title||'').trim().length<4)return '标题至少填写4个字。';
 if((value.detail||'').trim().length<10)return '详细描述至少填写10个字。';
 if(!enforceCurrent&&!['2','3'].includes(a.templateVersion))return '';
 if(!a.cityCode||!a.districtCode)return '请选择这条信息所属的城市与区县或镇街。';
 if(kind!=='community'){
  if(!['amount','negotiable'].includes(a.priceMode))return '请选择填写金额或面议。';
  if(a.priceMode==='amount'&&!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value.price||''))return '请填写有效金额，最多保留两位小数。';
  if(a.priceMode==='negotiable'&&value.price!=='面议')return '面议状态与金额不一致，请重新选择。';
 }
 if(kind==='used'){
  if(!schemas.used.fields[0].options.includes(a.condition))return '请选择物品成色。';
  if(!(value.imageIds||[]).length)return '请至少添加一张物品照片。';
  if(a.templateVersion==='2'&&a.categoryId==='C04G01S01'&&(!a.brand?.trim()||!a.model?.trim()))return '请填写手机品牌和型号。';
 }
 if(kind==='housing'){
  if(!['出租','求租'].includes(a.intent))return '请选择出租或求租。';
  if(!/^\d{1,5}(\.\d{1,2})?$/.test(a.area||'')||Number(a.area)<=0)return '请填写有效面积。';
  if(!a.layout?.trim())return '请填写户型。';
 }
 return '';
}
module.exports={get,keys,fieldsFor,formError,versionMatches,formVersion:3,kinds:Object.freeze(Object.keys(schemas))};
