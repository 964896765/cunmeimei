'use strict';
const schemas=require('./publication-schemas'),geography=require('./geography'),registry=require('./classification');
// Preview and published detail use the same public fields, region and price rules.
function describe(kind,attributes={},price='',fallbackDistrict=''){
 const a=attributes,raw=String(price??'').trim(),project=registry.find(a.categoryId);
 const priceText=!raw?'':/^\d+(\.\d{1,2})?$/.test(raw)?'¥'+raw+(kind==='housing'&&a.intent==='出租'?' /月':''):raw;
 const fields=schemas.fieldsFor(kind,a).filter(x=>a[x.key]!==undefined&&String(a[x.key]).trim()).map(x=>({key:x.key,label:x.label.replace(/ \*$/,''),value:String(a[x.key])}));
 if(kind==='used'){if(a.model)fields.unshift({key:'model',label:'型号',value:String(a.model)});if(a.brand)fields.unshift({key:'brand',label:'品牌',value:String(a.brand)});}
 const seen=new Set(),displayFields=fields.filter(x=>!seen.has(x.key)&&seen.add(x.key));
 const city=geography.findCity(a.cityCode),district=geography.findDistrict(a.districtCode);
 return {priceText,displayFields,displayFieldCount:displayFields.length,categoryPath:project?[project.categoryName,project.group,project.name].join(' / '):'',locationText:city?[city.name,district?.cityCode===city.code?district.name:''].filter(Boolean).join(' · '):fallbackDistrict};
}
module.exports={describe};
