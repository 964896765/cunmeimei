'use strict';
const {ApiError}=require('./rules');
const filters=require('../../miniprogram/utils/map-filters');
function parse(params){
 const value={};
 for(const key of Object.keys(filters.defaults)){
  const raw=params.get(key);value[key]=raw===null?filters.defaults[key]:key==='days'?Number(raw):raw;
  if(raw===''||!filters.valid(key,value[key]))throw new ApiError(400,'INVALID_MAP_FILTER','地图筛选条件无效');
 }
 return value;
}
module.exports={parse};
