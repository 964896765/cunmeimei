'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const schemas=require('../../miniprogram/utils/publication-schemas'),{publicationExtras}=require('../src/product-repository'),{validateDraft}=require('../src/account-drafts');
const attrs={categoryId:'C04G01S01',categoryVersion:'2.0-audit',templateCode:'GOODS',templateVersion:'2',cityCode:'310100',districtCode:'310101',priceMode:'amount',condition:'正常使用',brand:'Apple',model:'iPhone 15 Pro'};
const sample=()=>({type:'used',title:'二手手机完整测试',detail:'真实描述使用情况与配件和瑕疵，请核实。',price:'80.50',attributes:{...attrs},imageIds:['00000000-0000-4000-8000-000000000001']});
test('version 2 requires appropriate phone fields, amount, photos and a city/district pair on the server',()=>{
 assert.deepEqual(publicationExtras(sample()).attributes,attrs);
 for(const [key,value]of [['brand',''],['model',''],['condition',''],['districtCode',''],['districtCode','110101'],['priceMode','invalid']]){const data=sample();data.attributes[key]=value;assert.throws(()=>publicationExtras(data),key);}
 for(const price of ['80 或面议','-1','1.234','1e3',''])assert.throws(()=>publicationExtras({...sample(),price}),price);
 assert.throws(()=>publicationExtras({...sample(),imageIds:[]}));
 const negotiable=sample();negotiable.attributes.priceMode='negotiable';assert.throws(()=>publicationExtras(negotiable));negotiable.price='面议';assert.doesNotThrow(()=>publicationExtras(negotiable));
});
test('incomplete version 2 drafts are valid, v1 records remain compatible, and business fields stay distinct',()=>{
 const draft={kind:'used',title:'',detail:'',price:'',district:'',attributes:{templateCode:'GOODS',templateVersion:'2',categoryId:attrs.categoryId,categoryVersion:attrs.categoryVersion},imageIds:[],clientKey:'version_two_draft_1234'};
 assert.deepEqual(validateDraft(draft).attributes,draft.attributes);
 assert.doesNotThrow(()=>publicationExtras({type:'used',attributes:{templateCode:'GOODS',templateVersion:'1'}}));
 assert.throws(()=>publicationExtras({type:'used',attributes:{templateCode:'GOODS',templateVersion:'99'}}));
 assert.deepEqual(schemas.fieldsFor('used',attrs).map(x=>x.key),['brand','model','condition']);
 assert.deepEqual(schemas.fieldsFor('housing',{}).map(x=>x.key),['intent','area','layout']);
 assert.ok(!schemas.fieldsFor('service',{}).some(x=>x.key==='condition'));
 assert.throws(()=>publicationExtras({...sample(),type:'service'}),'cannot attach goods fields to a service');
});
function client(){
 let definition,uid='owner-a',fail=false;const store={},calls=[],requests=[];
 const api={online:()=>true,hasSession:()=>true,request:async(method,url,body)=>{requests.push({method,url,body:structuredClone(body)});if(url==='/api/v1/config')return {areas:['中心街道']};if(url==='/api/v1/me/profile')return {displayName:'当前测试账号'};if(method==='PUT')return {revision:2,payload:body.payload};return {};}};
 const wx={getStorageSync:key=>key==='city_life_user_id'?uid:structuredClone(store[key]),setStorageSync:(key,value)=>{if(fail)throw Error('quota');store[key]=structuredClone(value);},removeStorageSync:key=>delete store[key],getFileSystemManager:()=>({accessSync(){}}),pageScrollTo(){},disableAlertBeforeUnload(){},enableAlertBeforeUnload(){calls.push('exit-alert');},showToast(){},redirectTo:x=>calls.push(x.url),navigateBack:()=>calls.push('back')};
 const localSandbox={module:{exports:{}},wx};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../../miniprogram/utils/local-drafts.js'),'utf8'),localSandbox);
 const app={globalData:{}};const sandbox={Page:v=>definition=v,wx,getApp:()=>app,getCurrentPages:()=>[{route:'pages/publish/index'},{}],require:name=>name.endsWith('/api')?api:name.endsWith('/local-drafts')?localSandbox.module.exports:require('../../miniprogram/utils/'+name.split('/').pop())};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../../miniprogram/pages/publish-form/index.js'),'utf8'),sandbox);
 const page={data:structuredClone(definition.data),setData(values){for(const [key,value]of Object.entries(values)){const segments=key.split('.');let target=this.data;while(segments.length>1)target=target[segments.shift()];target[segments[0]]=structuredClone(value);}}};
 for(const [key,value]of Object.entries(definition))if(typeof value==='function')page[key]=value.bind(page);
 page._draftOwner=uid;page._sessionImageIds=new Set();page.setData({...sample(),kind:'used',showForm:true,loading:false,clientKey:'form_client_test_1234',district:'中心街道',districts:['中心街道'],photos:[{id:sample().imageIds[0],path:'local-photo'}]});page.markClean();
 return {page,store,calls,requests,api,app,drafts:localSandbox.module.exports,changeOwner:()=>uid='owner-b',failStorage:()=>fail=true};
}
test('hide and unload preserve local recovery without changing explicit drafts or cloud data',()=>{
 const c=client();c.page.setField({currentTarget:{dataset:{field:'title'}},detail:{value:'本次尚未主动保存'}});c.page.onHide();c.page.previewPost();assert.equal(c.page.data.preview,true);c.page.onUnload();assert.equal(c.drafts.list('owner-a').length,0);const rows=require('../../miniprogram/utils/form-recovery').list({getStorageSync:key=>c.store[key]},'owner-a');assert.equal(rows.length,1);assert.equal(rows[0].payload.title,'本次尚未主动保存');assert.equal(c.requests.filter(x=>x.method==='PUT').length,0);
});
test('back offers save/discard/continue; cancel does not save; editing an original draft never mutates it',async()=>{
 const c=client();assert.equal(await c.page.saveDraft(),true);const original=JSON.stringify(c.drafts.list('owner-a'));
 c.page.setField({currentTarget:{dataset:{field:'title'}},detail:{value:'不保存的修改'}});c.page.goBack();assert.equal(c.page.data.showExitDialog,true);c.page.continueEditing();assert.equal(c.page.data.showExitDialog,false);assert.equal(c.page.data.title,'不保存的修改');
 c.page.cancelPublish();assert.equal(JSON.stringify(c.drafts.list('owner-a')),original);assert.ok(c.calls.includes('back'));
});
test('new drafts coexist, explicit updates affect only the current draft, and local revision conflicts preserve changes',async()=>{
 const c=client();assert.equal(await c.page.saveDraft(),true);const first=c.drafts.list('owner-a')[0];
 c.page._origin=null;c.page.setData({clientKey:'another_independent_123',title:'第二份独立草稿'});c.page.markClean();assert.equal(await c.page.saveDraft(),true);assert.equal(c.drafts.list('owner-a').length,2);
 c.page.setField({currentTarget:{dataset:{field:'title'}},detail:{value:'只修改第二份'}});assert.equal(await c.page.saveDraft(),true);assert.equal(c.drafts.list('owner-a').find(x=>x.clientKey===first.clientKey).title,first.title);
 const item=c.drafts.list('owner-a').find(x=>x.clientKey==='another_independent_123');c.drafts.save('owner-a',{...item,title:'其他窗口的新版本'},item.draftRevision);assert.equal(await c.page.saveDraft(),false);assert.match(c.page.data.draftError,/变化/);assert.equal(c.drafts.list('owner-a').find(x=>x.clientKey===item.clientKey).title,'其他窗口的新版本');
});
test('the primary flow needs no draft, preview return retains values, and only explicit confirmation submits',async()=>{
 const c=client();await c.page.submit();assert.equal(c.requests.length,0);c.page.previewPost();await c.page.submit();assert.equal(c.requests.filter(x=>x.method==='POST').length,0);
 c.page.editPost();assert.equal(c.page.data.title,'二手手机完整测试');c.page.previewPost();c.page.publicationConsentChanged({detail:{consent:require('./helpers/publication-confirmation').acceptedConsent()}});await c.page.confirmSubmit();assert.equal(c.requests.filter(x=>x.method==='POST').length,1);assert.equal(Object.keys(c.store).length,0);assert.ok(c.calls.includes('/pages/my-posts/index'));c.page.publicationConsentChanged({detail:{consent:require('./helpers/publication-confirmation').acceptedConsent()}});await c.page.confirmSubmit();assert.equal(c.requests.filter(x=>x.method==='POST').length,1);
});
test('successful submission removes only the opened draft and preserves independent drafts',async()=>{
 const c=client();await c.page.saveDraft();const id=c.page.data.clientKey;c.drafts.save('owner-a',{...c.drafts.list('owner-a')[0],clientKey:'other_draft_kept_1234'},null);
 c.page.previewPost();c.page.publicationConsentChanged({detail:{consent:require('./helpers/publication-confirmation').acceptedConsent()}});await c.page.confirmSubmit();assert.equal(c.drafts.list('owner-a').length,1);assert.notEqual(c.drafts.list('owner-a')[0].clientKey,id);
});
test('storage failures and account switches never claim save success or exit automatically',async()=>{
 const c=client();c.page.setField({currentTarget:{dataset:{field:'title'}},detail:{value:'等待保存的新标题'}});c.page.goBack();c.failStorage();await c.page.saveAndExit();assert.equal(c.page.data.showExitDialog,true);assert.match(c.page.data.draftError,/quota/);assert.equal(c.calls.includes('back'),false);c.changeOwner();assert.equal(await c.page.saveDraft(),false);assert.equal(c.store['city_life_drafts_owner-b'],undefined);
});
test('account draft cancel preserves the server original; explicit save uses its original revision and conflict never falls back to local overwrite',async()=>{
 const c=client();c.page._origin={source:'account',clientKey:c.page.data.clientKey,revision:7};c.page.setData({fromDraft:true});c.page.setField({currentTarget:{dataset:{field:'title'}},detail:{value:'更新账号草稿'}});
 c.api.request=async(method,url,body)=>{c.requests.push({method,url,body});const e=Error('conflict');e.code='DRAFT_CONFLICT';throw e;};assert.equal(await c.page.saveDraft(),false);assert.equal(c.requests[0].body.expectedRevision,7);assert.equal(Object.keys(c.store).length,0);assert.match(c.page.data.draftError,/其他设备/);c.page.cancelPublish();assert.equal(c.requests.length,1);
});
test('new phone version shows only condition, optional legacy attributes still validate, and unrelated fields remain rejected',()=>{
 const data=sample();data.attributes.templateVersion='3';delete data.attributes.brand;delete data.attributes.model;assert.deepEqual(schemas.fieldsFor('used',data.attributes).map(x=>x.key),['condition']);assert.doesNotThrow(()=>publicationExtras(data));assert.throws(()=>publicationExtras({...data,attributes:{...data.attributes,condition:''}}));
});
test('late photo reads never restore removed images or save the buffer',async()=>{const c=client();let finish;c.api.privateImage=()=>new Promise(r=>finish=r);const reading=c.page.retryPhotos();c.page.setData({photos:[{id:'new-photo',path:'new-path'}]});finish('old-photo-path');await reading;assert.deepEqual(c.page.data.photos,[{id:'new-photo',path:'new-path'}]);assert.equal(Object.keys(c.store).length,0);});
test('offline local drafts can still open; starting a new item ignores existing drafts without a restore prompt',async()=>{
 const c=client();await c.page.saveDraft();c.page._options={restore:'local'};c.api.request=async()=>{throw Error('offline');};await c.page.initialize();assert.equal(c.page.data.loadFailed,false);assert.equal(c.page.data.showForm,true);
 const fresh=client();fresh.store['city_life_draft_owner-a']={...sample(),kind:'used',title:'不应被自动恢复',clientKey:'old_legacy_draft_1234',photos:[]};fresh.page._options={categoryId:'C04G01S01'};fresh.page.setData({title:'',detail:'',price:'',photos:[]});await fresh.page.initialize();assert.equal(fresh.page.data.title,'');assert.equal(fresh.page.data.fromDraft,false);assert.equal(fresh.page.data.attributes.templateVersion,'3');assert.equal(fresh.drafts.list('owner-a').length,1);
});

test('saving a new form returns to categories; saving an opened draft returns to the draft box',async()=>{const fresh=client();await fresh.page.saveAndExit();assert.ok(fresh.calls.includes('back'));const editing=client();await editing.page.saveDraft();await editing.page.applyDraft(editing.drafts.list('owner-a')[0],{source:'local',clientKey:editing.page.data.clientKey,revision:1});editing.page.setField({currentTarget:{dataset:{field:'title'}},detail:{value:'主动保存后的草稿修改'}});await editing.page.saveAndExit();assert.ok(editing.calls.includes('/pages/drafts/index'));assert.equal(editing.drafts.list('owner-a')[0].title,'主动保存后的草稿修改');});


test('unchanged empty forms and unchanged restored drafts leave directly, while preview back never opens the exit dialog',async()=>{
 const fresh=client();fresh.page.goBack();assert.ok(fresh.calls.includes('back'));assert.equal(fresh.page.data.showExitDialog,false);
 const editing=client();await editing.page.saveDraft();await editing.page.applyDraft(editing.drafts.list('owner-a')[0],{source:'local',clientKey:editing.page.data.clientKey,revision:1});editing.page.goBack();assert.equal(editing.page.data.showExitDialog,false);assert.ok(editing.calls.includes('/pages/drafts/index'));
 fresh.page.setField({currentTarget:{dataset:{field:'title'}},detail:{value:'保留当前预览内容'}});fresh.page.previewPost();fresh.page.goBack();assert.equal(fresh.page.data.preview,false);assert.equal(fresh.page.data.showExitDialog,false);assert.equal(fresh.page.data.title,'保留当前预览内容');
});
test('submission failure retains both the modified form and its saved source draft for retry',async()=>{
 const c=client();await c.page.saveDraft();const original=JSON.stringify(c.drafts.list('owner-a'));c.page.setField({currentTarget:{dataset:{field:'title'}},detail:{value:'提交失败仍需保留'}});c.page.previewPost();c.api.request=async()=>{throw Error('network failed');};c.page.publicationConsentChanged({detail:{consent:require('./helpers/publication-confirmation').acceptedConsent()}});await c.page.confirmSubmit();assert.equal(c.page.data.preview,true);assert.equal(c.page.data.title,'提交失败仍需保留');assert.equal(c.page.data.submitting,false);assert.equal(JSON.stringify(c.drafts.list('owner-a')),original);assert.equal(c.calls.includes('/pages/my-posts/index'),false);
});
test('photo-only untitled legacy data without a client ID restores and explicitly migrates without clearing unknown records',async()=>{
 const c=client();const raw={type:'used',content:'旧草稿只有描述与照片，没有标题和编号',photos:[{id:'legacy-photo',path:'legacy-path'}],attributes:{},unknownLegacyField:'preserve-this'};
 c.store['city_life_draft_owner-a']=raw;c.store['city_life_drafts_owner-a']=[{unknownFormat:{body:'不得丢失'}}];const rows=c.drafts.list('owner-a'),legacy=rows.find(x=>x.kind==='used');assert.ok(legacy.clientKey);assert.equal(c.drafts.list('owner-a').find(x=>x.kind==='used').clientKey,legacy.clientKey);assert.deepEqual(c.store['city_life_draft_owner-a'],raw);
 c.page._options={restore:'local',draftId:legacy.clientKey};await c.page.restoreDraft();assert.equal(c.page.data.title,'');assert.equal(c.page.data.photos[0].id,'legacy-photo');assert.equal(c.page.data.detail,raw.content);assert.equal(c.page.data.showExitDialog,false);c.page.setField({currentTarget:{dataset:{field:'title'}},detail:{value:'主动迁移原有草稿'}});await c.page.saveDraft();assert.equal(c.store['city_life_draft_owner-a'],undefined);const saved=c.drafts.list('owner-a');assert.equal(saved.length,2);assert.equal(saved.find(x=>x.kind==='used').unknownLegacyField,'preserve-this');assert.deepEqual(c.store['city_life_drafts_owner-a'].find(x=>x.unknownFormat),{unknownFormat:{body:'不得丢失'}});
});
test('a revised legacy payload cannot be overwritten or deleted using its old recovery token',()=>{
 const c=client();c.store['city_life_draft_owner-a']={kind:'used',clientKey:'old_record_1234',title:'原版本',photos:[]};const old=c.drafts.list('owner-a')[0];c.store['city_life_draft_owner-a'].title='另一窗口的修改';assert.throws(()=>c.drafts.save('owner-a',old,0,old._recordToken),/变化/);assert.equal(c.drafts.remove('owner-a',old.clientKey,0,old._recordToken),false);assert.equal(c.store['city_life_draft_owner-a'].title,'另一窗口的修改');
});

test('account-source submission carries its observed revision while new/local publications do not pretend to own an account draft',async()=>{
 const c=client();c.page._origin={source:'account',clientKey:c.page.data.clientKey,revision:9};c.page.previewPost();c.page.publicationConsentChanged({detail:{consent:require('./helpers/publication-confirmation').acceptedConsent()}});await c.page.confirmSubmit();assert.equal(c.requests.find(x=>x.method==='POST').body.sourceDraftRevision,9);
 const n=client();n.page.previewPost();n.page.publicationConsentChanged({detail:{consent:require('./helpers/publication-confirmation').acceptedConsent()}});await n.page.confirmSubmit();assert.equal(n.requests.find(x=>x.method==='POST').body.sourceDraftRevision,undefined);
 for(const revision of [0,-1,1.5,'1'])assert.throws(()=>publicationExtras({...sample(),clientKey:'draft_revision_test_123',sourceDraftRevision:revision}));
});
