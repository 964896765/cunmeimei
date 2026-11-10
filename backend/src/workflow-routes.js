'use strict';
const {hasRole}=require('./admin-permissions');
const {ApiError,uuid}=require('./rules');
const fail=(code,message,status=400)=>{throw new ApiError(status,code,message);};
const offset=url=>{const v=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(v)||v<0||v>100000)fail('INVALID_PAGE','分页无效');return v;};
const page=items=>({items:items.slice(0,20),hasMore:items.length>20});
async function workflowRoutes({req,res,p,m,url,repo,user,admin,body,json}){
 const send=(status,data)=>{json(res,status,data);return true;};
 const auth=async()=>{if(!repo.saveIndustryEntry)fail('DATABASE_REQUIRED','此业务需要持久化数据库',503);return user(req);};
 if(p==='/api/v1/benefits'&&m==='GET')return send(200,{items:repo.benefitOffers?await repo.benefitOffers():[]});
 if(p==='/api/v1/me/benefit-orders'&&m==='GET')return send(200,page(await repo.benefitOrders(await auth(),offset(url))));
 if(p==='/api/v1/benefit-orders'&&m==='POST')return send(201,{order:await repo.redeemBenefit(await auth(),await body(req))});
 let match;
 if((match=/^\/api\/v1\/me\/(benefit-orders|promotions)\/([0-9a-f-]{36})$/i.exec(p))&&m==='GET'){const uid=await auth(),item=await (match[1]==='promotions'?repo.ownPromotion(uid,match[2]):repo.ownBenefitOrder(uid,match[2]));if(!item)fail('NOT_FOUND','本人记录不存在',404);return send(200,{item});}
 if((match=/^\/api\/v1\/industry\/me\/target\/([0-9a-f-]{36})$/i.exec(p))&&m==='GET'){const target=await repo.industryTarget(await auth(),match[1]);if(!target)fail('NOT_FOUND','本人业务记录不存在',404);return send(200,{target});}
 if((match=/^\/api\/v1\/benefit-orders\/([0-9a-f-]{36})\/cancel$/i.exec(p))&&m==='POST')return send(200,{order:await repo.resolveBenefit(await auth(),match[1],{...await body(req),status:'cancelled'},'owner')});
 if(p==='/api/v1/promotions/context'&&m==='GET'){const uid=await auth();const [advertisers,targets,slots]=await Promise.all([repo.ownAdvertisers(uid),repo.promotionTargets(uid),repo.promotionSlots()]);return send(200,{advertisers,targets,slots});}
 if(p==='/api/v1/me/promotions'&&m==='GET')return send(200,page(await repo.promotionCampaigns(await auth(),offset(url))));
 if(p==='/api/v1/promotions/advertisers'&&m==='POST')return send(201,await repo.applyAdvertiser(await auth(),await body(req)));
 if(p==='/api/v1/promotions'&&m==='POST')return send(201,await repo.applyPromotion(await auth(),await body(req)));
 if((match=/^\/api\/v1\/promotions\/([0-9a-f-]{36})\/(purchase|cancel)$/i.exec(p))&&m==='POST'){const uid=await auth(),v=await body(req);return send(200,await (match[2]==='purchase'?repo.purchasePromotion(uid,match[1],v):repo.cancelAd(uid,match[1],v)));}
 if((match=/^\/api\/v1\/promotions\/([0-9a-f-]{36})\/status$/i.exec(p))&&m==='POST')return send(200,await repo.ownPromotionStatus(await auth(),match[1],await body(req)));
 if((match=/^\/api\/v1\/industry\/catalog\/(C\d{2}G\d{2}S\d{2})$/.exec(p))&&m==='GET'){const w=require('../../miniprogram/utils/industry-workflows').workflow(match[1]);if(!w)fail('NOT_FOUND','此项目沿用居民发布表单',404);return send(200,{workflow:w});}
 if((match=/^\/api\/v1\/industry\/public\/([0-9a-f-]{36})$/i.exec(p))&&m==='GET'){const item=await repo.publicIndustryEntry?.(match[1]);if(!item)fail('NOT_FOUND','业务内容不可用或资质已失效',404);return send(200,{item});}
 if(p==='/api/v1/industry/me/entries'&&m==='GET')return send(200,page(await repo.ownIndustryEntries(await auth(),offset(url))));
 if((match=/^\/api\/v1\/industry\/me\/entries\/([0-9a-f-]{36})$/i.exec(p))&&m==='GET'){const entry=await repo.ownIndustryEntry(await auth(),match[1]);if(!entry)fail('NOT_FOUND','本人记录不存在',404);return send(200,{entry});}
 if(p==='/api/v1/industry/me/credentials'&&m==='GET')return send(200,{items:await repo.industryCredentials(await auth())});
 if(p==='/api/v1/industry/me/reports'&&m==='GET')return send(200,{items:await repo.industryReports(await auth())});
 if(p==='/api/v1/industry/me/responses'&&m==='GET')return send(200,page(await repo.industryResponses(await auth(),url.searchParams.get('received')==='1',offset(url))));
 if(p==='/api/v1/industry/credentials'&&m==='POST')return send(201,await repo.applyIndustryCredential(await auth(),await body(req)));
 if(p==='/api/v1/industry/entries'&&m==='POST')return send(201,{entry:await repo.saveIndustryEntry(await auth(),null,await body(req))});
 if((match=/^\/api\/v1\/industry\/entries\/([0-9a-f-]{36})$/i.exec(p))&&m==='PUT')return send(200,{entry:await repo.saveIndustryEntry(await auth(),match[1],await body(req))});
 if((match=/^\/api\/v1\/industry\/entries\/([0-9a-f-]{36})\/(close|responses|reports)$/i.exec(p))&&m==='POST'){const uid=await auth(),v=await body(req);return send(match[2]==='close'?200:201,await (match[2]==='close'?repo.closeIndustryEntry(uid,match[1],v):match[2]==='responses'?repo.createIndustryResponse(uid,match[1],v):repo.reportIndustry(uid,match[1],v.reason)));}
 if((match=/^\/api\/v1\/industry\/responses\/([0-9a-f-]{36})$/i.exec(p))&&m==='POST')return send(200,await repo.resolveIndustryResponse(await auth(),match[1],await body(req)));
 if(!p.startsWith('/admin/api/commerce/')&&!p.startsWith('/admin/api/industry/'))return false;
 const session=admin(req,m!=='GET');if(!repo.saveIndustryEntry)fail('DATABASE_REQUIRED','此业务需要PostgreSQL',503);
 const operator=()=>{if(!hasRole(session.role,'operator'))fail('OPERATOR_REQUIRED','需要运营角色',403);};
 if(p==='/admin/api/commerce/offers'&&m==='GET')return send(200,{items:await repo.benefitOffers(true)});
 if(p==='/admin/api/commerce/offers'&&m==='POST'){operator();return send(201,await repo.saveBenefitOffer(null,await body(req),session.role));}
 if((match=/^\/admin\/api\/commerce\/offers\/([0-9a-f-]{36})$/.exec(p))&&m==='PUT'){operator();return send(200,await repo.saveBenefitOffer(match[1],await body(req),session.role));}
 if(p==='/admin/api/commerce/orders'&&m==='GET'){operator();return send(200,page(await repo.benefitOrders(null,offset(url))));}
 if((match=/^\/admin\/api\/commerce\/orders\/([0-9a-f-]{36})$/.exec(p))&&m==='POST'){operator();const v=await body(req);if(!['fulfilled','rejected'].includes(v.status))fail('INVALID_ACTION','只能确认核销或拒绝退还');return send(200,await repo.resolveBenefit(null,match[1],v,session.role));}
 if(p==='/admin/api/commerce/slots'&&m==='GET')return send(200,{items:await repo.promotionSlots(true)});
 if(p==='/admin/api/commerce/slots'&&m==='POST'){operator();return send(201,await repo.createPromotionSlot(await body(req),session.role));}
 if((match=/^\/admin\/api\/commerce\/slots\/([0-9a-f-]{36})$/.exec(p))&&m==='POST'){operator();return send(200,await repo.setPromotionSlot(match[1],await body(req),session.role));}
 if(p==='/admin/api/commerce/campaigns'&&m==='GET'){operator();return send(200,page(await repo.promotionCampaigns(null,offset(url))));}
 if((match=/^\/admin\/api\/commerce\/campaigns\/([0-9a-f-]{36})\/(review|status)$/.exec(p))&&m==='POST'){operator();return send(200,await (match[2]==='review'?repo.reviewAd(match[1],await body(req),session.role):repo.setAdStatus(match[1],await body(req),session.role)));}
 if((match=/^\/admin\/api\/industry\/(entries|credentials|reports)$/.exec(p))&&m==='GET'){if(match[1]==='credentials'&&!hasRole(session.role,'verifier'))fail('VERIFIER_REQUIRED','主体资料仅业务核验角色可读',403);if(match[1]!=='credentials')operator();return send(200,page(await repo.industryAdmin(match[1],offset(url))));}
 if((match=/^\/admin\/api\/industry\/entries\/([0-9a-f-]{36})$/.exec(p))&&m==='GET'){operator();const entry=await repo.industryAdminEntry(match[1]);if(!entry)fail('NOT_FOUND','业务不存在',404);return send(200,{entry});}
 if((match=/^\/admin\/api\/industry\/(entries|credentials|reports)\/([0-9a-f-]{36})$/.exec(p))&&m==='POST'){
  if(match[1]==='credentials'){if(!hasRole(session.role,'verifier'))fail('VERIFIER_REQUIRED','主体材料需要业务核验角色',403);}else operator();
  return send(200,await ({entries:repo.reviewIndustryEntry,credentials:repo.reviewIndustryCredential,reports:repo.resolveIndustryReport}[match[1]])(match[2],await body(req),session.role));
 }
 return false;
}
module.exports={workflowRoutes};
