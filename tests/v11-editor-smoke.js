'use strict';
// Runs the real WeChat page methods under a minimal local wx shim (not a WeChat compiler or device test).
const assert=require('node:assert/strict');
const path=require('node:path');
// This smoke test explicitly targets demo behavior, independent of the active local server setting.
const runtime=require('../miniprogram/utils/runtime');const originalMode=runtime.mode;runtime.mode='demo';
const store=new Map();
let savedPage;
global.wx={
 getStorageSync:key=>store.get(key),setStorageSync:(key,value)=>store.set(key,structuredClone(value)),removeStorageSync:key=>store.delete(key),
 showToast:()=>{},showModal:({success})=>success?.({confirm:true}),navigateTo:()=>{}
};
global.Page=spec=>{savedPage=spec;};
require(path.join(__dirname,'../miniprogram/pages/my-posts/index.js'));
const db=require('../miniprogram/utils/storage');
db.ensureDemoData();
const created=db.createPublication({type:'used',title:'闲置儿童自行车',detail:'一辆二手自行车的演示商品描述',price:'¥30',district:'中心街道'});
const page={...savedPage,data:structuredClone(savedPage.data),setData(changes){
 for(const [key,value] of Object.entries(changes)){
  const segments=key.split('.');let dest=this.data;
  while(segments.length>1){const k=segments.shift();dest=dest[k];}dest[segments[0]]=value;
 }
}};
(async()=>{
 await page.refresh();
 assert.equal(page.data.items[0].canEdit,true);
 await page.startEdit({currentTarget:{dataset:{id:created.id}}});
 assert.equal(page.data.editing,true);
 page.changeEdit({currentTarget:{dataset:{field:'title'}},detail:{value:'改动后的自行车标题'}});
 await page.saveEdit();
 assert.equal(page.data.editing,false);
 assert.equal(page.data.items[0].title,'改动后的自行车标题');
 assert.equal(page.data.items[0].revision,2);
 assert.equal(db.updatePublication(created.id,{type:'used',title:'旧草稿',detail:'尝试通过旧版本覆盖刚保存的数据',price:'1',district:'中心街道'},1),false);
 console.log('PASS V0.11 miniapp demo editor smoke: open/edit/resubmit/revision guard');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{runtime.mode=originalMode;});
