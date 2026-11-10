'use strict';
const geo=require('../../miniprogram/utils/geography');
const {ApiError}=require('./rules');
function cityReference(cityCode='',districtCode=''){
 if(cityCode&&!geo.findCity(cityCode)||districtCode&&(!cityCode||geo.findDistrict(districtCode)?.cityCode!==cityCode))throw new ApiError(400,'INVALID_CITY','城市或行政区划编码无效');
 return {cityCode,districtCode};
}
function number(value,min,max){if(value===undefined||value===null||value===''||typeof value==='boolean'||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw new ApiError(400,'INVALID_GEO','地理范围或坐标无效');return Number(value);}
function bounds(input){const west=number(input.west,-180,180),east=number(input.east,-180,180),south=number(input.south,-90,90),north=number(input.north,-90,90);if(west>=east||south>=north)throw new ApiError(400,'INVALID_BOUNDS','地图范围无效');return {west,east,south,north};}
function location(input){cityReference(input.cityCode,input.districtCode||'');if(!input.cityCode||!['service','merchant'].includes(input.kind)||!['public_business','approximate'].includes(input.precision)||typeof input.approved!=='boolean'||typeof input.verificationNote!=='string'||input.verificationNote.trim().length<8||input.verificationNote.length>500)throw new ApiError(400,'INVALID_MAP_LOCATION','地图点位需要核验说明和公开精度');
 if(input.categoryId&&!require('../../miniprogram/utils/classification-contract').find(input.categoryId))throw new ApiError(400,'INVALID_CATEGORY','地图分类无效');
 const latitude=number(input.latitude,-90,90),longitude=number(input.longitude,-180,180);
 // Approximate means approximate in storage as well as in the response.
 return {...input,latitude:input.precision==='approximate'?+latitude.toFixed(2):latitude,longitude:input.precision==='approximate'?+longitude.toFixed(2):longitude,districtCode:input.districtCode||''};
}
module.exports={...geo,cityReference,number,bounds,location};
