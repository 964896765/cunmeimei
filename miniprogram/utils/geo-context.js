'use strict';
const geography=require('./geography'),KEY='city_life_browse_city',HISTORY='city_life_city_history';
function current(){const value=wx.getStorageSync(KEY);if(!value||!geography.findCity(value.cityCode))return {cityCode:'',districtCode:'',label:'选择城市'};const city=geography.findCity(value.cityCode),d=geography.findDistrict(value.districtCode);return {cityCode:city.code,districtCode:d?.cityCode===city.code?d.code:'',label:city.name+(d?.cityCode===city.code?' · '+d.name:'')};}
function select(cityCode,districtCode=''){const city=geography.findCity(cityCode),d=geography.findDistrict(districtCode);if(!city||districtCode&&d?.cityCode!==cityCode)throw Error('城市与区划不匹配');const value={cityCode,districtCode,source:'manual'};wx.setStorageSync(KEY,value);wx.setStorageSync(HISTORY,[cityCode,...history().map(x=>x.code).filter(x=>x!==cityCode)].slice(0,6));return current();}
function history(){const list=wx.getStorageSync(HISTORY);return (Array.isArray(list)?list:[]).map(geography.findCity).filter(Boolean);}
module.exports={current,select,history,KEY,HISTORY};
