'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('the common channel component emits only recognized changes and shows the five discovery channels while keeping other business queries valid',()=>{
 let definition;vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/components/channel-tabs/index.js'),'utf8'),{Component:v=>definition=v,require:()=>require('../../miniprogram/utils/business-templates')});
 assert.deepEqual(Array.from(definition.data.channels,x=>x.name),['闲置','商家','服务','活动','便民']);
 const events=[],ctx={data:definition.data,properties:{value:'all'},triggerEvent:(name,v)=>events.push([name,v.type])};
 for(const type of ['all','unknown','used'])definition.methods.select.call(ctx,{currentTarget:{dataset:{type}}});assert.deepEqual(events,[['change','used']]);
});
test('map distances describe the public viewport centre and never invent a GPS distance or missing date',()=>{
 const {describe}=require('../../miniprogram/utils/map-preview');assert.equal(describe({}).distanceText,'');assert.equal(describe({}).dateText,'');
 const value=describe({latitude:23,longitude:113,createdAt:'2026-10-20T03:00:00Z'},{west:112,east:114,south:22,north:24});assert.equal(value.distanceText,'距视野中心约0m');assert.match(value.dateText,/发布/);
});
