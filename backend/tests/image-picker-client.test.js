'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function picker(legacy=false){
 const dialogs=[],results=[],failures=[],toasts=[];let owner='one';
 const wx={getStorageSync:()=>owner,showToast:o=>toasts.push(o),[legacy?'chooseImage':'chooseMedia']:o=>dialogs.push(o)};
 const sandbox={module:{exports:{}},wx};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/image-picker.js'),'utf8'),sandbox);
 const choose=(count=6)=>sandbox.module.exports.chooseImages({count,success:r=>results.push(r),fail:e=>failures.push(e)});
 return {choose,dialogs,results,failures,toasts,wx,switchOwner:()=>owner='two'};
}
test('only one native image chooser can be pending; cancellation releases it quietly',()=>{
 const c=picker();assert.equal(c.choose(),true);assert.equal(c.choose(),false);assert.equal(c.dialogs.length,1);c.dialogs[0].fail({errMsg:'chooseMedia:fail cancel'});assert.equal(c.choose(),true);assert.equal(c.toasts.length,0);
});
test('late native chooser result cannot pass an old file to another account',()=>{
 const c=picker();c.choose();c.switchOwner();c.dialogs[0].success({tempFiles:[{tempFilePath:'old-account-file'}]});assert.equal(c.results.length,0);assert.equal(c.failures[0].code,'ACCOUNT_CHANGED');assert.equal(c.choose(),true);
});
test('legacy image chooser preserves paths and sizes with compressed output',()=>{
 const c=picker(true);c.choose(99);assert.equal(c.dialogs[0].count,9);assert.equal(c.dialogs[0].sizeType[0],'compressed');c.dialogs[0].success({tempFilePaths:['a','b'],tempFiles:[{size:100},{size:200}]});assert.deepEqual(JSON.parse(JSON.stringify(c.results[0].tempFiles)),[{tempFilePath:'a',size:100},{tempFilePath:'b',size:200}]);
});
test('a full photo collection never opens a zero-count native picker',()=>{const c=picker();assert.equal(c.choose(0),false);assert.equal(c.dialogs.length,0);});
test('synchronous SDK failure releases the chooser for a later retry',()=>{
 const c=picker();c.wx.chooseMedia=()=>{throw Error('SDK unavailable');};assert.equal(c.choose(),false);assert.equal(c.failures.length,1);c.wx.chooseMedia=o=>c.dialogs.push(o);assert.equal(c.choose(),true);
});
test('an old chooser completion cannot unlock the next pending native chooser',()=>{
 const c=picker();c.choose();c.dialogs[0].success({tempFiles:[]});c.choose();c.dialogs[0].complete({errMsg:'chooseMedia:ok'});assert.equal(c.choose(),false);assert.equal(c.dialogs.length,2);
});
