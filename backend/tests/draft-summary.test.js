'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {count}=require('../../miniprogram/utils/draft-summary');
test('draft count includes distinct local/account drafts and deduplicates the same draft',()=>{
 assert.equal(count(null,null),0);
 assert.equal(count({kind:'used',clientKey:'same'},null),1);
 assert.equal(count(null,{kind:'community',clientKey:'cloud'}),1);
 assert.equal(count({kind:'used',clientKey:'same',title:'本机新修改'},{kind:'used',clientKey:'same',title:'账号旧版本'}),1);
 assert.equal(count({kind:'used',clientKey:'local'},{kind:'used',clientKey:'cloud'}),2);
 assert.equal(count('invalid',{invalid:true}),0);
});
test('return to personal center switches directly to the tab and requests its main panel',()=>{
 const app={globalData:{}},routes=[],sandbox={module:{exports:{}},getApp:()=>app,wx:{switchTab:value=>routes.push(value)}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/navigation.js'),'utf8'),sandbox);
 sandbox.module.exports.personalCenter();assert.equal(app.globalData.openPersonalCenter,true);assert.equal(routes[0].url,'/pages/me/index');
});
test('shared page header measures the real capsule and recomputes landscape safe areas',()=>{
 let component,window={windowWidth:375,statusBarHeight:44},menu={left:281,right:368,top:50,height:32};
 const sandbox={Component:value=>component=value,wx:{getWindowInfo:()=>window,getMenuButtonBoundingClientRect:()=>menu}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/components/page-header/index.js'),'utf8'),sandbox);
 const measures=[],page={data:{},setData(value){Object.assign(this.data,value);},triggerEvent(name,value){measures.push([name,value.height]);}};component.methods.measure.call(page);
 assert.deepEqual(measures[0],['measure',88]);
 assert.equal(page.data.statusHeight,44);assert.equal(page.data.rowHeight,44);assert.equal(page.data.headerHeight,88);assert.equal(page.data.titleInset,102);
 assert.ok(375-page.data.titleInset<menu.left,'title ends before the native capsule');
 window={windowWidth:812,statusBarHeight:0};menu={left:710,right:800,top:8,height:32};component.methods.measure.call(page);
 assert.equal(page.data.headerHeight,48);assert.equal(page.data.titleInset,110);
 menu={left:0,right:0,top:0,height:0};component.methods.measure.call(page);assert.equal(page.data.rowHeight,44);assert.ok(page.data.titleInset>0);
});
