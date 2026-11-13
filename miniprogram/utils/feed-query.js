'use strict';
const allowed=['all',...require('./business-templates').templates.map(x=>x.id),'community'];
const filters=require('./search-filters');
const MAX_PAGE=501;
function feedUrl({type='all',channel='',area='全部地区',q='',sortIndex=0,sort,page=1,pageSize=20,categoryId='',cityCode='',districtCode='',latitude,longitude,days=0,radiusKm=0,images='all',publicOnly=false,refinements={}}={}){
 if(!allowed.includes(type))throw Error('此频道尚未接入');
 if(channel&&!require('./discovery-channels').definitions.some(value=>value.id===channel))throw Error('发现频道无效');
 if(!Number.isInteger(page)||page<1||page>MAX_PAGE)throw Error('页码超出范围');
 const code=sort||(['latest','price_low','price_high'][sortIndex]||'latest');
 if(!['latest','price_low','price_high','recommended','popular','distance'].includes(code))throw Error('排序方式无效');
 if(!filters.validDays(days)||!filters.validRadius(radiusKm))throw Error('时间或距离范围无效');
 if(!['all','with'].includes(images))throw Error('图片条件无效');
 const selected=require('./discovery-refinements').normalize(refinements,channel||type,true);
 const needsLocation=code==='distance'||radiusKm>0;
 if(needsLocation&&!filters.canLocate(type))throw Error('距离筛选仅支持商家与可预约服务的公开位置');
 if(needsLocation&&(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180))throw Error('请先授权定位');
 return '/api/v1/feed?type='+type+(channel?'&channel='+encodeURIComponent(channel):'')+'&area='+encodeURIComponent(cityCode?'全部地区':area)+'&q='+encodeURIComponent(String(q).trim().slice(0,80))+'&sort='+code+'&page='+page+'&pageSize='+pageSize+'&categoryId='+encodeURIComponent(categoryId)+'&cityCode='+encodeURIComponent(cityCode)+'&districtCode='+encodeURIComponent(districtCode)+(publicOnly?'&publicOnly=1':'')+(days?'&days='+days:'')+(images==='with'?'&images=with':'')+(radiusKm?'&radiusKm='+radiusKm:'')+(needsLocation?'&latitude='+latitude+'&longitude='+longitude:'')+(Object.keys(selected).length?'&refinements='+encodeURIComponent(JSON.stringify(selected)):'');
}
module.exports={feedUrl,allowed,MAX_PAGE};
