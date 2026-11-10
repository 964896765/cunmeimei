'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function client(request){
 const api={online:()=>true,hasSession:()=>true,request};
 const sandbox={module:{exports:{}},require:()=>api,wx:{getStorageSync:()=> 'draft-test-user'}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../miniprogram/utils/account-draft.js'),'utf8'),sandbox);
 const page={data:{kind:'housing',title:'原本的标题',detail:'草稿内容',price:'',district:'中心街道',attributes:{area:'1'},photos:[],clientKey:'draft_test_key_0001'},_draftRevision:0,setData(x){Object.assign(this.data,x);},saveDraft(){this.localSaved=true;}};
 return {methods:sandbox.module.exports,page};
}
test('editing during account save retains newer local text and reports the unsynced changes',async()=>{
 let finish,payload;
 const {methods,page}=client(async(method,url,body)=>{payload=body.payload;return new Promise(r=>{finish=r;});});
 const saving=methods.saveAccountDraft.call(page);
 page.data.title='保存期间新增的标题';page.data.attributes.area='20';
 assert.equal(payload.attributes.area,'1','request snapshot must not share mutable attributes');
 finish({revision:1,payload});await saving;
 assert.equal(page.data.title,'保存期间新增的标题');assert.equal(page.data.attributes.area,'20');
 assert.equal(page.localSaved,true);assert.match(page.data.cloudStatus,/新增的修改仍在本机/);assert.equal(page.data.cloudBusy,false);
});
test('a stale cloud response cannot erase local draft or advance its base revision',async()=>{
 const {methods,page}=client(async()=>{const e=Error('conflict');e.code='DRAFT_CONFLICT';throw e;});
 await methods.saveAccountDraft.call(page);
 assert.equal(page.data.title,'原本的标题');assert.equal(page._draftRevision,0);
 assert.match(page.data.cloudStatus,/本机内容已保留/);assert.equal(page.data.cloudBusy,false);
});

test('a late account restore cannot overwrite edits made while the draft was loading',async()=>{let finish;const {methods,page}=client(()=>new Promise(r=>finish=r));const reading=methods.restoreAccountDraft.call(page);page.data.title='读取期间新增的内容';finish({revision:2,payload:{kind:'housing',title:'远端旧内容',detail:'远端草稿',price:'',district:'中心街道',attributes:{area:'20'},imageIds:[],clientKey:'draft_test_key_0001'}});await reading;assert.equal(page.data.title,'读取期间新增的内容');assert.equal(page._draftRevision,0,'do not silently advance the conflict base for local edits');assert.match(page.data.cloudStatus,/保留本机内容/);assert.equal(page.localSaved,true);});
