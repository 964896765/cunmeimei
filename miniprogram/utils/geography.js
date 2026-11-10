'use strict';
const catalog=require('../data/city-catalog');
const cities=catalog.cities,byCode=new Map(cities.map(x=>[x.code,x]));
const districts=new Map();for(const city of cities)for(const d of city.districts)districts.set(d.code,{...d,cityCode:city.code});
const cityCenters=require('../data/city-centers');
function centerForCity(code){const city=byCode.get(code),point=cityCenters.centers[code];return city&&point?{code:city.code,name:city.name,...point,approximate:true}:null;}
function findCity(code){return byCode.get(code);}
function cityForCode(code){return findCity(code)||findCity(String(code).slice(0,4)+'00')||(districts.get(code)?findCity(districts.get(code).cityCode):null);}
function search(q=''){const word=String(q).trim().toLowerCase().replace(/\s+/g,'');return cities.filter(x=>!word||x.name.includes(word)||x.pinyin.includes(word)||x.initials.startsWith(word)||x.code===word);}
module.exports={cities,findCity,cityForCode,centerForCity,findDistrict:code=>districts.get(code),search,source:catalog.source};
