'use strict';
const catalog=require('./classification-contract');
const f=(key,label,type='text',required=true,extra={})=>({key,label,type,required,...extra});
const definitions={
 PROPERTY:{title:'房源发布',channel:'housing',credential:true,response:'service',fields:[f('subject','发布主体'),f('relationship','与房源的关系','select',true,{options:['产权人','已获授权发布者','经核验经纪机构']}),f('intent','发布目的','select',true,{options:['出售','出租','求购','求租']}),f('location','公开区域或小区（不填门牌）'),f('area','面积（㎡）','decimal'),f('rights','权属、用途与交易限制说明')]},
 COMMUNITY:{title:'实用信息',channel:'public',response:'service',fields:[f('topic','信息主题'),f('scope','适用范围与公开区域'),f('conditions','参与条件、物品权属或领养要求'),f('noFundraising','不收取募捐、押金或预付款，不发布个人隐私','confirm')]},
 MERCHANT:{title:'商家信息',channel:'merchant',credential:true,response:'service',fields:[f('subject','经营主体'),f('address','公开经营地址'),f('hours','营业时间'),f('scope','实际经营范围')]},
 MERCHANT_SERVICE:{title:'服务供给',channel:'service',credential:true,response:'service',fields:[f('subject','服务主体'),f('serviceArea','服务范围'),f('priceTerms','计价方式及费用说明'),f('cancellation','取消与售后说明')]},
 PROPERTY_BIZ:{title:'房产业务机构',channel:'merchant',credential:true,response:'service',fields:[f('subject','机构主体'),f('address','公开办公地址'),f('scope','授权经营范围'),f('feeTerms','收费及退款说明')]},
 JOB:{title:'企业招聘',channel:'job',credential:true,response:'job',fields:[f('subject','招聘企业'),f('workplace','工作地点'),f('salaryMin','月薪下限（元）','number'),f('salaryMax','月薪上限（元）','number'),f('employment','用工形式','select',true,{options:['全职','兼职','临时','实习','远程']}),f('duties','岗位职责'),f('requirements','任职要求'),f('hours','工时与休息安排'),f('benefits','福利及社保说明'),f('noFees','承诺不收取押金、培训贷或招聘费','confirm')]},
 EVENT:{title:'活动发布',channel:'event',response:'event',fields:[f('organizer','组织者'),f('venue','公开活动场所'),f('startsAt','活动开始','datetime'),f('endsAt','活动结束','datetime'),f('capacity','报名人数上限','number'),f('safety','安全安排与适合人群'),f('cancellation','取消与退出规则'),f('free','本活动免费，不收报名费或预付款','confirm')]},
 EVENT_BIZ:{title:'机构活动',channel:'event',credential:true,response:'event',fields:[]},
 CURATED_INFO:{title:'资讯线索',channel:'public',source:true,editorial:true,fields:[f('sourceName','原始来源名称'),f('sourceUrl','原始来源HTTPS地址','url'),f('sourceDate','来源日期','date'),f('body','资讯正文','textarea'),f('scope','适用范围和更新说明')]},
 OFFICIAL_DIRECTORY:{title:'官方指引线索',channel:'public',source:true,editorial:true,fields:[]},
 LICENSED_PROVIDER:{title:'专项服务机构',channel:'service',credential:true,response:'service',fields:[f('subject','持证服务主体'),f('address','公开经营地址'),f('scope','获准服务范围'),f('priceTerms','公开收费与退款说明'),f('exclusions','不承接的业务与服务限制')]},
 LICENSED_DIRECTORY:{title:'持牌机构目录',channel:'merchant',credential:true,source:true,directory:true,fields:[f('subject','持牌机构名称'),f('address','公开机构地址'),f('scope','核准业务范围'),f('sourceName','主管部门或机构官方来源'),f('sourceUrl','官方公示HTTPS地址','url'),f('sourceDate','公示日期','date')]}
};
definitions.JOB_FILTER={...definitions.JOB,title:'招聘岗位（按用工形式筛选）'};
definitions.EVENT_BIZ.fields=[f('subject','机构主体'),...definitions.EVENT.fields];
definitions.OFFICIAL_DIRECTORY.fields=[...definitions.CURATED_INFO.fields];
function workflow(id){if(require('./product-scope').isForumProject(id))return null;const p=catalog.find(id),d=definitions[p?.publication?.policy];return d?{...d,bookable:['MERCHANT_SERVICE','LICENSED_PROVIDER'].includes(p.publication.policy),projectId:id,projectName:p.name,policy:p.publication.policy,fields:d.fields.map(x=>({...x,...(p.publication.policy==='JOB_FILTER'&&x.key==='employment'?{options:[({'全职岗位':'全职','兼职岗位':'兼职','临时用工':'临时','实习校招':'实习','远程岗位':'远程'})[p.name]]}:{}),...(p.publication.policy==='PROPERTY'&&p.name==='二手住宅'&&x.key==='intent'?{options:['出售','求购']}: {})})),notice:d.editorial?'提交的是来源线索，审核确认后以平台整理指引展示。非政府官方平台，不代办、收费或索取办事资料。':d.directory?'仅展示经核验的机构与公开服务范围，不提供诊疗、处方、金融产品交易或个体投资建议。':d.response==='job'?'只接收岗位申请说明，不收身份证、银行卡、简历附件或求职费用。':d.response==='event'?'当前支持免费活动报名，不收取预付款；组织者须提供安全与取消说明。':d.credential?'须先完成本项目主体、授权和必要专项资质核验，再审核公开内容。':'提交后需审核，公开前可修改或撤回。'}:null;}
function readiness(id){const d=workflow(id);return d?{canStart:true,route:'industry',label:d.editorial?'提交来源线索':d.policy==='PROPERTY'?'房源发布 / 核验':d.credential?'机构发布 / 核验':d.response==='event'?'发布活动':'发布互助',reason:d.notice,kinds:[],policy:d.policy}:null;}
module.exports={workflow,readiness,definitions};
