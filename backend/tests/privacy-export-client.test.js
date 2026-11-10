'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup({switchDuringExport=false,cancelConsent=false,cancelShare=false,cleanupFails=false}={}){
 let owner='owner-A';const requests=[],files=new Map(),shares=[],modals=[];
 const page={disposed:false,settingsVersion:1,data:{mode:'privacy',settingsSection:'data',settingsBusy:false,requestKindIndex:3,requestText:'本人申请注销并确认必要记录保留范围',preferences:{}},setData(patch){Object.assign(this.data,patch);}};
 const api={hasSession:()=>true,request:async(method,route,payload)=>{
  requests.push({method,route,payload});
  if(route==='/api/v1/me/account-closure')return {blockers:[],notice:'注销后不能继续登录，必要账本及审计保留',consentVersion:'account-closure-v1'};
  if(route==='/api/v1/me/preferences')return {};
  if(route==='/api/v1/me/privacy-requests')return {items:[]};
  if(route.startsWith('/api/v1/me/data-export?')){if(switchDuringExport)owner='owner-B';return {items:[{id:'owned-record',body:'本人数据'}],nextCursor:null};}
  throw Error('Unexpected request '+route);
 }};
 const wx={env:{USER_DATA_PATH:'/user-data'},getFileSystemManager:()=>({writeFile:({filePath,data,success})=>{files.set(filePath,data);success();},appendFile:({filePath,data,success})=>{files.set(filePath,(files.get(filePath)||'')+data);success();},unlink:({filePath,success,fail})=>{if(cleanupFails){fail();return;}files.delete(filePath);success();}}),showModal:options=>{modals.push(options);options.success({confirm:!cancelConsent});},shareFileMessage:options=>{shares.push({text:files.get(options.filePath),path:options.filePath});if(cancelShare)options.fail({errMsg:'用户取消保存'});else options.success();}};
 const sandbox={module:{exports:{}},require:name=>({'./api':api,'./theme':{store(){},apply(){}},'./tab-bar':{context:()=>owner}}[name]),wx,console,Promise};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/privacy-settings.js'),'utf8'),sandbox);
 return {ui:sandbox.module.exports,page,requests,files,shares,modals};
}
test('account closure is submitted only after a separate consent dialog',async()=>{
 const {ui,page,requests,modals}=setup();await ui.submitPrivacyRequest.call(page);const sent=requests.find(x=>x.method==='POST');assert.equal(sent.payload.kind,'closure');assert.equal(sent.payload.closureAcknowledged,true);assert.equal(sent.payload.consentVersion,'account-closure-v1');assert.equal(modals[0].title,'单独确认账号注销');
 const cancelled=setup({cancelConsent:true});await cancelled.ui.submitPrivacyRequest.call(cancelled.page);assert.equal(cancelled.requests.filter(x=>x.method==='POST').length,0);assert.equal(cancelled.page.data.settingsBusy,false);
});
test('export collects only requested own-data sections and always removes the temporary file',async()=>{
 for(const cancelShare of [false,true]){
  const {ui,page,requests,files,shares}=setup({cancelShare});await ui.exportPersonalData.call(page);assert.equal(shares.length,1);assert.equal(requests.length,25);for(const section of ['business_cases','business_case_events','industry_service_links'])assert.ok(shares[0].text.includes('"section":"'+section+'"'));assert.ok(shares[0].text.includes('"section":"bookings"'));assert.ok(shares[0].text.includes('"section":"booking_submissions"'));assert.ok(shares[0].text.includes('本人数据'));assert.ok(shares[0].path.startsWith('/user-data/personal-data-'));assert.equal(files.size,0);assert.equal(page.data.settingsBusy,false);if(cancelShare)assert.ok(page.data.settingsError.includes('取消'));
 }
});
test('switching accounts during export prevents both file sharing and late page updates',async()=>{
 const {ui,page,files,shares,requests}=setup({switchDuringExport:true});await ui.exportPersonalData.call(page);assert.equal(shares.length,0);assert.equal(files.size,0);assert.equal(requests.length,1);assert.equal(page.data.settingsError,'');
});
test('failed native file cleanup is visible to the current account',async()=>{
 const {ui,page}=setup({cleanupFails:true});await ui.exportPersonalData.call(page);assert.ok(page.data.settingsError.includes('未能清理'));assert.equal(page.data.settingsBusy,false);
});
