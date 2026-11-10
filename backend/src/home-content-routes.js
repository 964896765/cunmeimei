'use strict';
const {hasRole}=require('./admin-permissions');
const {ApiError,uuid}=require('./rules');
const geography=require('./geography');
const pageOf=url=>{const p=url.searchParams.get('page')||'1';if(!/^[1-9]\d{0,2}$/.test(p)||Number(p)>500)throw new ApiError(400,'INVALID_PAGE','页码无效');return Number(p);};
async function homeContentRoutes({req,res,p,m,url,repo,user,admin,body,json}){
 if(p==='/api/v1/home'&&m==='GET'){
  const city=url.searchParams.get('cityCode')||'';geography.cityReference(city);
  if(!repo.publicHomeContent){json(res,200,{banners:[],news:[],supported:false});return true;}
  const [banners,news,promotions]=await Promise.all([repo.publicHomeContent(city,'carousel'),repo.publicHomeContent(city,'news'),city&&repo.publicPromotionEntry?repo.publicPromotionEntry(null,city):[]]);json(res,200,{banners:[...banners.items,...promotions].slice(0,5),news:news.items.slice(0,6),hasMoreNews:news.items.length>6||news.hasMore,supported:true});return true;
 }
 if(p==='/api/v1/home/news'&&m==='GET'){const city=url.searchParams.get('cityCode')||'';geography.cityReference(city);const page=pageOf(url);json(res,200,repo.publicHomeContent?await repo.publicHomeContent(city,'news',page):{items:[],hasMore:false});return true;}
 if(/^\/api\/v1\/home\/content\/[0-9a-f-]{36}$/i.test(p)&&m==='GET'){const id=p.split('/').at(-1),item=await repo.publicHomeEntry?.(id)||(await repo.publicPromotionEntry?.(id))?.[0];if(!item)throw new ApiError(404,'HOME_CONTENT_UNAVAILABLE','内容已停止展示或暂不可用');json(res,200,{item});return true;}
 if(/^\/api\/v1\/home\/content\/[0-9a-f-]{36}\/reports$/i.test(p)&&m==='POST'){const uid=await user(req);if(!repo.reportHomeContent)throw new ApiError(503,'NOT_AVAILABLE','纠错暂不可用');json(res,201,await repo.reportHomeContent(uid,p.split('/')[5],(await body(req)).reason));return true;}
 if(/^\/api\/v1\/me\/home-reports\/[0-9a-f-]{36}$/i.test(p)&&m==='GET'){const uid=await user(req),id=p.split('/').at(-1);if(!uuid(id))throw new ApiError(400,'INVALID_ID','记录编号无效');const report=await repo.ownHomeReport?.(uid,id);if(!report)throw new ApiError(404,'NOT_FOUND','记录不存在');json(res,200,{report});return true;}
 if(!p.startsWith('/admin/api/home-'))return false;
 const session=admin(req,m!=='GET');
 if(!repo.saveHomeContent)throw new ApiError(503,'DATABASE_REQUIRED','首页内容管理需要持久化数据库');
 const operator=()=>{if(!hasRole(session.role,'operator'))throw new ApiError(403,'OPERATOR_REQUIRED','内容编辑和审核需要运营角色');};
 if(p==='/admin/api/home-cities'&&m==='GET'){json(res,200,{items:geography.cities.map(c=>({code:c.code,name:c.name}))});return true;}
 if(p==='/admin/api/home-targets'&&m==='GET'){json(res,200,await repo.homeTargets({q:url.searchParams.get('q')||'',cityCode:url.searchParams.get('cityCode')||'',page:pageOf(url)}));return true;}
 if(p==='/admin/api/home-content'&&m==='GET'){json(res,200,await repo.adminHomeContent(pageOf(url)));return true;}
 if(p==='/admin/api/home-content'&&m==='POST'){operator();json(res,201,await repo.saveHomeContent(null,await body(req),session.role));return true;}
 if(/^\/admin\/api\/home-content\/[0-9a-f-]{36}$/.test(p)&&m==='PUT'){operator();json(res,200,await repo.saveHomeContent(p.split('/').at(-1),await body(req),session.role));return true;}
 if(/^\/admin\/api\/home-content\/[0-9a-f-]{36}\/review$/.test(p)&&m==='POST'){operator();json(res,200,await repo.reviewHomeContent(p.split('/')[4],await body(req),session.role));return true;}
 if(p==='/admin/api/home-reports'&&m==='GET'){json(res,200,await repo.homeReports(pageOf(url)));return true;}
 if(/^\/admin\/api\/home-reports\/[0-9a-f-]{36}$/.test(p)&&m==='POST'){operator();json(res,200,await repo.resolveHomeReport(p.split('/').at(-1),await body(req),session.role));return true;}
 if(p==='/admin/api/home-advertisers'&&m==='GET'){let items=await repo.homeAdvertisers(pageOf(url));if(!hasRole(session.role,'verifier'))items=items.map(({evidence_reference,...safe})=>safe);json(res,200,{items});return true;}
 if(p==='/admin/api/home-advertisers'&&m==='POST'){operator();const v=await body(req);if(!uuid(v.userId))throw new ApiError(400,'INVALID_USER','广告主账号编号无效');json(res,201,await repo.createAdvertiser(v.userId,v));return true;}
 if(/^\/admin\/api\/home-advertisers\/[0-9a-f-]{36}$/.test(p)&&m==='POST'){if(!hasRole(session.role,'verifier'))throw new ApiError(403,'VERIFIER_REQUIRED','广告主主体资料需要业务核验角色确认');json(res,200,await repo.verifyAdvertiser(p.split('/').at(-1),await body(req),session.role));return true;}
 return false;
}
module.exports={homeContentRoutes};
