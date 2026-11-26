'use strict';
function markers(items,scale=12,selectedId='',iconPalette='prism'){
 const step=.004*2**(14-Math.min(18,Math.max(4,scale))),groups=new Map(),lookup=new Map();
 for(const item of items){if(!Number.isFinite(item.latitude)||!Number.isFinite(item.longitude))continue;const key=Math.floor(item.latitude/step)+':'+Math.floor(item.longitude/step);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 const output=[];let id=1;for(const rows of groups.values()){
  const first=rows[0],selected=rows.some(x=>x.id===selectedId);lookup.set(id,rows);
  output.push({id,latitude:rows.reduce((n,x)=>n+x.latitude,0)/rows.length,longitude:rows.reduce((n,x)=>n+x.longitude,0)/rows.length,iconPath:'/assets/icons/type-'+first.type+'-'+iconPalette+'.png',width:selected?40:30,height:selected?40:30,callout:{content:rows.length>1?rows.length+' 条已加载信息':first.title,display:selected||rows.length>1?'ALWAYS':'BYCLICK',padding:8,borderRadius:10,fontSize:12}});id++;
 }return {markers:output,lookup};
}
module.exports={markers};
