'use strict';
// Stable product contract. Reading a channel never grants publication permission.
const templates=Object.freeze([
 {code:'JOB',id:'job',name:'招聘人才',shortName:'招聘'},
 {code:'PROPERTY',id:'housing',name:'房产资产',shortName:'房产'},
 {code:'GOODS',id:'used',name:'商品闲置',shortName:'闲置'},
 {code:'MERCHANT',id:'merchant',name:'商家机构',shortName:'商家'},
 {code:'SERVICE',id:'service',name:'服务供需',shortName:'服务'},
 {code:'EVENT',id:'event',name:'活动资讯',shortName:'活动'},
 {code:'PUBLIC',id:'public',name:'公共信息',shortName:'便民'}
]);
const searchOptions=[{id:'all',name:'全部频道'},...templates.map(x=>({id:x.id,name:x.name}))];
const channels=[{id:'all',name:'全部',type:'all'},...templates.map(x=>({id:x.id,name:x.shortName,type:x.id}))];
module.exports={templates,searchOptions,channels};
