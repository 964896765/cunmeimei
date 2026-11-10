'use strict';
// This is an explicit regional filter, not a GPS location. No location permission is needed.
const KEY='city_life_v06_selected_area';
function selected(areas=[]){let saved='全部地区';try{saved=wx.getStorageSync(KEY)||saved;}catch(e){}return saved==='全部地区'||areas.includes(saved)?saved:'全部地区';}
function save(name,areas=[]){if(name!=='全部地区'&&!areas.includes(name))throw Error('不在已启用地区内');wx.setStorageSync(KEY,name);return name;}
function choose(areas=[],callback){const options=['全部地区',...areas];wx.showActionSheet({itemList:options,success:r=>{const a=options[r.tapIndex];if(a){save(a,areas);callback(a);}}});}
module.exports={selected,save,choose};
