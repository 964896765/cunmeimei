'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const workflows=require('../../miniprogram/utils/industry-workflows'),preview=require('../../miniprogram/utils/industry-preview');
function client(){let definition;const writes=[],store=new Map(),wx={getStorageSync:k=>k==='city_life_user_id'?'owner-a':store.get(k),setStorageSync:(k,v)=>store.set(k,v),removeStorageSync:k=>store.delete(k),enableAlertBeforeUnload(){},disableAlertBeforeUnload(){},pageScrollTo(){},showToast(){}};
 const flow={owner:()=> 'owner-a',write:async(page,method,url,body)=>{writes.push({method,url,body});return {live:true,result:{}};},pending:()=>null,confirm:async()=>true};
 const api={hasSession:()=>true,privateImage:async id=>'private:'+id,showError:e=>{throw e;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../miniprogram/pages/industry/index.js'),'utf8'),{Page:v=>definition=v,wx,require:name=>name.endsWith('/api')?api:name.endsWith('/workflow-client')?flow:name.endsWith('/theme')?{apply(){}}:require('../../miniprogram/utils/'+name.split('/').pop())});
 const page={data:structuredClone(definition.data),version:1,setData(v){for(const[k,value]of Object.entries(v)){let target=this.data;const keys=k.split('.');while(keys.length>1)target=target[keys.shift()];target[keys[0]]=structuredClone(value);}}};for(const[k,v]of Object.entries(definition))if(typeof v==='function')page[k]=v.bind(page);
 const workflow=workflows.workflow('C08G01S04');page.setData({mode:'form',workflow,areas:['石排镇'],clientKey:'industry_preview_test',form:{title:'志愿服务真实测试',detail:'请根据实际安排确认服务的时间和场所。',price:'免费',cityCode:'440100',districtCode:'440106',district:'石排镇',fields:{topic:'志愿服务',scope:'社区公开场所',conditions:'成年人自愿参加',noFundraising:true},imageIds:[]}});return {page,writes,wx,api,flow};
}
test('industry submission requires preview of the exact current payload plus current notice consent',async()=>{
 const s=client();await s.page.save({currentTarget:{dataset:{action:'submit'}}});assert.equal(s.writes.length,0);
 assert.equal(preview.error(s.page.data.workflow,s.page.data.form,s.page.data.areas),'');await s.page.previewForm();assert.equal(s.page.data.previewing,true);assert.equal(s.page.data.previewFields.length,4);
 s.page.publicationConsentChanged({detail:{consent:require('./helpers/publication-confirmation').acceptedConsent()}});await s.page.save({currentTarget:{dataset:{action:'submit'}}});assert.equal(s.writes.length,1);
 s.page.data.form.title='预览后改变内容';await s.page.save({currentTarget:{dataset:{action:'submit'}}});assert.equal(s.writes.length,1);assert.match(s.page.data.error,/先预览/);
});
test('return to edit clears consent, retains values, and incomplete fields cannot enter preview',async()=>{
 const s=client();await s.page.previewForm();s.page.publicationConsentChanged({detail:{consent:require('./helpers/publication-confirmation').acceptedConsent()}});s.page.editForm();assert.equal(s.page.data.previewing,false);assert.equal(s.page.data.publicationConsent,null);assert.equal(s.page.data.form.title,'志愿服务真实测试');
 s.page.data.form.fields.noFundraising=false;await s.page.previewForm();assert.equal(s.page.data.previewing,false);assert.match(s.page.data.error,/不收取/);
});
test('returning from the notice keeps unchanged preview, while changed payloads invalidate it',async()=>{
 const s=client();await s.page.previewForm();s.page.loadedClean=true;s.page.cleanForm=JSON.stringify(s.page.data.form);s.page.updateDirtyAlert(true);assert.equal(s.page.data.previewing,true);s.page.data.form.detail+='本次修改后需重新核对';s.page.updateDirtyAlert(true);assert.equal(s.page.data.previewing,false);
 s.page._recovery?.dispose();
});
test('expired-account recovery stays behind the login gate and cannot restore into another account',async()=>{
 const s=client(),recovery=require('../../miniprogram/utils/form-recovery');const record=recovery.write(s.wx,'owner-a',{id:'private-recovery',family:'industry',projectId:'C08G01S04',payload:{...s.page.data.form,title:'原账号未保存的私人内容'}});s.page.data.form.title='';s.page.onLoad({recoveryId:record.id});s.api.hasSession=()=>false;await s.page.onShow();assert.equal(s.page.data.privateLocked,true);assert.equal(s.page.data.form.title,'');
 s.flow.owner=()=> 'owner-b';s.page.data.privateLocked=false;s.page._recoveryRestored=false;s.page.restoreRecovery();assert.equal(s.page.data.form.title,'');assert.match(s.page.data.recoveryError,/保存在草稿箱/);assert.equal(recovery.list(s.wx,'owner-a')[0].payload.title,'原账号未保存的私人内容');
});
