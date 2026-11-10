'use strict';
function describe(item,bounds){
 const date=item.createdAt?new Date(item.createdAt):null,dateText=date&&!isNaN(date)?(date.getMonth()+1)+'月'+date.getDate()+'日发布':'';
 if(!bounds||![item.latitude,item.longitude,bounds.west,bounds.east,bounds.north,bounds.south].every(Number.isFinite))return {dateText,distanceText:''};
 const lat=(bounds.south+bounds.north)/2,lon=(bounds.west+bounds.east)/2,r=x=>x*Math.PI/180,a=Math.sin(r(item.latitude-lat)/2)**2+Math.cos(r(lat))*Math.cos(r(item.latitude))*Math.sin(r(item.longitude-lon)/2)**2;
 const km=6371*2*Math.asin(Math.min(1,Math.sqrt(a)));
 return {dateText,distanceText:'距视野中心约'+(km<1?Math.round(km*1000)+'m':km.toFixed(1)+'km')};
}
module.exports={describe};
