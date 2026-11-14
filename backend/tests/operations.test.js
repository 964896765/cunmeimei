'use strict';
const {acceptedFixtureRequest}=require('./helpers/publication-confirmation');
const {residentFields}=require('./helpers/resident-fields');
const test=require('node:test');const assert=require('node:assert/strict');
const {createApp}=require('../src/server');const {createMemoryRepository}=require('../src/memory-repository');
async function setup(t){
 const repo=createMemoryRepository();const app=createApp({repo,areas:['中心街道'],superAdminPassword:'test-strong-admin-password',allowDevLogin:true});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
 const base='http://127.0.0.1:'+app.address().port;
 async function api(p,method='GET',payload,token='',cookie='',csrf=''){
  const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:payload===undefined?undefined:JSON.stringify(acceptedFixtureRequest(p,method,payload))});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 async function auth(name){const r=await api('/api/v1/dev/login','POST',{devUser:name});assert.equal(r.status,200);return r.data;}
 const adminLogin=await api('/admin/api/login','POST',{role:'superadmin',password:'test-strong-admin-password'});
 return {api,auth,repo,cookie:adminLogin.cookie,csrf:adminLogin.data.csrf};
}
test('merchant review -> scoped staff -> service moderation -> bookings and reports',async t=>{
 const {api,auth,cookie,csrf}=await setup(t);
 const owner=await auth('owner'),staff=await auth('staff'),other=await auth('other');
 const apply=await api('/api/v1/merchant-applications','POST',{name:'云间维修服务',category:'维修',district:'中心街道'},owner.token);
 assert.equal(apply.status,201);const aid=apply.data.application.id;
 assert.equal((await api('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'线下核验执照原件'},'',cookie,csrf)).status,409);
 assert.equal((await api(`/api/v1/merchant-applications/${aid}/evidence`,'POST',{registrationCode:'91441900MA12345678',licenseHolder:'甲乙服务有限公司',evidenceReference:'offline-review-ticket-123'},other.token)).status,403);
 assert.equal((await api(`/api/v1/merchant-applications/${aid}/evidence`,'POST',{registrationCode:'91441900MA12345678',licenseHolder:'甲乙服务有限公司',evidenceReference:'offline-review-ticket-123'},owner.token)).status,200);
 assert.equal((await api('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'确认'},'',cookie,csrf)).status,400);
 assert.equal((await api('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'线下核验执照原件'},'',cookie)).status,403);
 const approved=await api('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'线下核验执照原件'},'',cookie,csrf);assert.equal(approved.status,200);const mid=approved.data.merchant.id;
 assert.equal((await api('/admin/api/approve-merchant','POST',{id:aid,manuallyVerified:true,note:'再次核验不允许通过'},'',cookie,csrf)).status,409);
 assert.equal((await api('/api/v1/me/merchants','GET',undefined,owner.token)).data.items[0].role,'owner');
 assert.equal((await api('/api/v1/me/merchants','GET',undefined,other.token)).data.items.length,0);
 const createPath=`/api/v1/merchants/${mid}/services`;
 assert.equal((await api(createPath,'POST',{title:'家庭电工上门维修',description:'测试用上门电路排查，不含真实付款',price:'面议'},other.token)).status,403);
 const service=await api(createPath,'POST',{title:'家庭电工上门维修',description:'测试用上门电路排查，不含真实付款',price:'面议'},owner.token);assert.equal(service.status,201);const sid=service.data.service.id;
 assert.equal(service.data.service.status,'pending_review');
 assert.equal((await api('/api/v1/feed?type=service')).data.items.length,0);
 assert.equal((await api('/admin/api/queue','GET',undefined,'',cookie)).data.services.length,1);
 assert.equal((await api('/admin/api/review-service','POST',{id:sid,status:'published'},'',cookie,csrf)).status,200);
 assert.equal((await api('/api/v1/items/'+sid)).status,200);
 const memberPath=`/api/v1/merchants/${mid}/members`;
 assert.equal((await api(memberPath,'POST',{userId:other.userId,role:'owner'},owner.token)).status,400);
 assert.equal((await api(memberPath,'POST',{userId:staff.userId,role:'staff'},other.token)).status,403);
 assert.equal((await api(memberPath,'POST',{userId:staff.userId,role:'staff'},owner.token)).status,200);
 assert.equal((await api(createPath,'POST',{title:'店员不得发服务',description:'应被 RBAC 阻止的服务创建请求',price:'0'},staff.token)).status,403);
 const book=await api('/api/v1/bookings','POST',{serviceId:sid,date:'2099-11-01',time:'10:00',remark:'需要换插座'},other.token);assert.equal(book.status,201);const bid=book.data.booking.id;
 assert.equal((await api(`/api/v1/merchants/${mid}/bookings`,'GET',undefined,other.token)).status,403);
 assert.equal((await api(`/api/v1/merchants/${mid}/bookings`,'GET',undefined,staff.token)).data.items.length,1);
 const act=`/api/v1/merchants/${mid}/bookings/${bid}/action`;
 assert.equal((await api(act,'POST',{action:'complete'},staff.token)).status,409,'must confirm before completion');
 assert.equal((await api(act,'POST',{action:'confirm'},staff.token)).status,200);
 assert.equal((await api('/api/v1/bookings/'+bid+'/cancel','POST',{},other.token)).status,409);
 assert.equal((await api(act,'POST',{action:'complete'},owner.token)).status,200);
 assert.equal((await api(act,'POST',{action:'complete'},owner.token)).status,409);
 const rpt=await api('/api/v1/reports','POST',{targetType:'service',targetId:sid,reason:'false_info',description:'描述不实，需要管理员调查'},other.token);assert.equal(rpt.status,201);
 assert.equal((await api('/admin/api/queue','GET',undefined,'',cookie)).data.reports.length,1);
 assert.equal((await api('/admin/api/review-report','POST',{id:rpt.data.report.id,decision:'removed',note:'调查确认违规'},'',cookie,csrf)).status,200);
 assert.equal((await api('/api/v1/items/'+sid)).status,404);
 assert.equal((await api('/api/v1/reports','POST',{targetType:'service',targetId:sid,reason:'spam'},other.token)).status,404);
 assert.equal((await api(memberPath,'GET',undefined,staff.token)).status,403);
 assert.equal((await api(memberPath+'/'+staff.userId+'/remove','POST',{},owner.token)).status,200);
 assert.equal((await api(`/api/v1/merchants/${mid}/bookings`,'GET',undefined,staff.token)).status,403);
});
test('cross-merchant isolation and publication reports do not leak pending content',async t=>{
 const {api,auth,cookie,csrf}=await setup(t);
 const a=await auth('owner-A'),b=await auth('owner-B'),visitor=await auth('visitor-C');
 async function approvedOwner(owner,registration){
  const r=await api('/api/v1/merchant-applications','POST',{name:'测试商家 '+registration,category:'生活服务',district:'中心街道'},owner.token);const id=r.data.application.id;
  await api(`/api/v1/merchant-applications/${id}/evidence`,'POST',{registrationCode:'91441900MA'+registration+'12345',licenseHolder:'核验测试主体',evidenceReference:'offline-evidence-'+registration},owner.token);
  const result=await api('/admin/api/approve-merchant','POST',{id,manuallyVerified:true,note:'人工检查登记主体 '+registration},'',cookie,csrf);assert.equal(result.status,200);return result.data.merchant.id;
 }
 const aId=await approvedOwner(a,'AAAA'),bId=await approvedOwner(b,'BBBB');
 assert.equal((await api(`/api/v1/merchants/${bId}/services`,'GET',undefined,a.token)).status,403);
 assert.equal((await api(`/api/v1/merchants/${bId}/bookings`,'GET',undefined,a.token)).status,403);
 assert.equal((await api(`/api/v1/merchants/${bId}/members`,'GET',undefined,a.token)).status,403);
 assert.equal((await api(`/api/v1/merchants/${bId}/members`,'POST',{userId:visitor.userId,role:'staff'},a.token)).status,403);
 const pub=await api('/api/v1/publications','POST',{...residentFields(),title:'出售闲置电动车',type:'used',detail:'个人用车正常，无需立即转账',district:'中心街道',price:'500'},a.token);assert.equal(pub.status,201);
 const pid=pub.data.publication.id;
 assert.equal((await api('/api/v1/reports','POST',{targetType:'publication',targetId:pid,reason:'spam'},visitor.token)).status,404,'no reporting invisible pending data');
 assert.equal((await api('/admin/api/review','POST',{target:'publication',id:pid,status:'published',reason:''},'',cookie,csrf)).status,200);
 const reported=await api('/api/v1/reports','POST',{targetType:'publication',targetId:pid,reason:'spam'},visitor.token);assert.equal(reported.status,201);
 const reportedAgain=await api('/api/v1/reports','POST',{targetType:'publication',targetId:pid,reason:'false_info'},visitor.token);assert.equal(reportedAgain.data.report.id,reported.data.report.id,'one pending report per user per target');
 assert.equal((await api('/admin/api/review-report','POST',{id:reported.data.report.id,decision:'dismissed',note:'信息无明显异常'},'',cookie,csrf)).status,200);
 assert.equal((await api('/api/v1/items/'+pid)).status,200,'dismissed report must not remove visible item');
 assert.equal((await api(`/api/v1/merchants/${aId}/members`,'GET',undefined,a.token)).data.items[0].role,'owner');
});
