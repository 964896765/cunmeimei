'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const file=path.join(__dirname,'../../miniprogram/pages/merchant/index.js');
const template=fs.readFileSync(path.join(__dirname,'../../miniprogram/pages/merchant/index.wxml'),'utf8');
function mount({request}){
 let options;
 const api={online:()=>true,request,showError:()=>{}};
 const context={Page(o){options=o;},require(id){
  if(id.endsWith('utils/api'))return api;
  if(id.endsWith('utils/region'))return {selected:()=> '中心街道'};
  if(id.endsWith('utils/storage'))return {};
  throw Error('unexpected require '+id);
 },wx:{showToast:()=>{},getStorageSync:key=>key==='city_life_user_id'?'merchant-page-test-owner':'merchant-page-test-token'}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const page={...options,data:{...options.data,name:'维修店',category:'维修',district:'中心街道'},setData(x){Object.assign(this.data,x);},refresh:async()=>{}};
 return page;
}

test('V0.23 miniapp: repeated taps cannot trigger concurrent merchant requests',async()=>{
 let called=0,done;
 const pending=new Promise(resolve=>{done=resolve;});
 const page=mount({request:async()=>{called++;await pending;return {application:{id:'first'}};}});
 const one=page.submit();
 assert.equal(page.data.submitting,true);
 await page.submit();
 assert.equal(called,1);
 done();await one;
 assert.equal(page.data.submitting,false);
 assert.match(template,/disabled="\{\{submitting\}\}"/);
});

test('V0.23 miniapp: network failure unlocks submission button',async()=>{
 let failed=0;
 const page=mount({request:async()=>{failed++;throw Error('network error');}});
 await page.submit();
 assert.equal(page.data.submitting,false);
 await page.submit();
 assert.equal(failed,2,'a deliberate new submission should be allowed after failure');
});
