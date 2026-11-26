'use strict';
const registry=require('./classification');
const legacy={merchant:'C01',job:'C02',service:'C03',used:'C04',housing:'C05',community:'C08'};
const max=9;
const defaults=['C02','C05','C04','C03','C01','C06','C19'];
const pageSize=8;
const key=()=> 'city_life_shortcuts_'+(wx.getStorageSync('city_life_user_id')||'guest');
function normalize(ids){return [...new Set((Array.isArray(ids)?ids:defaults).map(id=>legacy[id]||id))].filter(id=>registry.categories.some(x=>x.id===id)).slice(0,max);}
function load(){const value=wx.getStorageSync(key());return normalize(Array.isArray(value)?value:defaults);}
function save(ids){const result=normalize(ids);wx.setStorageSync(key(),result);return result;}
function hasHomeIcon(id){return registry.categories.some(category=>category.id===id);}
function items(ids){
 const categories=registry.categoryItems();
 const saved=normalize(ids).map(id=>({...categories.find(item=>item.id===id),homeIcon:hasHomeIcon(id)}));
 const result=[];
 const capacity=pageSize-1;
 for(let start=0;start<Math.max(saved.length,1);start+=capacity){
  const page=saved.slice(start,start+capacity);
  while(page.length<capacity)page.push({id:'empty-'+(start+page.length),empty:true});
  result.push(...page,{id:'more',name:'更多',icon:'shortcut-more',homeIcon:true});
 }
 return result;
}
function pages(list){const result=[];for(let i=0;i<list.length;i+=pageSize)result.push({id:'quick-'+i,items:list.slice(i,i+pageSize)});return result;}
module.exports={pages,load,save,normalize,items,defaults,max,hasHomeIcon};
