'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function editor(name){
 const calls=[],pickers=[],modals=[],toasts=[],reads=[];let uid='one',token='token-one',page;
 const api={online:()=>true,hasSession:()=>true,login:async()=>token,request:async(method,url,data,auth,owner)=>{calls.push({method,url,data,auth,owner});if(url==='/api/v1/config')return {areas:['中心街道']};if(url==='/api/v1/me/merchants')return {items:[{id:'merchant',role:'owner'}]};return {items:[]};},privateImage:async id=>'wxfile://'+id,uploadImage:async()=>({id:'new-image'}),showError:e=>toasts.push(e.message)};
 const wx={getStorageSync:key=>key==='city_life_user_id'?uid:token,showModal:o=>modals.push(o),showToast:o=>toasts.push(o.title),pageScrollTo(){},previewImage(){},showActionSheet:o=>modals.push(o),getFileSystemManager:()=>({readFile:o=>reads.push(o)})};
 const sandbox={module:{exports:{}},Page:p=>page=p,wx,require:name=>name.endsWith('/api')?api:name.endsWith('/image-picker')?{chooseImages:o=>pickers.push(o)}:name.endsWith('/tab-bar')?{context:()=>uid+':'+token}:name.endsWith('/theme')?{apply(){}}:name.endsWith('/storage')?{}:name.endsWith('/region')?{selected:()=> '中心街道'}:{}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages',name,'index.js'),'utf8'),sandbox);
 page.data=JSON.parse(JSON.stringify(page.data));page.setData=changes=>{for(const [key,value]of Object.entries(changes)){const keys=key.split('.');let target=page.data;for(const k of keys.slice(0,-1))target=target[k];target[keys.at(-1)]=value;}};
 const post={id:'post',type:'used',title:'本地测试发布',detail:'足够完整的本地测试发布内容',district:'中心街道',canEdit:true,canWithdraw:true,imageIds:[]};
 if(name==='my-posts'){page.data.items=[post];page.data.editing=true;page.data.editForm={...post,revision:1,attributes:{},price:'10',photos:[],originalImageIds:[]};}
 if(name==='merchant-services'){page.data.items=[{...post,id:'service'}];page.data.merchantId='merchant';page.data.canEdit=true;page.data.editingId='service';}
 if(name==='merchant'){page.data.request={id:'application-one'};page.data.licenseEnabled=true;api.uploadLicense=async(...args)=>calls.push({license:args});}
 const event=id=>({currentTarget:{dataset:{id}}});
 return {page,api,calls,pickers,modals,toasts,reads,event,post,switchOwner(){uid='two';token='token-two';}};
}
test('closing a publication editor while its chooser is open drops the late selection',async()=>{
 const c=editor('my-posts');let uploads=0;c.api.uploadImage=async()=>{uploads++;return {id:'wrong'};};c.page.addPhoto();c.page.cancelEdit();await c.pickers[0].success({tempFiles:[{tempFilePath:'old-file'}]});assert.equal(uploads,0);assert.equal(c.page.data.editForm,null);
});
test('publication config returned out of order cannot reopen an older editor',async()=>{
 const c=editor('my-posts'),gate=deferred();c.page.data.items.push({...c.post,id:'new-post'});let configs=0;c.api.request=async()=>{if(++configs===1)await gate.promise;return {areas:['中心街道']};};const old=c.page.startEdit(c.event('post'));await c.page.startEdit(c.event('new-post'));gate.resolve();await old;assert.equal(c.page.data.editForm.id,'new-post');
});
test('late publication image reads never restore a removed photo',async()=>{
 const c=editor('my-posts'),gate=deferred();c.page.data.items[0].imageIds=['old-image'];c.api.privateImage=()=>gate.promise;const opening=c.page.startEdit(c.event('post'));await tick();c.page.removePhoto({currentTarget:{dataset:{index:0}}});gate.resolve('wxfile://old-image');await opening;assert.equal(c.page.data.editForm.photos.length,0);
});
test('publication withdrawal modal cannot submit under a newly selected account',async()=>{
 const c=editor('my-posts');c.page.withdraw(c.event('post'));c.switchOwner();await c.modals[0].success({confirm:true});assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
});
test('publication loading failure shows a retryable error instead of an empty-success state',async()=>{
 const c=editor('my-posts');c.api.request=async()=>{throw Error('本地模拟网络中断');};await c.page.refresh();assert.equal(c.page.data.loading,false);assert.equal(c.page.data.loadError,'本地模拟网络中断');
});
test('latest publication refresh wins when an earlier response arrives later',async()=>{
 const c=editor('my-posts'),gate=deferred();let requests=0;c.api.request=async()=>{if(++requests===1)return gate.promise;return {items:[{...c.post,title:'更新的列表'}]};};const first=c.page.refresh();await c.page.refresh();gate.resolve({items:[{...c.post,title:'过期列表'}]});await first;assert.equal(c.page.data.items[0].title,'更新的列表');
});
test('closing a service editor while its chooser is open drops the late selection',async()=>{
 const c=editor('merchant-services');let uploads=0;c.api.uploadImage=async()=>{uploads++;return {id:'wrong'};};c.page.choosePhotos();c.page.cancelEdit();await c.pickers[0].success({tempFiles:[{tempFilePath:'old-service-file'}]});assert.equal(uploads,0);assert.equal(c.page.data.photos.length,0);
});
test('late service upload cannot update an unloaded page',async()=>{
 const c=editor('merchant-services'),gate=deferred();c.api.uploadImage=()=>gate.promise;c.page.choosePhotos();const selecting=c.pickers[0].success({tempFiles:[{tempFilePath:'service-file'}]});await tick();c.page.onUnload?.();const before=JSON.stringify(c.page.data);gate.resolve({id:'late-image'});await selecting;assert.equal(JSON.stringify(c.page.data),before);
});
test('service action confirmation cannot act after an account change',async()=>{
 const c=editor('merchant-services');const action=c.page.serviceAction({currentTarget:{dataset:{id:'service',action:'pause'}}});c.switchOwner();c.modals[0].success({confirm:true});await action;assert.equal(c.calls.filter(x=>x.method==='POST').length,0);
});
test('service loading failure is distinct from a legitimate zero service count',async()=>{
 const c=editor('merchant-services');c.api.request=async()=>{throw Error('服务列表暂不可用');};await c.page.load();assert.equal(c.page.data.loading,false);assert.equal(c.page.data.loadError,'服务列表暂不可用');
});
test('license chooser cannot upload old materials to a replacement application',async()=>{
 const c=editor('merchant');c.page.chooseLicense();c.page.data.request={id:'application-two'};await c.pickers[0].success({tempFiles:[{tempFilePath:'old-license',size:200}]});assert.equal(c.reads.length,0);assert.equal(c.calls.length,0);
});
test('account switching during license read prevents any evidence upload',async()=>{
 const c=editor('merchant');c.page.chooseLicense();c.pickers[0].success({tempFiles:[{tempFilePath:'old-license',size:200}]});c.switchOwner();await c.reads[0].success({data:new ArrayBuffer(10)});assert.equal(c.calls.length,0);assert.equal(c.toasts.length,0);
});
test('old evidence confirmation cannot submit for another identity',async()=>{
 const c=editor('merchant');await c.page.submitEvidence();c.switchOwner();await c.modals[0].success({confirm:true});assert.equal(c.calls.length,0);
});
