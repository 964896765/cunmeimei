'use strict';
const {ApiError,text,uuid}=require('./rules'),policy=require('./trust-policy');
const fail=(code,message,status=400)=>{throw new ApiError(status,code,message);};
async function trustRoutes({req,res,p,m,url,repo,user,admin,body,json,phoneVerifier,phoneConfigured,smsConfigured=false}){
 if(p==='/api/v1/me/trust'&&m==='GET'){const uid=await user(req);return json(res,200,{...await repo.trustStatus(uid),phoneProviderAvailable:phoneConfigured,smsAvailable:smsConfigured,identityMode:'unavailable_pending_compliant_provider'}),true;}
 if(p==='/api/v1/me/trust/request'&&m==='POST'){await repo.requestIdentity(await user(req));return json(res,200,{ok:true}),true;}
 if(p==='/api/v1/me/phone'&&m==='DELETE'){await repo.revokePhone(await user(req));return json(res,200,{ok:true}),true;}
 if(p==='/api/v1/me/phone/wechat'&&m==='POST'){const uid=await user(req),v=await body(req);if(!phoneConfigured)fail('PHONE_PROVIDER_NOT_READY','微信手机号验证尚未配置',503);if(!await repo.hasWechatIdentity(uid))fail('WECHAT_IDENTITY_REQUIRED','需要微信登录身份',403);const number=await phoneVerifier(text(v.code,512,4));await repo.verifyPhone(uid,number,'wechat_phone','wechat-phone-api');return json(res,200,{ok:true}),true;}
 if(p==='/api/v1/me/trust/appeals'&&m==='POST'){const uid=await user(req),v=await body(req);if(!uuid(v.actionId))fail('INVALID_ACTION','处置编号无效');return json(res,201,{appeal:await repo.appeal(uid,v.actionId,v.reason)}),true;}
 if(/^\/api\/v1\/me\/publications\/[0-9a-f-]{36}\/contact-settings$/i.test(p)&&['GET','PUT'].includes(m)){const uid=await user(req);return json(res,200,m==='GET'?await repo.ownContactSettings(uid,p.split('/')[5]):await repo.saveContactSettings(uid,p.split('/')[5],await body(req))),true;}
 if(/^\/api\/v1\/items\/[0-9a-f-]{36}\/phone$/i.test(p)&&m==='POST'){const uid=await user(req);const phone=await repo.accessPhone(uid,p.split('/')[4]);return json(res,200,{phone}),true;}
 if(/^\/api\/v1\/me\/chats\/[0-9a-f-]{36}(\/messages|\/end|\/block)?$/i.test(p)){
  const uid=await user(req),id=p.split('/')[5],action=p.split('/')[6];if(!uuid(id))fail('INVALID_ID','会话标识无效');
  if(m==='GET'&&!action){let before=url.searchParams.get('before');if(before&&!Number.isFinite(Date.parse(before)))fail('INVALID_DATE','时间无效');return json(res,200,await repo.chat(uid,id,before,require('./cursor-page').decode(url.searchParams.get('cursor')))),true;}
  if(m==='POST'&&action==='messages'){const v=await body(req);if(!/^[A-Za-z0-9_-]{16,64}$/.test(v.clientKey||''))fail('INVALID_REQUEST_KEY','消息标识无效');return json(res,201,{message:await repo.sendChat(uid,id,text(v.body,1000,1),v.clientKey)}),true;}
  if(m==='POST'&&action==='end'){if(!await repo.endChat(uid,id))fail('CHAT_UNAVAILABLE','会话不可用',404);return json(res,200,{ok:true}),true;}
  if(m==='POST'&&action==='block'){if(!await repo.blockContact(uid,id,true))fail('CHAT_UNAVAILABLE','会话不可用',404);return json(res,200,{ok:true}),true;}
 }
 if(p==='/admin/api/trust/classification'&&m==='GET'){admin(req);const catalog=require('../../miniprogram/utils/classification-contract');return json(res,200,{version:catalog.source.version,items:catalog.projects.map(x=>({id:x.id,name:x.name,categoryName:x.categoryName,group:x.group,publication:catalog.publicationFor(x.id),workflow:require('../../miniprogram/utils/industry-workflows').workflow(x.id)}))}),true;}
 if(p==='/admin/api/trust'&&m==='GET'){
  const s=admin(req),paged=url.searchParams.has('limit')||url.searchParams.has('cursor'),section=url.searchParams.get('section')||'';if(section&&['risks','appeals','audit'].includes(section)&&!s.permissions.includes('operations'))fail('ADMIN_FORBIDDEN','没有读取此管理列表的权限',403);if(paged&&!repo.trustPages)fail('PAGING_UNAVAILABLE','当前存储模式不支持此列表分页',503);const dashboard=paged?await repo.trustPages(require('./cursor-page').options(url),section):await repo.trustDashboard();
  if(!s.permissions.includes('operations')){
   dashboard.users=dashboard.users.map(({riskLevel,riskUntil,restrictPublish,restrictContact,...safe})=>safe);
   dashboard.risks=[];dashboard.appeals=[];dashboard.audit=[];
  }
  return json(res,200,{...dashboard,role:s.role,permissions:s.permissions,imageCheck:'manual_review_required',textCheck:'rule_signals_and_manual_review'}),true;
 }

 if(/^\/admin\/api\/trust\/users\/[0-9a-f-]{36}\/qualification$/i.test(p)&&m==='GET'){
  admin(req,false,'verifier');const scope=text(url.searchParams.get('scope')||'',160);if(!(scope==='housing'||scope.startsWith('publication:')&&uuid(scope.slice(12))||require('../../miniprogram/utils/classification-contract').find(scope)))fail('INVALID_SCOPE','资质范围无效');return json(res,200,{qualification:await repo.qualificationFor(p.split('/')[5],scope)}),true;
 }
 if(/^\/admin\/api\/trust\/users\/[0-9a-f-]{36}\/(identity|phone|qualification|risk)$/i.test(p)&&m==='POST'){
  const uid=p.split('/')[5],kind=p.split('/')[6],session=admin(req,true,kind==='risk'?'operator':'verifier'),v=await body(req);if(!uuid(uid))fail('INVALID_USER','账号标识无效');
  if(kind==='identity'){if(!['verified','revoked'].includes(v.status)||!Number.isInteger(v.revision)||v.revision<0)fail('INVALID_REVIEW','核验参数无效');await repo.reviewIdentity(uid,v,session.role);}
  if(kind==='phone')fail('PHONE_PROVIDER_REQUIRED','手机号必须通过微信授权验证，不接受人工勾选认证',503);
  if(kind==='qualification'){if(!['verified','revoked'].includes(v.status)||!Number.isInteger(v.revision)||v.revision<0||!(v.scope==='housing'||(typeof v.scope==='string'&&v.scope.startsWith('publication:')&&uuid(v.scope.slice(12)))||require('../../miniprogram/utils/classification-contract').find(v.scope)))fail('INVALID_SCOPE','资质范围无效');await repo.qualify(uid,v,session.role);}
  if(kind==='risk'){if(!['normal','suspicious','severe'].includes(v.level)||!Number.isInteger(v.revision)||v.revision<0)fail('INVALID_RISK','风险处置参数无效');for(const field of ['restrictPublish','restrictContact','removePublished'])if(v[field]!==undefined&&typeof v[field]!=='boolean')fail('INVALID_RISK','处置开关无效');await repo.changeRisk(uid,v,session.role);}
  return json(res,200,{ok:true}),true;
 }
 if(/^\/admin\/api\/trust\/risks\/[0-9a-f-]{36}\/evidence$/i.test(p)&&m==='GET'){const session=admin(req);return json(res,200,await repo.riskEvidence(p.split('/')[5],session.role)),true;}
 if(/^\/admin\/api\/trust\/risks\/[0-9a-f-]{36}$/i.test(p)&&m==='POST'){const s=admin(req,true),v=await body(req);await repo.resolveRisk(p.split('/').at(-1),v.reason,s.role,v.releaseMessage===true);return json(res,200,{ok:true}),true;}
 if(/^\/admin\/api\/trust\/appeals\/[0-9a-f-]{36}$/i.test(p)&&m==='POST'){const s=admin(req,true),v=await body(req);if(!['accepted','rejected'].includes(v.status)||!Number.isInteger(v.revision))fail('INVALID_APPEAL','申诉处理参数无效');await repo.reviewAppeal(p.split('/').at(-1),v,s.role);return json(res,200,{ok:true}),true;}
 if(/^\/admin\/api\/reports\/[0-9a-f-]{36}\/evidence$/i.test(p)&&m==='GET'){const s=admin(req);return json(res,200,await repo.reportEvidence(p.split('/')[4],s.role)),true;}
 return false;
}
module.exports={trustRoutes};
