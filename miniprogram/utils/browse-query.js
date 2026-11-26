'use strict';
const catalog=require('./classification-contract'),geo=require('./geography'),filters=require('./search-filters'),sorts=require('./discovery-sorts');
const refinements=require('./discovery-refinements');
const types=['all',...require('./business-templates').templates.map(x=>x.id),'community'];
function category(id){const node=catalog.find(id);return node?{id:node.id,name:node.name,industryId:node.categoryId||catalog.categories.find(c=>id===c.id||c.groups.some(g=>g.id===id))?.id||''}:{id:'',name:'',industryId:''};}
function categoryColumns(id,channel='all') {
 const definition=require('./discovery-channels').definitions.find(item=>item.id===channel);
 const categories=definition?catalog.categories.filter(item=>definition.industries.includes(item.id)):catalog.categories;
 const c=categories.find(item=>id===item.id||item.groups.some(group=>group.id===id||group.items.some(project=>project.id===id)));
 const g=c?.groups.find(group=>group.id===id||group.items.some(project=>project.id===id));
 const label=definition?refinements.configurations[channel].category:'全部行业';
 const columns=[[{id:'',name:label},...categories],c?[{id:c.id,name:'全部'+c.name},...c.groups]:[{id:'',name:'全部项目'}],g?[{id:g.id,name:'全部'+g.name},...g.items]:[{id:c?.id||'',name:'全部项目'}]].map(list=>list.map(({id,name})=>({id,name})));
 return {columns,value:[c?columns[0].findIndex(item=>item.id===c.id):0,g?columns[1].findIndex(item=>item.id===g.id):0,g?Math.max(0,columns[2].findIndex(item=>item.id===id)):0]};
}
function districts(cityCode){return [{code:'',name:'全市范围'},...(geo.findCity(cityCode)?.districts||[]).map(({code,name})=>({code,name}))];}
function bounds(value){if(!value)return null;const b={};for(const k of ['west','east','south','north']){if(value[k]===''||value[k]===undefined)return null;b[k]=Number(value[k]);if(!Number.isFinite(b[k]))return null;}return b.west>=-180&&b.east<=180&&b.south>=-90&&b.north<=90&&b.west<b.east&&b.south<b.north?b:null;}
function common(value={}){const city=geo.findCity(value.cityCode),district=geo.findDistrict(value.districtCode),c=category(value.categoryId),selected=refinements.normalize(typeof value.refinements==='string'?require('./route-query').decodeQuery(value.refinements,1200):value.refinements||{},value.type);return {...(Object.keys(selected).length?{refinements:selected}:{}),type:types.includes(value.type)?value.type:'all',q:String(value.q||'').trim().slice(0,80),categoryId:c.id,cityCode:city?.code||'',districtCode:city&&district?.cityCode===city.code?district.code:'',days:filters.validDays(Number(value.days))?Number(value.days):0,images:value.images==='with'?'with':'all',sort:['latest','recommended','popular','price_low','price_high','distance'].includes(value.sort)?value.sort:'recommended'};}
function origin(value={}){const latitude=Number(value.latitude),longitude=Number(value.longitude);return value.latitude!==null&&value.longitude!==null&&value.latitude!==''&&value.longitude!==''&&Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{latitude,longitude}:null;}
function sortOptions(type,scope='feed'){return scope==='map'?[{code:'recommended',name:'综合推荐'},{code:'latest',name:'最新发布'}]:sorts.options(type).filter(x=>x.enabled);}
function reset(value={}){return {...common(value),refinements:{},categoryId:'',districtCode:'',days:0,images:'all',radiusKm:0,latitude:null,longitude:null,publisher:'all',sort:'recommended'};}
function signature(value={}){const radiusKm=filters.validRadius(Number(value.radiusKm))?Number(value.radiusKm):0,point=origin(value);return JSON.stringify({...common(value),radiusKm,publisher:value.publisher==='verified'?'verified':'all',...((radiusKm||value.sort==='distance')&&point?point:{})});}
function extras(value={}){const rows=[];if(value.q)rows.push({key:'q',label:'关键词：'+value.q});if(value.days)rows.push({key:'days',label:filters.dateOptions.find(x=>x.value===value.days)?.label||''});if(value.images==='with')rows.push({key:'images',label:'仅有图片'});if(value.radiusKm)rows.push({key:'radiusKm',label:value.radiusKm+'km以内'});if(value.publisher==='verified')rows.push({key:'publisher',label:'已核验主体'});rows.push(...refinements.extras(value.refinements,value.type));return rows;}
function conditions(value={}){
 const labels=[];
 const selected=category(value.categoryId);
 const district=geo.findDistrict(value.districtCode);
 if(selected.id)labels.push({key:'categoryId',label:selected.name});
 if(district)labels.push({key:'districtCode',label:district.name});
 return [...labels,...extras(value)];
}
function remove(value,key){if(typeof key!=='string')return {};if(key.startsWith('refinement:')){const selected={...value.refinements};delete selected[key.slice(11)];if(key==='refinement:intent')delete selected.price;return {refinements:selected};}if(key==='q')return {q:'',submittedQ:''};if(key==='days')return {days:0};if(key==='images')return {images:'all'};if(key==='publisher')return {publisher:'all'};if(key==='categoryId')return {categoryId:'',categoryName:''};if(key==='districtCode')return {districtCode:'',area:'全部地区',areaIndex:0};if(key==='radiusKm')return {radiusKm:0,...(value.sort==='distance'?{}:{latitude:null,longitude:null})};return {};}
function mapUrl(value={},page=1){const b=bounds(value.bounds||value);if(!b)throw Error('地图范围已失效，请返回地图重新选择');if(!Number.isInteger(page)||page<1||page>200)throw Error('地图页码超出范围');const c=common(value),publisher=value.publisher==='verified'?'verified':'all',sort=c.sort==='latest'?'latest':'recommended';return '/api/v1/map?'+Object.entries({...c,...b,publisher,sort,page}).map(([k,v])=>k+'='+encodeURIComponent(typeof v==='object'?JSON.stringify(v):v)).join('&');}
module.exports={category,categoryColumns,districts,bounds,common,mapUrl,types,origin,sortOptions,reset,extras,conditions,remove,signature};
