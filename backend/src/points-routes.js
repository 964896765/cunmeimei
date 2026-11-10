'use strict';
const {hasRole}=require('./admin-permissions');
const {ApiError,uuid}=require('./rules');
function offset(url){const n=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(n)||n<0||n>100000)throw new ApiError(400,'INVALID_POINTS_PAGE','积分分页无效');return n;}
async function pointsRoutes({req,res,p,m,url,repo,user,admin,body,json}){
 if(!repo.contributionRules)return false;
 if(/^\/api\/v1\/points\/(ledger|rewards|appeals)\/[0-9a-f-]{36}$/i.test(p)&&m==='GET'){
  const uid=await user(req),parts=p.split('/'),id=parts[5];if(!uuid(id))throw new ApiError(400,'INVALID_ID','积分记录编号无效');
  const rows=await ({ledger:repo.pointsLedger,rewards:repo.ownContributionRewards,appeals:repo.ownRewardAppeals}[parts[4]])(uid,0,id);
  if(!rows[0])throw new ApiError(404,'POINTS_ENTRY_UNAVAILABLE','该积分记录暂不可用');json(res,200,{item:rows[0]});return true;
 }
 if(p==='/api/v1/points/appeals'&&m==='GET'){const uid=await user(req);return json(res,200,{items:await repo.ownRewardAppeals(uid,offset(url))}),true;}
 if(/^\/api\/v1\/points\/rewards\/[0-9a-f-]{36}\/appeals$/i.test(p)&&m==='POST'){const uid=await user(req);return json(res,201,{appeal:await repo.createRewardAppeal(uid,p.split('/')[5],await body(req))}),true;}
 if(/^\/api\/v1\/points\/appeals\/[0-9a-f-]{36}\/withdraw$/i.test(p)&&m==='POST'){const uid=await user(req);return json(res,200,await repo.withdrawRewardAppeal(uid,p.split('/')[5])),true;}
 if(/^\/admin\/api\/points\/appeals\/[0-9a-f-]{36}\/review$/i.test(p)&&m==='POST'){const session=admin(req,true);if(!hasRole(session.role,'operator'))throw new ApiError(403,'OPERATOR_REQUIRED','积分申诉需要运营审核权限');return json(res,200,await repo.reviewRewardAppeal(p.split('/')[5],await body(req),session.role)),true;}
 if(p==='/api/v1/points/rules'&&m==='GET'){return json(res,200,{items:await repo.contributionRules(),globalDailyLimit:20,quotaDay:'Asia/Shanghai',pendingPolicy:'事件按采集时的规则快照排队；关闭规则只停止新事件，已排队事件继续按快照及风控复核。',notice:'积分不能充值、提现、转让或兑换现金；浏览和广告点击不产生积分。'}),true;}
 if(p==='/api/v1/points/account'&&m==='GET'){return json(res,200,await repo.contributionAccount(await user(req))),true;}
 if(p==='/api/v1/points/ledger'&&m==='GET'){const uid=await user(req);return json(res,200,{items:await repo.pointsLedger(uid,offset(url))}),true;}
 if(p==='/api/v1/points/rewards'&&m==='GET'){const uid=await user(req);return json(res,200,{items:await repo.ownContributionRewards(uid,offset(url))}),true;}
 if(p==='/admin/api/points/rules'&&m==='GET'){admin(req);return json(res,200,{items:await repo.contributionRules()}),true;}
 if(/^\/admin\/api\/points\/rules\/[a-z0-9_]+$/.test(p)&&m==='POST'){
  const session=admin(req,true);if(!hasRole(session.role,'operator'))throw new ApiError(403,'OPERATOR_REQUIRED','积分规则需要运营审核权限');
  return json(res,200,await repo.configureContributionRule(p.split('/')[5],await body(req),session.role)),true;
 }
 if(/^\/admin\/api\/points\/rewards\/[0-9a-f-]{36}\/(review|reverse)$/i.test(p)&&m==='POST'){
  const session=admin(req,true);if(!hasRole(session.role,'operator'))throw new ApiError(403,'OPERATOR_REQUIRED','积分复核需要运营审核权限');
  const id=p.split('/')[5],v=await body(req);return json(res,200,await (p.endsWith('/review')?repo.reviewContributionReward(id,v,session.role):repo.reverseContributionReward(id,v,session.role))),true;
 }
 if(/^\/admin\/api\/points\/users\/[0-9a-f-]{36}$/i.test(p)&&m==='GET'){
  const session=admin(req),uid=p.split('/')[5];if(!uuid(uid))throw new ApiError(400,'INVALID_USER','用户编号无效');
  return json(res,200,await repo.auditPointsAccount(uid,offset(url),session.role)),true;
 }
 if(/^\/admin\/api\/points\/users\/[0-9a-f-]{36}\/adjust$/i.test(p)&&m==='POST'){
  const session=admin(req,true),uid=p.split('/')[5],v=await body(req);
  if(!hasRole(session.role,'operator'))throw new ApiError(403,'OPERATOR_REQUIRED','人工调账需要运营审核权限');
  if(!uuid(uid)||!uuid(v.requestId)||typeof v.debit!=='boolean'||Object.keys(v).some(k=>!['requestId','debit','amount','ticket','reason'].includes(k)))throw new ApiError(400,'INVALID_POINTS_ADJUSTMENT','需要调账工单、唯一请求标识、原因及明确增减方向');
  const entry=await repo.postPoints(uid,{kind:'adjustment',amount:v.amount,debit:v.debit,key:'admin_adjustment:'+v.requestId,source:v.ticket,reason:v.reason,actor:session.role});
  return json(res,200,{id:entry.id,availableAfter:entry.available_after}),true;
 }
 return false;
}
module.exports={pointsRoutes};
