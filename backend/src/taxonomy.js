'use strict';
const DEFAULT_CATEGORIES=Object.freeze([
 {id:'merchant',name:'本地商家',enabled:true,restricted:false},
 {id:'job',name:'招聘求职',enabled:false,restricted:true},
 {id:'housing',name:'租房房产',enabled:true,restricted:false},
 {id:'used',name:'二手闲置',enabled:true,restricted:false},
 {id:'service',name:'生活服务',enabled:true,restricted:false},
 {id:'community',name:'邻里社区',enabled:true,restricted:false}
]);
function validRegionName(v){return typeof v==='string'&&v.trim()===v&&v.length>=2&&v.length<=40&&!/[<>\u0000-\u001f\u007f]/.test(v);}
module.exports={DEFAULT_CATEGORIES,validRegionName};
