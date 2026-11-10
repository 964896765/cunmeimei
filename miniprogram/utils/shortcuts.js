'use strict';
const registry=require('./classification');
const legacy={merchant:'C01',job:'C02',service:'C03',used:'C04',housing:'C05',community:'C08'};
const max=27;
const defaults=['C02','C05','C04','C03','C01','C08','C07'];
const key=()=> 'city_life_shortcuts_'+(wx.getStorageSync('city_life_user_id')||'guest');
function normalize(ids){return [...new Set((Array.isArray(ids)?ids:defaults).map(id=>legacy[id]||id))].filter(id=>registry.categories.some(x=>x.id===id)).slice(0,max);}
function load(){const value=wx.getStorageSync(key());return normalize(Array.isArray(value)?value:defaults);}
function save(ids){const result=normalize(ids);wx.setStorageSync(key(),result);return result;}
function items(ids){const categories=registry.categoryItems(),list=normalize(ids).map(id=>categories.find(x=>x.id===id)),lastSlot=Math.ceil((list.length+1)/8)*8-1;while(list.length<lastSlot)list.push({id:'empty-'+list.length,empty:true});return [...list,{id:'more',name:'更多',icon:'discover'}];}
function pages(list){const result=[];for(let i=0;i<list.length;i+=8)result.push({id:'quick-'+i,items:list.slice(i,i+8)});return result;}
module.exports={pages,load,save,normalize,items,defaults,max};
