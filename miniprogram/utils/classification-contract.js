'use strict';
const source=require('../data/industry-catalog.js');
const categories=source.categories;
const nodes=new Map(),projects=[];
for(const category of categories){nodes.set(category.id,category);for(const group of category.groups){nodes.set(group.id,group);for(const item of group.items){const project={...item,categoryId:category.id,categoryName:category.name,groupId:group.id,group:group.name,aliases:Array.isArray(item.aliases)?item.aliases:[]};projects.push(project);nodes.set(item.id,project);}}}
function publicationFor(id){
 const project=nodes.get(id),config=project?.publication,policy=source.publicationConfig?.policies[config?.policy];
 if(!project?.groupId||config?.schemaVersion!==1||!policy)return null;
 const forumClosed=require('./product-scope').isForumProject(id);
 const roles=policy.publisherRoles;
 return {
  categoryId:id,schemaVersion:config.schemaVersion,...policy,enabled:config.enabled===true&&!forumClosed,legacyKinds:[...(config.legacyKinds||[])],
  capabilities:{
   exists:true,
   residentPublishingAllowed:config.enabled===true&&!forumClosed,
   merchantRequired:roles.length>0&&roles.every(role=>role==='verified_merchant'),
   qualificationRequired:config.policy.startsWith('LICENSED')||['PROPERTY','PROPERTY_BIZ','JOB','JOB_FILTER','MERCHANT','MERCHANT_SERVICE','EVENT_BIZ'].includes(config.policy),
   bookingAllowed:['MERCHANT_SERVICE','LICENSED_PROVIDER'].includes(config.policy),
   publicDisplayAllowed:!forumClosed,
   publicDisplayCondition:forumClosed?'closed':'content_review_and_applicable_subject_qualification'
  }
 };
}
function kindsFor(id){const config=publicationFor(id);return config?.enabled?config.legacyKinds:[];}
function validateReference(id,version,kind){return typeof id==='string'&&version===source.version&&kindsFor(id).includes(kind);}
module.exports={source,categories,projects,find:id=>nodes.get(id),publicationFor,kindsFor,validateReference};
