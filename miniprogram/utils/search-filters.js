'use strict';
const dateOptions=[{value:0,label:'不限时间'},{value:1,label:'近24小时'},{value:3,label:'近3天'},{value:7,label:'近7天'},{value:30,label:'近30天'},{value:90,label:'近90天'}];
const radiusOptions=[{value:0,label:'不限距离'},...[1,3,5,10,20,50,100].map(value=>({value,label:value+'km以内'}))];
const canLocate=type=>['all','merchant','service'].includes(type);
function validDays(value){return dateOptions.some(x=>x.value===value);}
function validRadius(value){return radiusOptions.some(x=>x.value===value);}
module.exports={dateOptions,radiusOptions,canLocate,validDays,validRadius};
