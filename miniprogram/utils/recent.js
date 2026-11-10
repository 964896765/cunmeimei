'use strict';
const key=()=> 'city_life_recent_'+(require('./api').hasSession()&&wx.getStorageSync('city_life_user_id')||'guest');
function ids(){const value=wx.getStorageSync(key());return Array.isArray(value)?value.filter(x=>typeof x==='string'&&/^[0-9a-f-]{36}$/i.test(x)).slice(0,30):[];}
function record(id){if(!/^[0-9a-f-]{36}$/i.test(id||''))return;wx.setStorageSync(key(),[id,...ids().filter(x=>x!==id)].slice(0,30));}
module.exports={ids,record,clear(){wx.removeStorageSync(key());}};
