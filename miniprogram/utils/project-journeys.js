'use strict';
const catalog=require('./classification-contract'),workflows=require('./industry-workflows');
const names={job:'岗位申请与面谈',event:'活动报名与参与',service:'服务咨询与约定',housing:'房源沟通与交接',exchange:'物品协商与交接',merchant:'机构咨询与处理',information:'来源维护与纠错'};
function journey(id){
 const p=catalog.find(id);if(!p?.groupId)return null;
 if(require('./product-scope').isForumProject(id))return {projectId:id,name:p.name,industry:p.categoryName,group:p.group,bookable:false,route:'closed',kind:'information',informationOnly:true,steps:['closed','owned_records'],title:'论坛型发布已关闭'};
 const legacy=catalog.kindsFor(id),w=legacy.length?null:workflows.workflow(id);if(!legacy.length&&!w)return null;
 const information=!!(w?.editorial||w?.directory||!w?.response&&!legacy.length),kind=information?'information':w?.response==='job'?'job':w?.response==='event'?'event':w?.channel==='housing'||legacy.includes('housing')?'housing':legacy.includes('used')?'exchange':w?.channel==='merchant'?'merchant':'service';
 const steps=information?['draft','source_review','published','feed_search_detail','correction','operator_reply','revision_review','closed','owned_records']:['draft','qualification_if_required','submitted','reviewed','published','feed_search_detail','private_application','accepted_contact','business_record','mutual_schedule','completion_request','completion_confirmation','cancellation','dispute_resolution','closed','owned_records'];
 if(w?.bookable)steps.push('merchant_verified','service_linked','service_reviewed','slot_booking','booking_confirmation','booking_case_completion','booking_cancellation','service_withdrawn');
 return {bookable:!!w?.bookable,projectId:p.id,name:p.name,industry:p.categoryName,group:p.group,route:legacy.length?'resident':'industry',legacyKinds:legacy,policy:p.publication.policy,kind,title:names[kind],informationOnly:information,credential:!!w?.credential,sourceReview:!!w?.source,steps:steps.map(x=>kind==='event'&&x==='mutual_schedule'?'accepted_event_schedule':x),publicScope:information?'公开来源与机构信息':'审核后的公开信息；申请与处理记录仅双方可见',boundary:information?'不承接目录之外的诊疗、金融交易或官方代办':'信息交流与预约意向记录，具体事项由参与人自行协商'};
}
module.exports={journey,names};
