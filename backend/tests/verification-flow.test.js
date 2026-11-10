'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function client(){let definition,current='owner',fail=false;const calls=[],routes=[],api={request:async(method,url,data)=>{calls.push({method,url,data});if(fail)throw Error('provider failed');return {phoneVerified:true,identityProviderAvailable:false,actions:[],appeals:[]};}},tabs={context:()=>current};const wx={redirectTo:v=>routes.push(v.url),navigateBack:()=>routes.push('back')};const context={Page:v=>definition=v,wx,require:n=>n.endsWith('/api')?api:n.endsWith('/tab-bar')?tabs:require('../../miniprogram/utils/'+n.split('/').pop())};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/verification/index.js'),'utf8'),context);const page={data:structuredClone(definition.data),setData:v=>Object.assign(page.data,structuredClone(v))};for(const [k,v]of Object.entries(definition))if(typeof v==='function')page[k]=v.bind(page);page.onLoad({categoryId:'C04G01S01'});page.setData({status:{phoneProviderAvailable:true,phoneVerified:false}});return {page,calls,routes,api,fail:()=>fail=true,switchOwner:()=>current='another'};}
test('phone authorization submits only WeChat code and returns directly to the selected project form',async()=>{const c=client();await c.page.authorizePhone({detail:{code:'provider-one-time-code'}});assert.deepEqual(JSON.parse(JSON.stringify(c.calls[0].data)),{code:'provider-one-time-code'});assert.deepEqual(c.routes,['/pages/publish-form/index?categoryId=C04G01S01']);assert.equal(c.page.data.projectName,'二手手机');assert.equal(c.page.data.status.identityProviderAvailable,false);});
test('denial, unavailable service, provider error and account switch cannot invent verification or redirect',async()=>{
 const denied=client();await denied.page.authorizePhone({detail:{}});assert.equal(denied.calls.length,0);assert.equal(denied.routes.length,0);assert.equal(denied.page.data.status.phoneVerified,false);
 const unavailable=client();unavailable.page.setData({status:{phoneProviderAvailable:false}});await unavailable.page.authorizePhone({detail:{code:'not-used'}});assert.equal(unavailable.calls.length,0);
 const failed=client();failed.fail();await failed.page.authorizePhone({detail:{code:'bad-code'}});assert.equal(failed.routes.length,0);assert.equal(failed.page.data.status.phoneVerified,false);assert.equal(failed.page.data.projectName,'二手手机');assert.match(failed.page.data.error,/provider/);
 const stale=client();let finish;stale.api.request=()=>new Promise(r=>finish=r);const pending=stale.page.authorizePhone({detail:{code:'late-code'}});stale.switchOwner();finish({});await pending;assert.equal(stale.routes.length,0);
});

test('verification successes never offer an appeal; only eligible restrictions do',async()=>{
 const c=client();
 c.api.request=async()=>({phoneVerified:true,actions:[
  {id:'phone',action:'phone_usage_verified'},
  {id:'qualification',action:'qualification_verified'},
  {id:'risk',action:'risk_suspicious'},
  {id:'revoked',action:'qualification_revoked'}
 ],appeals:[]});
 await c.page.refresh();
 assert.deepEqual(c.page.data.actions.map(a=>a.id),['risk','revoked']);
 assert.equal(c.page.data.status.phoneVerified,true);
});
