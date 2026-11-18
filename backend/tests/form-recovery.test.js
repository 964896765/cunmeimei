'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),recovery=require('../../miniprogram/utils/form-recovery');
function setup(){const data=new Map(),storage={getStorageSync:k=>data.get(k),setStorageSync:(k,v)=>data.set(k,structuredClone(v)),removeStorageSync:k=>data.delete(k)},page={data:{},setData(v){Object.assign(this.data,v);}};return {data,storage,page};}
test('crash recovery is owner scoped, stores incomplete inputs, and rejects stale writes/deletions',()=>{
 const {storage}=setup(),value={id:'draft-a',family:'industry',projectId:'C02G01S01',sourceRevision:9,payload:{title:'未完成',fields:{salaryMin:'20'}}};
 const saved=recovery.write(storage,'a',value);assert.equal(saved.sourceRevision,9);assert.equal(recovery.list(storage,'b').length,0);
 const newer=recovery.write(storage,'a',{...value,payload:{title:'另一页新内容'}},saved.revision);
 assert.throws(()=>recovery.write(storage,'a',value,saved.revision),/其他页面/);assert.equal(recovery.remove(storage,'a',value.id,saved.revision),false);assert.equal(recovery.list(storage,'a')[0].payload.title,'另一页新内容');assert.equal(recovery.remove(storage,'a',value.id,newer.revision),true);
});
test('hide flush persists the latest inputs; account switches cannot write or clear another owner recovery',()=>{
 const s=setup();let owner='a',title='输入第一版';const control=recovery.controller(s.page,{owner:'a',id:'resident-a',active:()=>owner==='a',dirty:()=>true,snapshot:()=>({id:'resident-a',family:'resident',payload:{title}})},s.storage);
 control.schedule();title='异常退出前的最新输入';assert.equal(control.flush(),true);assert.equal(recovery.list(s.storage,'a')[0].payload.title,title);
 owner='b';title='其他账号';assert.equal(control.flush(),false);assert.equal(control.clear(),false);control.dispose();assert.equal(recovery.list(s.storage,'b').length,0);assert.equal(recovery.list(s.storage,'a')[0].payload.title,'异常退出前的最新输入');
});
test('quota failure remains visible, never claims successful autosave, and does not evict older drafts',()=>{
 const s=setup();s.storage.setStorageSync=()=>{throw Error('quota');};const control=recovery.controller(s.page,{owner:'a',id:'one',active:()=>true,dirty:()=>true,snapshot:()=>({id:'one',family:'resident',payload:{title:'保留'}})},s.storage);
 assert.equal(control.flush(),false);assert.match(s.page.data.recoveryError,/quota/);assert.equal(s.page.data.recoveryNotice,'');control.dispose();
});
test('successful clear removes only the completed recovery and leaves independent forms intact',()=>{
 const s=setup();recovery.write(s.storage,'a',{id:'other',family:'resident',payload:{}});const control=recovery.controller(s.page,{owner:'a',id:'one',active:()=>true,dirty:()=>true,snapshot:()=>({id:'one',family:'resident',payload:{title:'one'}})},s.storage);
 control.flush();assert.equal(control.clear(),true);assert.deepEqual(recovery.list(s.storage,'a').map(r=>r.id),['other']);
 // Dispose only after the form becomes clean in the real page.
});
test('future recovery formats survive writes and cleanup failure cannot turn a committed operation into an exception',()=>{
 const s=setup();s.storage.setStorageSync('city_life_form_recovery_v1_a',[{version:2,id:'future',payload:{title:'原数据'}}]);const control=recovery.controller(s.page,{owner:'a',id:'one',active:()=>true,dirty:()=>true,snapshot:()=>({id:'one',family:'resident',payload:{title:'one'}})},s.storage);control.flush();assert.equal(s.storage.getStorageSync('city_life_form_recovery_v1_a').length,2);s.storage.setStorageSync=()=>{throw Error('quota');};assert.doesNotThrow(()=>control.clear());assert.match(s.page.data.recoveryError,/清理失败/);
});
