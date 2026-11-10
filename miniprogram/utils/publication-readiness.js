'use strict';
const registry=require('./classification-contract');
const reasons={MERCHANT:'此项目属于商家经营信息，须完成主体、行业资质和商家模板接入后开放。',MERCHANT_SERVICE:'此项目由核验后的服务方提供，尚未接通对应服务模板。',PROPERTY_BIZ:'房产业务机构须另行核验主体与经营范围，尚未开放。',JOB:'招聘主体、岗位审核和隐私流程尚未开放。',JOB_FILTER:'该项属于用工形式筛选，招聘发布流程尚未开放。',EVENT:'活动报名、取消与安全说明模板尚未接通。',EVENT_BIZ:'机构活动须核验组织者，报名与审核模板尚未接通。',CURATED_INFO:'此项目属于平台编辑资讯，须核实来源后由运营发布。',OFFICIAL_DIRECTORY:'此项目只适合官方来源的查询与指引，不接受个人代办发布。',LICENSED_PROVIDER:'此项目须核验专项执业资格，当前不接受个人发布。',LICENSED_DIRECTORY:'此项目须核验持牌机构及来源，当前不接受个人发布。'};
function state(id,categories,features={}){
 const config=registry.publicationFor(id),kinds=registry.kindsFor(id),policy=registry.find(id)?.publication?.policy;
 if(!kinds.length&&features.industryWorkflows){const module=require('./industry-workflows'),w=module.readiness(id),definition=module.workflow(id);if(w){if(categories?.some(c=>c.id===(definition.policy==='COMMUNITY'?'community':definition.channel)&&['merchant','service','housing','community'].includes(c.id)&&!c.enabled))return {...w,canStart:false,label:'暂停发布',reason:'该业务分类已暂停新提交，已有业务记录仍可查询。'};return features.publishingApproved===false?{...w,canStart:false,label:'发布未开放',reason:'平台发布资格尚未确认，可先保存业务资料。'}:w;}}
 if(!kinds.length)return {canStart:false,label:policy?.startsWith('LICENSED')?'待资质接入':policy==='CURATED_INFO'||policy==='OFFICIAL_DIRECTORY'?'平台指引':'暂未开放',reason:reasons[policy]||'此项目的业务模板、审核规则或准入条件尚未接通。',kinds:[]};
 const enabled=categories===undefined?kinds:kinds.filter(kind=>(categories||[]).some(c=>c.id===kind&&c.enabled&&!c.restricted));
 if(!enabled.length)return {canStart:false,label:'暂停发布',reason:'此项目对应的业务分类当前已暂停新发布，历史记录可在我的发布中查看。',kinds:[]};
 if(features.publishingApproved===false)return {canStart:false,label:'暂未开放',reason:'当前平台尚未开放真实发布，请等待开放通知。',kinds:[]};
 return {canStart:true,label:enabled.includes('service')?'发布需求':enabled.includes('housing')?'需材料核验':'可发布',reason:enabled.includes('service')?'这里发布的是寻找服务的需求，不是商家提供的可预约服务。':enabled.includes('housing')?'发布房源须完成对应材料核验，提交后仍需审核。':'填写并提交后进入审核，通过后才会公开。',kinds:enabled,policy:config.reviewPolicy};
}
function decorate(items,categories,features){return items.map(item=>({...item,readiness:state(item.id,categories,features)}));}
module.exports={state,decorate};
