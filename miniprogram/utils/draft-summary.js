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
 const ids=new Set(require('./form-recovery').list(wx,uid).map(r=>r.id));const local=require('./local-drafts').list(uid);for(const draft of [...local,remote?.payload].filter(valid))if(draft.clientKey)ids.delete(draft.clientKey);return count(local,remote?.payload)+ids.size;
}
module.exports={count,read};
