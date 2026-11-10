'use strict';
const api=require('./api');
const valid=value=>value&&typeof value==='object'&&!Array.isArray(value)&&['used','housing','community','service'].includes(value.kind);
function count(local,remote){
 const drafts=[...(Array.isArray(local)?local:[local]),remote].filter(valid),keys=new Set();let anonymous=0;
 for(const draft of drafts){if(draft.clientKey)keys.add(draft.clientKey);else anonymous++;}return keys.size+anonymous;
}
async function read(){
 const uid=wx.getStorageSync('city_life_user_id')||'guest';
 const remote=api.online()&&api.hasSession()?await api.request('GET','/api/v1/me/draft',null,true):null;
 return count(require('./local-drafts').list(uid),remote?.payload);
}
module.exports={count,read};
