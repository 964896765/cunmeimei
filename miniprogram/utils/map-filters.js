'use strict';
const defaults=Object.freeze({days:0,sort:'recommended',images:'all',publisher:'all'});
const options=Object.freeze([
 {key:'days',name:'发布时间',values:require('./search-filters').dateOptions.map(x=>({value:x.value,name:x.label}))},
 {key:'sort',name:'排序方式',values:[{value:'recommended',name:'推荐排序'},{value:'latest',name:'最新发布'}]},
 {key:'images',name:'图片',values:[{value:'all',name:'全部'},{value:'with',name:'仅有图片'}]},
 {key:'publisher',name:'发布者',values:[{value:'all',name:'全部'},{value:'verified',name:'已核验发布者'}]}
]);
function valid(key,value){return !!options.find(x=>x.key===key)?.values.some(x=>x.value===value);}
function count(value){return Object.keys(defaults).filter(key=>value[key]!==defaults[key]).length;}
module.exports={defaults,options,valid,count};
