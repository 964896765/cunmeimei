'use strict';
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {URL}=require('node:url');
const {TextDecoder}=require('node:util');
const {readUpload,writePrivate,readPrivate,unlinkPrivate}=require('./private-license');const {ApiError,bad,text,publication,merchant,booking,evidence,service,report,uuid,validCalendarDate}=require('./rules');
const {createMemoryRepository}=require('./memory-repository');
const {validRegionName}=require('./taxonomy');
const {createAdminLoginLimiter,pruneExpired}=require('./admin-login-limiter');
const {makeClientAddress}=require('./client-address');
const adminPolicy=require('./admin-permissions');
const {hasRole}=adminPolicy;
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const enc=body=>JSON.stringify(body);
function createApp({repo,areas,allowDevLogin=false,adminPassword='',superAdminPassword='',operatorPermissions=[],verifierPermissions=[],wechatAppId='',wechatSecret='',production=false,fetchWechat=global.fetch,privateUploadDir=path.join(__dirname,'../../private-data'),trustedProxyIps=[],tencentMapKey='',fetchGeography=global.fetch,verificationAdminPassword='',phoneEncryptionKey='',platformPublishApproved=false,platformContactApproved=false,legalConfig={}}){
 if(!repo)throw Error('repository required');if(!Array.isArray(areas)||!areas.length||!areas.every(validRegionName))throw Error('SERVICE_AREAS must contain valid 2–40 character region names');
 repo.configureTrust?.({enabled:true,allowLocalTest:!production&&allowDevLogin,production,publishApproved:platformPublishApproved,contactApproved:platformContactApproved,phoneKey:phoneEncryptionKey});
 const legalDocs=require('./legal-documents').documents(legalConfig),wechatAuthenticate=require('./wechat-login').provider(wechatAppId,wechatSecret,fetchWechat);
 const phoneVerifier=require('./wechat-phone').createPhoneVerifier(wechatAppId,wechatSecret,fetchWechat);
 const phoneConfigured=!!wechatAppId&&!!wechatSecret&&Buffer.from(phoneEncryptionKey,'base64').length===32;
 const roleGrants={operator:operatorPermissions,verifier:verifierPermissions,superadmin:[]};
 for(const role of Object.keys(roleGrants))adminPolicy.permissionsFor(role,roleGrants[role]);
 const adminSessions=new Map();const adminLoginLimiter=createAdminLoginLimiter();const uploadLimits=new Map();
 const clientAddress=makeClientAddress(trustedProxyIps);
 const testData=req=>!production&&req.headers['x-development-test-data']==='true';
 const searchCounts=new Map(),searchPolicy=require('./search-popularity');
 // Local-process protection against high-rate requests to the WeChat session exchange.
 // Multi-instance production deployments also need limits at the gateway/shared store.
 const loginAttempts=new Map();
 function limitLogin(req,scope='login'){
  const ip=clientAddress(req),now=Date.now(),key=scope+':'+ip;
  // At exactly 2,000 unique addresses, expired records must still be freed.
  // Otherwise the next new IP gets stuck behind expired entries indefinitely.
  pruneExpired(loginAttempts,'until',now,2000);
  if(loginAttempts.size>=2000&&!loginAttempts.has(key))fail(429,'LOGIN_RATE_LIMIT','登录请求过多，请稍后重试');
  const state=loginAttempts.get(key);
  if(state&&state.until>now&&state.count>=20)fail(429,'LOGIN_RATE_LIMIT','登录过于频繁，请稍后重试');
  if(!state||state.until<=now)loginAttempts.set(key,{count:1,until:now+60000});
  else state.count+=1;
 }
 const geography=require('./geography'),geoProvider=require('./tencent-geography').provider(tencentMapKey,fetchGeography);
 const geoAttempts=new Map();function limitGeo(req){const now=Date.now(),ip=clientAddress(req);pruneExpired(geoAttempts,'until',now,2000);const item=geoAttempts.get(ip);if(item?.until>now&&item.count>=40||!item&&geoAttempts.size>=2000)fail(429,'GEO_RATE_LIMIT','定位请求过多，请稍后重试');if(!item||item.until<=now)geoAttempts.set(ip,{until:now+60000,count:1});else item.count++;}
 const allRegions=()=>repo.listRegions(areas);
 const activeAreas=async()=>(await allRegions()).filter(x=>x.enabled).map(x=>x.name);
 const canSubmit=async(type)=>(await repo.listCategories()).some(c=>c.id===type&&c.enabled&&!c.restricted);
 function json(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(enc(data));}
 function fail(status,code,message){throw new ApiError(status,code,message);}
 async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32*1024)fail(413,'TOO_LARGE','请求数据超过 32KB 限制');chunks.push(chunk);}if(!size)return {};let data;try{data=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size));}catch{fail(400,'INVALID_JSON','请求内容不是有效 UTF-8');}try{const parsed=JSON.parse(data);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error();return parsed;}catch{fail(400,'INVALID_JSON','请求内容不是 JSON 对象');}}
 async function issueSession(provider,identifier,consent=null){const userId=await repo.upsertIdentity(provider,identifier);const token=crypto.randomBytes(32).toString('base64url');await repo.newSession(userId,sha256(token),new Date(Date.now()+7*86400e3).toISOString(),consent);return {token,expiresIn:604800,userId};}
 async function user(req){const auth=req.headers.authorization||'';if(!/^Bearer [A-Za-z0-9_-]{32,100}$/.test(auth))fail(401,'LOGIN_REQUIRED','请先登录');const uid=await repo.authenticate(sha256(auth.slice(7)));if(!uid)fail(401,'SESSION_EXPIRED','登录已过期');return uid;}

 function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('citylife_admin='))?.slice(15)||'';}
 function admin(req,unsafe=false,scope){
  const key=cookie(req),session=adminSessions.get(key);
  if(!session||session.exp<=Date.now()){adminSessions.delete(key);fail(401,'ADMIN_REQUIRED','请登录后台');}
  adminPolicy.authorizeRoute(session,req.method,new URL(req.url,'http://localhost').pathname);
  if(scope)adminPolicy.requirePermission(session,scope==='verifier'?'qualification':'operations');
  if((unsafe||!['GET','HEAD'].includes(req.method))&&req.headers['x-csrf-token']!==session.csrf)fail(403,'CSRF_REQUIRED','后台安全校验失败');
  return session;
 }
 function adminHtml(res){const file=path.join(__dirname,'../admin/index.html');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(fs.readFileSync(file));}
 function adminScript(res){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(path.join(__dirname,'../admin/app.js')));}
 async function handler(req,res){try{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`),p=url.pathname,m=req.method;
  if(p.startsWith('/admin/api/')&&!(m==='POST'&&p==='/admin/api/login')){
   let principal;
   try{principal=admin(req);}catch(error){
    const session=adminSessions.get(cookie(req));
    if(session&&session.exp>Date.now())await repo.recordAdminAccess({sessionId:session.auditId,role:session.role,method:m,path:p,outcome:'denied',code:error.code});
    throw error;
   }
   await repo.recordAdminAccess({sessionId:principal.auditId,role:principal.role,method:m,path:p,outcome:'authorized'});
  }
  if(m==='GET'&&p==='/admin'){return adminHtml(res);}
  if(m==='GET'&&p==='/admin/app.js'){return adminScript(res);}
  if(m==='GET'&&p==='/admin/review-dialog.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(__dirname,'../admin/review-dialog.js')));}
  if(m==='GET'&&p==='/admin/workflows.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(__dirname,'../admin/workflows.js')));}
  if(m==='GET'&&p==='/admin/home-content.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(__dirname,'../admin/home-content.js')));}
  if(m==='GET'&&p==='/admin/app.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(__dirname,'../admin/app.css')));}
  if(m==='POST'&&p==='/api/v1/me/phone/wechat')limitLogin(req,'phone');
  if(repo.trustStatus&&await require('./trust-routes').trustRoutes({req,res,p,m,url,repo,user,admin,body,json,phoneVerifier,phoneConfigured}))return;
  if(await require('./points-routes').pointsRoutes({req,res,p,m,url,repo,user,admin,body,json}))return;
  if(await require('./home-content-routes').homeContentRoutes({req,res,p,m,url,repo,user,admin,body,json}))return;
  if(await require('./industry-services').industryServiceRoutes({req,res,p,m,url,repo,user,admin,body,json}))return;
  if(await require('./workflow-routes').workflowRoutes({req,res,p,m,url,repo,user,admin,body,json}))return;
  if(await require('./business-case-routes').businessCaseRoutes({req,res,p,m,url,repo,user,admin,body,json}))return;
  if(m==='GET'&&p==='/api/v1/health'){return json(res,200,{ok:true,version:require('../package.json').version});}
  if(m==='GET'&&p==='/api/v1/ready'){try{await repo.ping();if(typeof repo.verifySchema==='function')await repo.verifySchema();return json(res,200,{ready:true});}catch{return json(res,503,{ready:false,error:'DEPENDENCY_UNAVAILABLE'});}}
  if(m==='GET'&&p==='/api/v1/config'){const regions=await allRegions();const categories=await repo.listCategories();return json(res,200,{areas:regions.filter(r=>r.enabled).map(r=>r.name),categories,features:{forumPublishing:false,publicInteractions:false,practicalInformation:true,benefitMode:'points_only',bookingPurpose:'service_request',businessProgressPurpose:'mutual_progress_record',publishingApproved:!production||platformPublishApproved,industryWorkflows:!!repo.saveIndustryEntry,businessProgress:!!repo.createBusinessCase,industryServiceBooking:!!repo.connectIndustryService,benefitRedemption:!!repo.redeemBenefit,selfPromotion:!!repo.applyPromotion,jobs:!!repo.saveIndustryEntry,payments:false,realtimeChat:false,textContactChat:!!repo.sendChat,phoneVerification:phoneConfigured,identityVerification:'manual_external_evidence',machineImageReview:'not_configured_manual_required',merchantCertification:'manual_review',merchantOperations:true,reports:true,licenseUpload:production?'disabled_pending_security_review':'private_development',bookingSlots:'single_capacity_30min_hold'}});}
  if(m==='GET'&&p==='/api/v1/legal')return json(res,200,{...legalDocs,wechatAvailable:!!wechatAppId&&!!wechatSecret});
  if(m==='POST'&&p==='/api/v1/auth/wechat'){limitLogin(req);const v=await body(req),consent=require('./legal-documents').consent(v,legalDocs),code=text(v.code,512,4);return json(res,200,await issueSession('wechat_miniapp',await wechatAuthenticate(code),consent));}
  if(m==='POST'&&p==='/api/v1/dev/login'){
    const remote=(req.socket.remoteAddress||'').replace('::ffff:','');if(production||!allowDevLogin||!['127.0.0.1','::1'].includes(remote)||
      req.headers['x-real-ip']!==undefined||req.headers['x-forwarded-for']!==undefined||req.headers.forwarded!==undefined)fail(404,'NOT_FOUND','接口不存在');
    limitLogin(req);const v=await body(req);return json(res,200,await issueSession('dev_local',text(v.devUser,80,3)));
  }
  if(m==='GET'&&p==='/api/v1/geo/reverse'){limitGeo(req);const latitude=geography.number(url.searchParams.get('latitude'),-90,90),longitude=geography.number(url.searchParams.get('longitude'),-180,180);return json(res,200,await geoProvider.reverse(latitude,longitude));}
  if(m==='GET'&&p==='/api/v1/geo/center'){limitGeo(req);const cityCode=url.searchParams.get('cityCode')||'';geography.cityReference(cityCode);if(!cityCode)fail(400,'CITY_REQUIRED','请选择浏览城市');return json(res,200,await geoProvider.center(cityCode));}
  if(m==='GET'&&p==='/api/v1/map'){
   const cityCode=url.searchParams.get('cityCode')||'',districtCode=url.searchParams.get('districtCode')||'';geography.cityReference(cityCode,districtCode);if(!cityCode)fail(400,'CITY_REQUIRED','请选择浏览城市');
   const categoryId=url.searchParams.get('categoryId')||'';if(categoryId&&!require('../../miniprogram/utils/classification-contract').find(categoryId))fail(400,'INVALID_CATEGORY','地图分类无效');
   const box=geography.bounds(Object.fromEntries(url.searchParams)),type=url.searchParams.get('type')||'all',q=(url.searchParams.get('q')||'').trim();
   const rawPage=url.searchParams.get('page')||'1';if(!/^[1-9]\d{0,2}$/.test(rawPage)||Number(rawPage)>200||q.length>80||!['all',...require('../../miniprogram/utils/business-templates').templates.map(x=>x.id)].includes(type))fail(400,'BAD_QUERY','地图筛选无效');
   const filters=require('./map-filters').parse(url.searchParams);
   let refinements;try{refinements=require('../../miniprogram/utils/discovery-refinements').normalize(url.searchParams.get('refinements')||{},type,true);}catch(error){fail(400,'INVALID_REFINEMENTS',error.message);}
   if(!repo.listPublicLocations)fail(503,'MAP_UNAVAILABLE','地图检索暂不可用');const page=Number(rawPage),rows=await repo.listPublicLocations({...box,cityCode,districtCode,type,q,categoryId,...filters,refinements,limit:51,offset:(page-1)*50,includeTest:testData(req)});
   return json(res,200,{items:rows.slice(0,50).map(({totalCount,...item})=>item),total:rows[0]?.totalCount||0,pagination:{page,hasMore:rows.length>50},policy:'verified_public_business_only'});
  }
  if(m==='PUT'&&/^\/admin\/api\/map-locations\/[0-9a-f-]{36}$/i.test(p)){
   admin(req,true);const id=p.split('/').at(-1),v=geography.location(await body(req));if(!uuid(id))fail(400,'INVALID_ID','信息标识无效');const item=await repo.getItem(id,{includeTest:testData(req)});
   if(!item||!['service','merchant'].includes(item.kind)||item.kind!==v.kind)fail(409,'MAP_TARGET_UNAVAILABLE','仅可核验已公开的商家或可预约服务，个人信息不可精确定位');if(!repo.setPublicLocation)fail(503,'MAP_UNAVAILABLE','地图检索暂不可用');await repo.setPublicLocation(id,v);return json(res,200,{ok:true});
  }
  if(m==='GET'&&p==='/api/v1/search/popular'){
   const cityCode=url.searchParams.get('cityCode')||'';geography.cityReference(cityCode);
   if(!cityCode)return json(res,200,{items:[]});
   const enabled=new Set((await repo.listCategories()).filter(x=>x.enabled&&!x.restricted).map(x=>x.id));
   const rows=await repo.popularSearches(cityCode);
   return json(res,200,{items:rows.filter(x=>enabled.has(searchPolicy.terms[x.term])).slice(0,6).map(x=>({term:x.term})),windowDays:7});
  }
  if(m==='POST'&&p==='/api/v1/search/events'){
   const v=await body(req),cityCode=v.cityCode||'';geography.cityReference(cityCode);
   const term=searchPolicy.termFor(v.q);
   if(!cityCode||!term||testData(req))return json(res,200,{recorded:false});
   if(!(await repo.listCategories()).some(x=>x.id===searchPolicy.terms[term]&&x.enabled&&!x.restricted))return json(res,200,{recorded:false});
   const now=Date.now(),key=clientAddress(req)+':'+cityCode+':'+term;
   pruneExpired(searchCounts,'until',now,2000);
   if(searchCounts.get(key)?.until>now)return json(res,200,{recorded:false});
   searchCounts.delete(key);
   if(searchCounts.size>=2000)fail(429,'SEARCH_RATE_LIMIT','搜索统计繁忙，请稍后重试');
   searchCounts.set(key,{until:now+60000});
   try{await repo.recordSearch(cityCode,term);}catch(e){searchCounts.delete(key);throw e;}
   return json(res,200,{recorded:true});
  }
  if(m==='GET'&&p==='/api/v1/feed'){
   const type=url.searchParams.get('type')||'all',area=url.searchParams.get('area')||'全部地区',q=(url.searchParams.get('q')||'').trim();
   const cityCode=url.searchParams.get('cityCode')||'',districtCode=url.searchParams.get('districtCode')||'';geography.cityReference(cityCode,districtCode);
   const categoryId=url.searchParams.get('categoryId')||'';if(categoryId&&!require('../../miniprogram/utils/classification-contract').find(categoryId))fail(400,'INVALID_CATEGORY','分类标识无效');
   const rawPage=url.searchParams.get('page')||'1',rawSize=url.searchParams.get('pageSize')||'20';
   if(!require('../../miniprogram/utils/feed-query').allowed.includes(type)||q.length>80||area.length>80||
     !/^[1-9]\d{0,3}$/.test(rawPage)||!/^[1-9]\d{0,2}$/.test(rawSize))fail(400,'BAD_QUERY','筛选或分页参数无效');
   const page=Number(rawPage),pageSize=Number(rawSize),offset=(page-1)*pageSize;
   if(pageSize>50||offset>10000)fail(400,'BAD_PAGE','页码或单页数量超出范围');
   // Ask for one extra record to determine whether the next page exists. Do not expose unapproved content.
   const sort=url.searchParams.get('sort')||'latest';if(!['latest','price_low','price_high','recommended','popular','distance'].includes(sort))fail(400,'INVALID_SORT','排序方式无效');
   const filters=require('../../miniprogram/utils/search-filters'),rawDays=url.searchParams.get('days')||'0',rawRadius=url.searchParams.get('radiusKm')||'0';
   if(!/^\d{1,3}$/.test(rawDays)||!/^\d{1,3}$/.test(rawRadius)||!filters.validDays(Number(rawDays))||!filters.validRadius(Number(rawRadius)))fail(400,'INVALID_FILTER','时间或距离范围无效');
   const days=Number(rawDays),radiusKm=Number(rawRadius),needsLocation=sort==='distance'||radiusKm>0;
   if(needsLocation&&!filters.canLocate(type))fail(400,'DISTANCE_UNAVAILABLE','仅商家与可预约服务支持公开位置距离筛选');
   const origin=needsLocation?{latitude:geography.number(url.searchParams.get('latitude'),-90,90),longitude:geography.number(url.searchParams.get('longitude'),-180,180)}:{};
   const publicFlag=url.searchParams.get('publicOnly')||'0';if(!['0','1'].includes(publicFlag))fail(400,'INVALID_FILTER','公开位置筛选无效');
   const images=url.searchParams.get('images')??'all';if(!['all','with'].includes(images))fail(400,'INVALID_FILTER','图片条件无效');
   const channel=url.searchParams.get('channel')||'';
   if(channel&&!require('../../miniprogram/utils/discovery-channels').definitions.some(value=>value.id===channel))fail(400,'INVALID_CHANNEL','发现频道无效');
   let refinements;try{refinements=require('../../miniprogram/utils/discovery-refinements').normalize(url.searchParams.get('refinements')||{},channel||type,true);}catch(error){fail(400,'INVALID_REFINEMENTS',error.message);}
   const found=await repo.listFeed({type,channel,refinements,area,q,categoryId,cityCode,districtCode,limit:pageSize+1,offset,sort,days,radiusKm,images,publicOnly:publicFlag==='1',...origin,includeTest:testData(req)});
   return json(res,200,{items:found.slice(0,pageSize),pagination:{page,pageSize,hasMore:found.length>pageSize}});
  }
  if(m==='GET'&&/^\/api\/v1\/items\/[0-9a-f-]{36}$/i.test(p)){const item=await repo.getItem(p.split('/').at(-1),{includeTest:testData(req)});if(!item)fail(404,'NOT_FOUND','内容不存在或未通过审核');return json(res,200,{item});}
  // Product routes keep authentication and admin CSRF checks at the API boundary.
  if(p==='/api/v1/me/preferences'&&['GET','PUT'].includes(m)){
   const uid=await user(req);if(!repo.preferences)fail(503,'NOT_AVAILABLE','设置暂不可用');
   return json(res,200,m==='GET'?await repo.preferences(uid):await repo.savePreferences(uid,require('./privacy-repository').preferences(await body(req))));
  }
  if(p==='/api/v1/me/account-closure'&&m==='GET'){const uid=await user(req);if(!repo.closureReadiness)fail(503,'DATABASE_REQUIRED','此功能需要持久化数据库');return json(res,200,await repo.closureReadiness(uid));}
  if(p==='/api/v1/me/data-export'&&m==='GET'){const uid=await user(req);if(!repo.exportOwnData)fail(503,'DATABASE_REQUIRED','此功能需要持久化数据库');return json(res,200,await repo.exportOwnData(uid,url.searchParams.get('section')||'profile',url.searchParams.get('cursor')||null));}
  if(/^\/admin\/api\/privacy-requests\/[0-9a-f-]{36}\/execute-closure$/i.test(p)&&m==='POST'){const session=admin(req,true);if(!hasRole(session.role,'operator'))fail(403,'OPERATOR_REQUIRED','注销执行需要运营审核权限');if(!repo.executeAccountClosure)fail(503,'DATABASE_REQUIRED','此功能需要持久化数据库');return json(res,200,await repo.executeAccountClosure(p.split('/')[4],await body(req),session.role));}
  if(p==='/api/v1/me/privacy-requests'&&['GET','POST'].includes(m)){
   const uid=await user(req);if(!repo.privacyRequests)fail(503,'NOT_AVAILABLE','隐私请求暂不可用');
   if(m==='GET')return json(res,200,{items:await repo.privacyRequests(uid)});
   const v=await body(req);if(!['access','correction','deletion','closure'].includes(v.kind))fail(400,'INVALID_KIND','请求类型无效');
   if(v.kind==='closure'&&(v.closureAcknowledged!==true||v.consentVersion!==require('./account-lifecycle').CLOSURE_CONSENT))fail(400,'CLOSURE_CONSENT_REQUIRED','请单独确认账号注销范围和保留事项');
   return json(res,201,{request:await repo.createPrivacyRequest(uid,v.kind,text(v.reason,500,8),v.kind==='closure'?v.consentVersion:null)});
  }
  if(/^\/api\/v1\/me\/privacy-requests\/[0-9a-f-]{36}\/cancel$/i.test(p)&&m==='POST'){
   if(!await repo.cancelPrivacyRequest(await user(req),p.split('/')[5]))fail(409,'REQUEST_UNAVAILABLE','请求不属于你或状态已改变');return json(res,200,{ok:true});
  }
  if(p==='/admin/api/privacy-requests'&&m==='GET'){admin(req);return json(res,200,{items:await repo.privacyQueue()});}
  if(/^\/admin\/api\/privacy-requests\/[0-9a-f-]{36}$/i.test(p)){
   const id=p.split('/').at(-1);if(!uuid(id))fail(400,'INVALID_ID','请求标识无效');
   if(m==='GET'){admin(req);const item=await repo.privacyRequestForAdmin(id);if(!item)fail(404,'NOT_FOUND','请求不存在');return json(res,200,{item});}
   if(m==='POST'){admin(req,true);const v=await body(req);if(!['reviewing','responded','rejected'].includes(v.status)||!Number.isSafeInteger(v.revision)||v.revision<1)fail(400,'INVALID_STATUS','处理参数无效');
    if(!await repo.reviewPrivacyRequest(id,v.status,text(v.response,800,8),v.revision))fail(409,'STALE_REQUEST','请求状态已变化，请重新读取');return json(res,200,{ok:true});}
  }
  if(p==='/api/v1/me/draft'&&['GET','PUT','DELETE'].includes(m)){
   const uid=await user(req);if(!repo.accountDraft)fail(503,'NOT_AVAILABLE','账号草稿暂不可用');
   if(m==='GET')return json(res,200,await repo.accountDraft(uid));
   const v=await body(req);
   if(!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<0||v.expectedRevision>=2147483647)fail(400,'INVALID_REVISION','草稿版本无效');
   const payload=m==='DELETE'?null:require('./account-drafts').validateDraft(v.payload);
   return json(res,200,await repo.saveAccountDraft(uid,v.expectedRevision,payload));
  }
  if(p.startsWith('/api/v1/media/')&&m==='GET'){
   const id=p.split('/').at(-1);if(!uuid(id))fail(400,'INVALID_ID','图片标识无效');
   let uid=null;if(req.headers.authorization)uid=await user(req);
   const image=await repo.readContentImage?.(id,uid,!production&&url.searchParams.get('test')==='1');if(!image)fail(404,'IMAGE_UNAVAILABLE','图片不存在或尚未公开');
   res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(url.searchParams.get('size')==='thumb'?image.thumbnail:image.data);
  }
  if(p==='/api/v1/media'&&m==='POST'){
   const uid=await user(req);if(!repo.uploadContentImage)fail(503,'NOT_AVAILABLE','图片功能暂不可用');
   const image=await require('./upload-capacity').acceptUpload(async()=>{
    const upload=await readUpload(req);return repo.uploadContentImage(uid,upload.bytes);
   });return json(res,201,{image});
  }
  if(p.startsWith('/api/v1/me/media/')&&m==='DELETE'){
   const uid=await user(req),id=p.split('/').at(-1);if(!uuid(id))fail(400,'INVALID_ID','图片标识无效');
   if(!await repo.deleteContentImage?.(uid,id))fail(409,'IMAGE_IN_USE','图片已关联内容或无权删除');return json(res,200,{ok:true});
  }
  if(p==='/api/v1/me/profile'){
   const uid=await user(req);if(m==='GET')return json(res,200,await repo.profile?.(uid)||{id:uid,displayName:''});
   if(m==='PUT'){const v=require('./profile').profilePatch(await body(req));if(!repo.updateProfile)fail(503,'NOT_AVAILABLE','个人资料暂不可修改');await repo.updateProfile(uid,v);return json(res,200,{ok:true});}
  }
  if(p==='/api/v1/me/blocks'&&m==='GET')return json(res,200,{items:await repo.blockedUsers?.(await user(req))||[]});
  if(/^\/api\/v1\/me\/blocks\/[0-9a-f-]{36}$/i.test(p)&&m==='DELETE'){const uid=await user(req),id=p.split('/').at(-1);if(!uuid(id))fail(400,'INVALID_ID','用户标识无效');await repo.unblockUser?.(uid,id);return json(res,200,{ok:true});}
  if(/^\/api\/v1\/me\/contacts\/[0-9a-f-]{36}\/block$/i.test(p)&&['POST','DELETE'].includes(m)){
   if(!await repo.blockContact?.(await user(req),p.split('/')[5],m==='POST'))fail(404,'NOT_FOUND','无法处理此申请');return json(res,200,{ok:true});
  }
  if(p==='/api/v1/me/summary'&&m==='GET')return json(res,200,await repo.summary?.(await user(req))||{publications:0,bookings:0,saved:0,unread:0});
  if(p==='/api/v1/me/saved-state'&&m==='GET'){const uid=await user(req),ids=(url.searchParams.get('ids')||'').split(',').filter(Boolean);if(!ids.length||ids.length>50||ids.some(id=>!uuid(id)))fail(400,'INVALID_IDS','收藏核对每次需要1–50个有效信息编号');return json(res,200,{savedIds:repo.savedState?await repo.savedState(uid,ids):[]});}
  if(p==='/api/v1/me/saved'&&m==='GET'){
   const uid=await user(req),page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>500)fail(400,'INVALID_PAGE','页码无效');
   return json(res,200,await repo.savedItems?.(uid,(page-1)*20,testData(req))||{items:[],hasMore:false});
  }
  if(/^\/api\/v1\/items\/[0-9a-f-]{36}\/saved$/i.test(p)){
   const uid=await user(req),id=p.split('/')[4];
   if(m==='GET')return json(res,200,{saved:!!await repo.isSaved?.(uid,id)});
   if(['PUT','DELETE'].includes(m)){if(!await repo.saveItem?.(uid,id,m==='PUT',testData(req)))fail(404,'NOT_FOUND','内容暂不可用');return json(res,200,{saved:m==='PUT'});}
  }
  if(p==='/api/v1/me/notifications'&&m==='GET'){
   const uid=await user(req),page=Number(url.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>500)fail(400,'INVALID_PAGE','页码无效');
   return json(res,200,await repo.notifications?.(uid,(page-1)*20)||{items:[],unread:0});
  }
  if(p==='/api/v1/me/notifications/read'&&m==='POST'){
   const uid=await user(req),v=await body(req);if(v.id!==null&&!uuid(v.id))fail(400,'INVALID_ID','通知标识无效');
   await repo.readNotification?.(uid,v.id);return json(res,200,{ok:true});
  }
  if(p==='/api/v1/me/contacts'&&m==='GET'){const uid=await user(req),raw=url.searchParams.get('page')||'1';if(!/^[1-9]\d{0,2}$/.test(raw)||Number(raw)>500)fail(400,'INVALID_PAGE','联系记录页码无效');const rows=await repo.contactRequests?.(uid,{offset:(Number(raw)-1)*100,limit:101})||[];return json(res,200,{items:rows.slice(0,100),hasMore:rows.length>100,pendingCount:repo.pendingContactCount?await repo.pendingContactCount(uid):rows.filter(x=>x.status==='pending'&&!x.outgoing&&!x.blocked).length});}
  if(/^\/api\/v1\/items\/[0-9a-f-]{36}\/contact$/i.test(p)&&m==='POST'){
   const uid=await user(req),v=await body(req),id=p.split('/')[4];const item=await repo.requestContact?.(uid,id,text(v.message,300,4));
   if(!item)fail(409,'CONTACT_UNAVAILABLE','此内容暂不可联系或由你本人发布');return json(res,201,{request:item});
  }
  if(/^\/api\/v1\/me\/contacts\/[0-9a-f-]{36}$/i.test(p)&&m==='POST'){
   const uid=await user(req),v=await body(req);if(!['accept','reject','withdraw'].includes(v.action))fail(400,'INVALID_ACTION','操作无效');
   const response=v.action==='accept'?text(v.response,300,4):'';
   if(!await repo.respondContact?.(uid,p.split('/')[5],v.action,response))fail(409,'CONTACT_CHANGED','联系申请已变化或无权处理');return json(res,200,{ok:true});
  }
  if(/^\/api\/v1\/items\/[0-9a-f-]{36}\/(interaction|like|comments)$/i.test(p))fail(404,'PUBLIC_INTERACTIONS_CLOSED','公开点赞、评论和回复已关闭。');
  if(/^\/api\/v1\/me\/comments\/[0-9a-f-]{36}$/i.test(p)&&m==='DELETE'){
   if(!await repo.deleteComment?.(await user(req),p.split('/')[5]))fail(404,'NOT_FOUND','评论不存在或无权删除');return json(res,200,{ok:true});
  }
  if(/^\/admin\/api\/media\/[0-9a-f-]{36}$/i.test(p)&&m==='GET'){
   const session=admin(req);const image=await repo.contentImageForAdmin?.(p.split('/')[4],{qualificationOnly:!session.permissions.includes('operations')});if(!image)fail(404,'NOT_FOUND','图片不存在或当前角色无权读取');
   res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(url.searchParams.get('size')==='thumb'?image.thumbnail:image.data);
  }
  if(p==='/admin/api/comments'&&m==='GET'){admin(req);return json(res,200,{items:await repo.commentQueue?.()||[]});}
  if(p==='/admin/api/comments/review'&&m==='POST'){
   admin(req,true);const v=await body(req);if(!uuid(v.id)||v.status!=='rejected')fail(400,'INVALID_REVIEW','公开互动已关闭，历史留言仅支持拒绝处理。');
   if(!await repo.reviewComment?.(v.id,v.status,text(v.reason||'',300,v.status==='rejected'?4:0)))fail(409,'STALE_REVIEW','评论审核状态已变化');return json(res,200,{ok:true});
  }
  if(m==='GET'&&p==='/api/v1/me'){return json(res,200,{userId:await user(req)});}
  if(m==='POST'&&p==='/api/v1/auth/logout'){await user(req);await repo.revokeSession(sha256(req.headers.authorization.slice(7)));return json(res,200,{ok:true});}
  if(m==='POST'&&p==='/api/v1/publications'){const uid=await user(req);const input=await body(req);const v={...publication(input,await activeAreas()),...require('./product-repository').validatePublicationSubmission(input),isTest:testData(req)};if(!await canSubmit(v.type))fail(403,'CATEGORY_CLOSED','该分类暂未开放发布');return json(res,201,{publication:await repo.createPublication(uid,v)});}
  if(m==='GET'&&p==='/api/v1/me/publications'){return json(res,200,{items:await repo.myPublications(await user(req))});}
  if(m==='PUT'&&/^\/api\/v1\/me\/publications\/[0-9a-f-]{36}$/i.test(p)){
   const uid=await user(req),id=p.split('/')[5],input=await body(req);
   if(!uuid(id))fail(400,'INVALID_ID','信息编号无效');
   if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||input.expectedRevision>1000000)
    fail(400,'INVALID_REVISION','编辑版本号无效');
   const value={...publication(input,await activeAreas()),...require('./product-repository').publicationExtras(input,{validateForm:false}),replaceAttributes:Object.hasOwn(input,'attributes'),replaceImages:Object.hasOwn(input,'imageIds')};
   if(!await canSubmit(value.type))fail(403,'CATEGORY_CLOSED','该分类暂未开放编辑');
   const result=await repo.updatePublication(uid,id,value,input.expectedRevision);
   if(result?.error==='revision_conflict')fail(409,'PUBLICATION_CHANGED','内容已被其他操作更新，请重新打开编辑');
   if(!result)fail(404,'PUBLICATION_NOT_EDITABLE','内容不存在、无权修改或已结束');
   return json(res,200,{publication:result});
  }
  if(m==='POST'&&/^\/api\/v1\/me\/publications\/[0-9a-f-]{36}\/withdraw$/i.test(p)){
   const uid=await user(req),id=p.split('/')[5];
   if(!uuid(id))fail(400,'INVALID_ID','信息编号无效');
   const withdrawn=await repo.withdrawPublication(uid,id);
   if(!withdrawn)fail(404,'PUBLICATION_NOT_WITHDRAWABLE','记录不存在、无权撤回或状态已变化');
   return json(res,200,{ok:true,status:'closed'});
  }
  if(m==='POST'&&p==='/api/v1/merchant-applications'){const uid=await user(req);await repo.assertTrust?.(uid,'publish',{type:'merchant'});const v={...merchant(await body(req),await activeAreas()),...(testData(req)?{isTest:true}:{})};if(!await canSubmit('merchant'))fail(403,'CATEGORY_CLOSED','商家入驻已暂停');return json(res,201,{application:await repo.createMerchant(uid,v)});}
  if(m==='GET'&&p==='/api/v1/me/merchant-application'){return json(res,200,{application:await repo.myMerchant(await user(req))});}
  // Merchant activation requires an administrator's manual verification decision.
  if(m==='POST'&&/^\/api\/v1\/merchant-applications\/[0-9a-f-]{36}\/evidence$/i.test(p)){
   if(production)fail(503,'MERCHANT_EVIDENCE_NOT_READY','正式环境暂不收集资质资料，请联系平台进行线下核验');
   const uid=await user(req),aid=p.split('/')[4];if(!uuid(aid))fail(400,'INVALID_ID','申请编号错误');
   const updated=await repo.submitMerchantEvidence(uid,aid,evidence(await body(req)));
   if(!updated)fail(403,'APPLICATION_FORBIDDEN','无权提交或无法修改该申请');return json(res,200,{application:updated});
  }
  // The binary evidence endpoint is authenticated, private and deliberately outside public static routes.
  if(m==='POST'&&/^\/api\/v1\/merchant-applications\/[0-9a-f-]{36}\/license$/i.test(p)){
   if(production)fail(503,'LICENSE_UPLOAD_NOT_READY','正式环境证照上传尚未通过安全验收');
   const uid=await user(req),aid=p.split('/')[4];
   pruneExpired(uploadLimits,'until');if(uploadLimits.size>=2048&&!uploadLimits.has(uid))fail(429,'UPLOAD_RATE_LIMIT','上传流量繁忙，请稍后再试');
   const limit=uploadLimits.get(uid)||{count:0,until:Date.now()+15*60000};if(limit.until<=Date.now()){limit.count=0;limit.until=Date.now()+15*60000;}if(limit.count>=5)fail(429,'UPLOAD_RATE_LIMIT','上传太频繁，请稍后再试');uploadLimits.set(uid,limit);
   if(!await repo.mayUploadMerchantLicense(uid,aid))fail(403,'APPLICATION_FORBIDDEN','只能上传本人尚在审核阶段的申请材料');
   const upload=await readUpload(req);limit.count+=1;
   const fileId=crypto.randomUUID();await writePrivate(privateUploadDir,fileId,upload.bytes);
   let saved;
   try{saved=await repo.saveMerchantLicense(uid,aid,{fileId,contentType:upload.contentType,size:upload.bytes.length,sha256:sha256(upload.bytes)});}
   catch(e){await unlinkPrivate(privateUploadDir,fileId);throw e;}
   if(!saved){await unlinkPrivate(privateUploadDir,fileId);fail(409,'APPLICATION_STALE','申请状态发生变化，请刷新后重试');}
   if(saved.previousFileId){await unlinkPrivate(privateUploadDir,saved.previousFileId).catch(()=>console.error('[license-cleanup-failed]',saved.previousFileId));}
   return json(res,201,{file:{id:fileId,size:upload.bytes.length,uploaded:true}});
  }
  if(m==='GET'&&p==='/api/v1/me/merchants'){return json(res,200,{items:await repo.myManagedMerchants(await user(req))});}
  if(/^\/api\/v1\/merchants\/[0-9a-f-]{36}\/(services|bookings|members)$/i.test(p)){
   const uid=await user(req),parts=p.split('/'),mid=parts[4],resource=parts[5];if(!uuid(mid))fail(400,'INVALID_ID','编号错误');
   if(m==='GET'){
    const items=resource==='services'?await repo.myMerchantServices(uid,mid):resource==='bookings'?await repo.myMerchantBookings(uid,mid):await repo.merchantMembers(uid,mid);
    if(items===null)fail(403,'MERCHANT_FORBIDDEN','没有该商家的访问权限');return json(res,200,{items});
   }
   if(m==='POST'&&resource==='services'){
    await repo.assertTrust?.(uid,'publish',{type:'service'});
    if(!await canSubmit('service'))fail(403,'CATEGORY_CLOSED','服务项目发布已暂停');
    const owned=(await repo.myManagedMerchants(uid)).find(x=>x.id===mid);if(owned&&!(await activeAreas()).includes(owned.district))fail(403,'REGION_CLOSED','此地区暂不接收新的服务项目');
    const created=await repo.createMerchantService(uid,mid,service(await body(req)));if(!created)fail(403,'MERCHANT_FORBIDDEN','没有管理服务项目的权限');return json(res,201,{service:created});
   }
   if(m==='POST'&&resource==='members'){
    const v=await body(req);if(!uuid(v.userId)||!['manager','staff'].includes(v.role))fail(400,'INVALID_MEMBER','员工身份或角色无效');
    const updated=await repo.addMerchantMember(uid,mid,v.userId,v.role);if(updated===null)fail(403,'MERCHANT_FORBIDDEN','只有店主可以管理员工');if(!updated)fail(404,'USER_NOT_FOUND','用户不存在或不可更改店主角色');return json(res,200,{member:updated});
   }
  }
  // Merchant-controlled pause is separate from an administrator's disabled decision.
  // A paused service must pass manual review again before becoming visible.
  if(m==='POST'&&/^\/api\/v1\/merchants\/[0-9a-f-]{36}\/services\/[0-9a-f-]{36}\/action$/i.test(p)){
   const uid=await user(req),parts=p.split('/'),mid=parts[4],sid=parts[6];
   if(!uuid(mid)||!uuid(sid))fail(400,'INVALID_ID','服务编号无效');
   const v=await body(req);
   if(!['pause','resubmit'].includes(v.action))fail(400,'INVALID_ACTION','服务操作不允许');
   if(v.action==='resubmit'&&!await canSubmit('service'))fail(403,'CATEGORY_CLOSED','服务类目暂不接收重新提交');
   const result=await repo.changeMerchantServiceStatus(uid,mid,sid,v.action);
   if(result===null)fail(403,'MERCHANT_FORBIDDEN','只有本店店主或经理可以管理服务状态');
   if(!result)fail(409,'STALE_SERVICE','服务状态已变化，或该服务不属于当前商家');
   return json(res,200,{service:result});
  }
  if(m==='POST'&&/^\/api\/v1\/merchants\/[0-9a-f-]{36}\/members\/[0-9a-f-]{36}\/remove$/i.test(p)){
   const uid=await user(req),parts=p.split('/'),mid=parts[4],target=parts[6];if(!uuid(mid)||!uuid(target))fail(400,'INVALID_ID','编号错误');
   const result=await repo.removeMerchantMember(uid,mid,target);if(result===null)fail(403,'MERCHANT_FORBIDDEN','只有店主可以管理员工');if(!result)fail(409,'STALE_MEMBER','员工不存在或已移除');return json(res,200,{ok:true});
  }
  if(m==='PUT'&&/^\/api\/v1\/merchants\/[0-9a-f-]{36}\/services\/[0-9a-f-]{36}$/i.test(p)){
   const uid=await user(req),parts=p.split('/'),result=await repo.editMerchantService?.(uid,parts[4],parts[6],service(await body(req)));
   if(!result)fail(403,'MERCHANT_FORBIDDEN','无权修改或该服务不能由商家恢复');return json(res,200,{service:result});
  }
  if(m==='POST'&&/^\/api\/v1\/merchants\/[0-9a-f-]{36}\/bookings\/[0-9a-f-]{36}\/action$/i.test(p)){
   const uid=await user(req),parts=p.split('/'),mid=parts[4],bid=parts[6];if(!uuid(mid)||!uuid(bid))fail(400,'INVALID_ID','编号错误');
   const v=await body(req);if(!['confirm','decline','complete'].includes(v.action))fail(400,'INVALID_ACTION','预约操作不允许');
   const result=await repo.actOnMerchantBooking(uid,mid,bid,v.action);if(result===null)fail(403,'MERCHANT_FORBIDDEN','没有管理该商家的权限');if(!result)fail(409,'STALE_BOOKING','预约状态已变化或不属于该商家');return json(res,200,{booking:result});
  }
  if(m==='POST'&&p==='/api/v1/reports'){
   const uid=await user(req),v=report(await body(req));if(['user','message'].includes(v.targetType)){if(!await repo.extendedReportTarget?.(uid,v.targetType,v.targetId))fail(404,'NOT_FOUND','举报对象不属于你的联系记录');return json(res,201,{report:await repo.createReport(uid,v)});}const visible=await repo.getItem(v.targetId);if(!visible||(v.targetType==='service')!==(visible.kind==='service')||!await repo.publicReportTarget(v.targetType,v.targetId,repo.__publications))fail(404,'NOT_FOUND','举报目标不存在或不可见');
   return json(res,201,{report:await repo.createReport(uid,v)});
  }
  if(m==='GET'&&/^\/api\/v1\/services\/[0-9a-f-]{36}\/slots$/i.test(p)){
   const serviceId=p.split('/')[4],date=url.searchParams.get('date')||'';
   if(!validCalendarDate(date))fail(400,'INVALID_DATE','日期无效');
   const slots=await repo.availableSlots(serviceId,date);
   if(!slots)fail(404,'SERVICE_NOT_AVAILABLE','服务不存在或不可预约');
   return json(res,200,{serviceId,date,timezone:'Asia/Shanghai',slots});
  }
  if(m==='GET'&&p.startsWith('/api/v1/me/booking-submissions/')){
   const uid=await user(req);if(!repo.readBookingSubmission)fail(503,'NOT_AVAILABLE','预约核对暂不可用');
   const b=await repo.readBookingSubmission(uid,p.slice('/api/v1/me/booking-submissions/'.length));
   if(!b)fail(404,'BOOKING_SUBMISSION_NOT_FOUND','暂未查到本次申请，请稍后核对或重试原申请');
   if(b.rejected)return json(res,200,{rejected:true,clientKey:b.clientKey,errorCode:b.errorCode});
   return json(res,200,{booking:b,replayed:true});
  }
  if(m==='POST'&&p==='/api/v1/bookings'){const uid=await user(req);const v=booking(await body(req));const b=await repo.createBooking(uid,v);if(!b||b.error==='service_unavailable')fail(404,'SERVICE_NOT_AVAILABLE','该服务暂时不可预约');if(b.error==='existing_booking_different')fail(409,'EXISTING_BOOKING_DIFFERENT','该时段已有您的另一份预约，请查看我的预约');if(b.error==='slot_taken')fail(409,'SLOT_TAKEN','此时段已被其他预约占用，请重新选择');if(b.error==='slot_expired')fail(409,'SLOT_EXPIRED','该预约时间已失效，请重新选择时段');return json(res,b.replayed?200:201,{booking:b,replayed:!!b.replayed});}
  if(m==='GET'&&p==='/api/v1/me/bookings'){return json(res,200,{items:await repo.myBookings(await user(req))});}
  if(m==='POST'&&/^\/api\/v1\/bookings\/[0-9a-f-]{36}\/cancel$/i.test(p)){const uid=await user(req);const ok=await repo.cancelBooking(uid,p.split('/')[4]);if(!ok)fail(409,'CANNOT_CANCEL','不可取消或记录不存在');return json(res,200,{ok:true});}
  if(m==='POST'&&p==='/admin/api/login'){
   if(!adminPassword&&!verificationAdminPassword&&!superAdminPassword)fail(503,'ADMIN_NOT_CONFIGURED','未配置后台管理员');const key=clientAddress(req);
   if(adminLoginLimiter.blocked(key))fail(429,'TOO_MANY_ATTEMPTS','登录尝试过多');
   const v=await body(req),submitted=typeof v.password==='string'?v.password:'',role=v.role===undefined?'operator':v.role;
   if(!Object.hasOwn(adminPolicy.roles,role))fail(400,'INVALID_ADMIN_ROLE','管理角色无效');
   const password={operator:adminPassword,verifier:verificationAdminPassword,superadmin:superAdminPassword}[role];
   if(!password)fail(503,'ADMIN_ROLE_NOT_CONFIGURED','该管理角色尚未配置');
   const actual=crypto.createHash('sha256').update(submitted).digest(),expected=crypto.createHash('sha256').update(password).digest();
   if(!crypto.timingSafeEqual(actual,expected)){adminLoginLimiter.failure(key);fail(401,'WRONG_PASSWORD','管理员密码错误');}
   // Enforce a bounded session map and prune expired sessions first.
   pruneExpired(adminSessions,'exp');if(adminSessions.size>=2048)fail(429,'TOO_MANY_SESSIONS','管理会话数量已达上限');
   adminLoginLimiter.success(key);const token=crypto.randomBytes(32).toString('base64url'),csrf=crypto.randomBytes(24).toString('base64url');adminSessions.set(token,{csrf,role,permissions:adminPolicy.permissionsFor(role,roleGrants[role]),auditId:crypto.randomUUID(),exp:Date.now()+2*3600e3});return json(res,200,{ok:true,csrf,role},{'Set-Cookie':`citylife_admin=${token}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=7200${production?'; Secure':''}`});
  }
  if(m==='GET'&&p==='/admin/api/session'){const s=admin(req);return json(res,200,{ok:true,csrf:s.csrf,role:s.role,permissions:s.permissions});}
  if(m==='POST'&&p==='/admin/api/logout'){admin(req,true);adminSessions.delete(cookie(req));return json(res,200,{ok:true},{'Set-Cookie':`citylife_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0${production?'; Secure':''}`});}
  if(m==='GET'&&/^\/admin\/api\/workbench\/[a-z]+\/[0-9a-f-]{36}$/i.test(p)){const session=admin(req);return json(res,200,await repo.reviewTask(p.split('/')[4],p.split('/')[5],session.role,session.permissions));}
  if(m==='POST'&&p==='/admin/api/operations/run'){const session=admin(req,true);if(!hasRole(session.role,'operator'))fail(403,'OPERATOR_REQUIRED','重试维护需要运营审核权限');if(!repo.runMaintenance)fail(503,'DATABASE_REQUIRED','此功能需要持久化数据库');return json(res,200,await repo.runMaintenance());}
  if(m==='GET'&&p==='/admin/api/operations/health'){admin(req);if(!repo.operationsHealth)fail(503,'DATABASE_REQUIRED','此功能需要持久化数据库');return json(res,200,await repo.operationsHealth());}
  if(m==='GET'&&p==='/admin/api/workbench'){admin(req);if(!repo.reviewWorkbench)fail(503,'DATABASE_REQUIRED','统一待办需要持久化数据库');return json(res,200,await repo.reviewWorkbench({...require('./review-workbench').queryOptions(url.searchParams),role:admin(req).role,permissions:admin(req).permissions}));}
  if(m==='POST'&&p==='/admin/api/emergency-remove'){const session=admin(req,true),v=await body(req);if(!uuid(v.id))fail(400,'INVALID_ID','信息编号无效');const reason=require('./trust-policy').note(v.reason);return json(res,200,await repo.emergencyRemove(v.id,reason,session.role));}
  if(m==='GET'&&p==='/admin/api/queue'){
   const session=admin(req),r=await repo.queue(),operator=session.permissions.includes('operations');
   if(repo.maskMerchantQueue)r.merchantApplications=await repo.maskMerchantQueue(r.merchantApplications||[],session.role);
   else if(!session.permissions.includes('qualification'))r.merchantApplications=(r.merchantApplications||[]).map(({registrationCode,licenseHolder,evidenceReference,licenseFileId,...safe})=>({...safe,evidenceRestricted:true}));
   if(!operator)r.publications=(r.publications||[]).filter(x=>x.type==='housing');
   let reports=operator?await repo.reportsQueue():[];
   if(!session.permissions.includes('evidence'))reports=reports.map(({description,...safe})=>safe);
   return json(res,200,{...r,services:operator?await repo.serviceQueue():[],reports});
  }
  if(m==='GET'&&/^\/admin\/api\/licenses\/[0-9a-f-]{36}$/i.test(p)){
   admin(req);const fileId=p.split('/')[4],meta=await repo.merchantLicenseForAdmin(fileId);
   if(!meta)fail(404,'NOT_FOUND','没有该材料');await repo.assertMerchantVerifier?.(meta.applicationId,admin(req).role);
   let bytes;try{bytes=await readPrivate(privateUploadDir,fileId);}catch(e){if(e.code==='ENOENT')fail(404,'NOT_FOUND','材料文件缺失');throw e;}
   if(sha256(bytes)!==meta.sha256)fail(409,'FILE_INTEGRITY_ERROR','材料校验失败');
   res.writeHead(200,{'Content-Type':meta.contentType,'Content-Length':bytes.length,'Content-Disposition':`attachment; filename="license-${fileId}.${meta.contentType==='image/png'?'png':'jpg'}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'"});return res.end(bytes);
  }
  // City operators manage region names and category switches, not release-gated job permits.
  if(m==='GET'&&p==='/admin/api/catalog'){admin(req);return json(res,200,{regions:await allRegions(),categories:await repo.listCategories()});}
  if(m==='POST'&&p==='/admin/api/regions'){
   admin(req,true);await allRegions();const v=await body(req);if(!validRegionName(v.name))fail(400,'INVALID_REGION','区域名需为 2-40 字且不能包含控制字符');
   const created=await repo.addRegion(v.name);if(!created)fail(409,'REGION_EXISTS','地区已存在');return json(res,201,{region:created});
  }
  if(m==='POST'&&p==='/admin/api/regions/status'){
   admin(req,true);const v=await body(req);if(!validRegionName(v.name)||typeof v.enabled!=='boolean')fail(400,'INVALID_REGION','区域操作参数无效');
   const updated=await repo.setRegionEnabled(v.name,v.enabled);if(updated===null)fail(404,'REGION_NOT_FOUND','地区不存在');if(updated===false)fail(409,'LAST_REGION','必须保留至少一个启用地区');return json(res,200,{region:updated});
  }
  if(m==='POST'&&p==='/admin/api/categories/status'){
   admin(req,true);const v=await body(req);if(!['merchant','housing','used','service','community'].includes(v.id)||typeof v.enabled!=='boolean')fail(403,'CATEGORY_LOCKED','此分类暂不可由后台开放');
   const updated=await repo.setCategoryEnabled(v.id,v.enabled);if(!updated)fail(409,'CATEGORY_UPDATE_FAILED','分类更新失败');return json(res,200,{category:updated});
  }
  if(m==='GET'&&p==='/admin/api/stats'){admin(req);return json(res,200,await repo.stats());}
  if(m==='POST'&&p==='/admin/api/approve-merchant'){
   admin(req,true);const v=await body(req);if(!uuid(v.id)||v.manuallyVerified!==true)fail(400,'VERIFICATION_REQUIRED','必须先在线下完成主体资质核验');
   await repo.assertMerchantVerifier?.(v.id,admin(req).role);const note=text(v.note||'',500,8);const activated=await repo.approveMerchantApplication(v.id,note,true);
   if(!activated)fail(409,'APPLICATION_NOT_READY','申请尚未补全资料、未进入核验中或已被处理');return json(res,200,{merchant:activated});
  }
  if(m==='POST'&&p==='/admin/api/review-service'){
   admin(req,true);const v=await body(req);if(!uuid(v.id)||!['published','disabled'].includes(v.status))fail(400,'INVALID_STATUS','服务审核参数无效');
   if(!await repo.reviewService(v.id,v.status))fail(409,'STALE_REVIEW','服务审核状态已变化');return json(res,200,{ok:true});
  }
  if(m==='POST'&&p==='/admin/api/review-report'){
   admin(req,true);const v=await body(req);if(!uuid(v.id)||!['dismissed','removed'].includes(v.decision))fail(400,'INVALID_STATUS','举报处理参数无效');
   const note=text(v.note||'',500,5);if(!await repo.reportDecision(v.id,v.decision,note,repo.__publications))fail(409,'STALE_REVIEW','举报已被处理');return json(res,200,{ok:true});
  }
  if(m==='POST'&&p==='/admin/api/review'){admin(req,true);const v=await body(req);const id=text(v.id,36,36);if(!/^[0-9a-f-]{36}$/i.test(id))fail(400,'INVALID_ID','记录标识无效');const reason=text(v.reason||'',500);let ok=false;
   if(v.target==='publication'&&['published','rejected'].includes(v.status)){if(v.status==='published')await repo.assertContentReview?.(id,v);ok=await repo.reviewPublication(id,v.status,reason,v.expectedRevision??null);}
   else if(v.target==='merchant'&&['in_review','needs_documents','rejected'].includes(v.status))ok=await repo.reviewMerchant(id,v.status,reason);
   else fail(400,'INVALID_STATUS','审核动作不允许');if(!ok)fail(409,'STALE_REVIEW','审核状态已变化或记录不存在');if(v.target==='publication'&&v.status==='published')await repo.recordContentChecks?.(id,v,admin(req).role);return json(res,200,{ok:true});
  }
  fail(404,'NOT_FOUND','接口不存在');
 }catch(err){if(err.code==='P0001'&&['ACCOUNT_INACTIVE','ACCOUNT_CLOSED'].includes(err.message))err=new ApiError(403,err.message,'账号已关闭或受限，请重新登录确认状态');if(!res.headersSent){if(!(err instanceof ApiError))console.error('[api-error]',{name:err.name,code:/^[A-Z0-9_]{1,40}$/.test(err.code||'')?err.code:'INTERNAL_ERROR'});json(res,err.status||500,{error:err.code||'SERVER_ERROR',message:err instanceof ApiError?err.message:'服务器内部错误'});}else res.end();}}
 const server=http.createServer(handler);
 // Bound slow connections; a reverse proxy should enforce its own upload and IP limits.
 server.requestTimeout=15000;server.headersTimeout=20000;server.keepAliveTimeout=5000;
 return server;
}
if(require.main===module){
 const production=process.env.NODE_ENV==='production',driver=process.env.DATA_DRIVER||'postgres';
 const {validateDeployment}=require('./deployment-check');
 const deployment=validateDeployment(process.env,undefined,{requireProduction:process.argv.includes('--production')});
 if(!deployment.ok){console.error('Deployment configuration blocked:',deployment.errors.join(','));process.exit(1);}
 const repo=driver==='memory'?createMemoryRepository():require('./pg-repository').createPgRepository(process.env.DATABASE_URL);
 const areas=(process.env.SERVICE_AREAS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3101);
 const app=createApp({repo,areas,allowDevLogin:process.env.ALLOW_DEV_LOGIN==='true',adminPassword:process.env.ADMIN_PASSWORD||'',wechatAppId:process.env.WECHAT_APPID||'',wechatSecret:process.env.WECHAT_SECRET||'',privateUploadDir:process.env.PRIVATE_UPLOAD_DIR||path.resolve(__dirname,'../../private-data'),verificationAdminPassword:process.env.VERIFICATION_ADMIN_PASSWORD||'',superAdminPassword:process.env.SUPER_ADMIN_PASSWORD||'',operatorPermissions:(process.env.OPERATOR_ADMIN_PERMISSIONS||'').split(',').filter(Boolean),verifierPermissions:(process.env.VERIFIER_ADMIN_PERMISSIONS||'').split(',').filter(Boolean),phoneEncryptionKey:process.env.PHONE_ENCRYPTION_KEY||'',platformPublishApproved:process.env.PLATFORM_PUBLISH_APPROVED==='true',platformContactApproved:process.env.PLATFORM_CONTACT_APPROVED==='true',trustedProxyIps:process.env.TRUSTED_PROXY_IPS||'',tencentMapKey:process.env.TENCENT_MAP_KEY||'',legalConfig:{operatorName:process.env.PLATFORM_OPERATOR_NAME,contactEmail:process.env.PRIVACY_CONTACT_EMAIL},production});
 let stopReminders=async()=>{},stopMaintenance=async()=>{};
 (async()=>{if(driver==='postgres')await repo.verifySchema();await repo.seedRegions(areas);
  app.listen(port,host,()=>{
   if(driver==='postgres'){stopReminders=require('./expiry-reminders').startExpiryReminders(repo);stopMaintenance=require('./maintenance').startMaintenance(repo);}
   console.log(`City Life API ${driver} listening at http://${host}:${port} (reverse proxy HTTPS for deployment)`);
  });
 })().catch(async e=>{console.error('Startup blocked:',e.message);await repo.close().catch(()=>{});process.exitCode=1;});
 const {createGracefulShutdown}=require('./graceful-shutdown');
 const {stop}=createGracefulShutdown(app,repo);
 for(const signal of ['SIGINT','SIGTERM']){
  process.once(signal,()=>{Promise.all([stopReminders(),stopMaintenance()]).then(()=>stop()).catch(e=>{console.error('Shutdown failed:',e.message);process.exitCode=1;});});
 }
}
module.exports={createApp};
