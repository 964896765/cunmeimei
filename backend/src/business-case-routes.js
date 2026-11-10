'use strict';
const {hasRole}=require('./admin-permissions');
const {ApiError}=require('./rules');
async function businessCaseRoutes({req,res,p,m,url,repo,user,admin,body,json}){
 if(!p.startsWith('/api/v1/business/')&&!p.startsWith('/admin/api/business/'))return false;
 if(!repo.createBusinessCase)throw new ApiError(503,'DATABASE_REQUIRED','业务进度需要持久化数据库');
 const send=(status,data)=>{json(res,status,data);return true;},offset=()=>{const n=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(n)||n<0||n>100000)throw new ApiError(400,'INVALID_PAGE','分页无效');return n;},page=rows=>({items:rows.slice(0,20),hasMore:rows.length>20});let match;
 if(p==='/api/v1/business/cases'&&m==='GET')return send(200,page(await repo.businessCases(await user(req),offset(),url.searchParams.get('filter')||'all')));
 if(p==='/api/v1/business/cases'&&m==='POST')return send(201,{item:await repo.createBusinessCase(await user(req),await body(req))});
 if(p==='/api/v1/business/source'&&m==='GET')return send(200,{item:await repo.businessCaseForSource(await user(req),url.searchParams.get('sourceKind'),url.searchParams.get('sourceId'))});
 if((match=/^\/api\/v1\/business\/cases\/([0-9a-f-]{36})$/i.exec(p))){const uid=await user(req);if(m==='GET'){const item=await repo.ownBusinessCase(uid,match[1]);if(!item)throw new ApiError(404,'NOT_FOUND','本人业务进度不存在');return send(200,{item});}if(m==='POST')return send(200,{item:await repo.actBusinessCase(uid,match[1],await body(req))});}
 if(p.startsWith('/admin/api/business/')){const session=admin(req,m!=='GET');if(!hasRole(session.role,'operator'))throw new ApiError(403,'OPERATOR_REQUIRED','需要运营处理角色');
  if(p==='/admin/api/business/disputes'&&m==='GET')return send(200,page(await repo.businessCaseDisputes(offset())));
  if((match=/^\/admin\/api\/business\/cases\/([0-9a-f-]{36})$/i.exec(p))){if(m==='GET'){const item=await repo.adminBusinessCase(match[1]);if(!item)throw new ApiError(404,'NOT_FOUND','业务进度不存在');return send(200,{item});}if(m==='POST')return send(200,{item:await repo.resolveBusinessCase(match[1],await body(req),session.role)});}
 }
 return false;
}
module.exports={businessCaseRoutes};
