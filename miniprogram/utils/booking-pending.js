'use strict';
const runtime=require('./runtime'),clock=require('./booking-time');
const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const validKey=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(value);
const context=()=>JSON.stringify([wx.getStorageSync('city_life_user_id')||'guest',!!wx.getStorageSync('city_life_acceptance_mode')]);
function storageKey(owner){
 if(owner!==context()||JSON.parse(owner)[0]==='guest')throw Error('账号已变化，请重新读取预约记录。');
 return 'city_life_booking_pending_v1:'+encodeURIComponent(runtime.apiBaseUrl||'')+':'+owner;
}
function valid(entry,id){const p=entry?.payload;return p&&validId(id)&&p.serviceId===id&&validKey(p.clientKey)&&clock.validDate(p.date)&&/^(09|1[0-8]):00$/.test(p.time)&&typeof p.remark==='string'&&p.remark.length<=300&&typeof entry.title==='string'&&entry.title.length<=200&&Number.isSafeInteger(entry.createdAt)&&entry.createdAt>0;}
function index(owner){
 const value=wx.getStorageSync(storageKey(owner));
 if(value===undefined||value===null||value==='')return {};
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>30||Object.entries(value).some(([id,entry])=>!valid(entry,id)))throw Error('本机待核对记录暂时无法读取，请重试；为避免重复预约，暂不提交新申请。');
 return JSON.parse(JSON.stringify(value));
}
function read(owner,id){return index(owner)[String(id).toLowerCase()]||null;}
function save(owner,payload,title){
 const entries=index(owner),id=payload.serviceId,entry={payload:{...payload},title:String(title||'预约服务').slice(0,200),createdAt:entries[id]?.createdAt||Date.now()};
 if(!valid(entry,id))throw Error('预约恢复信息无效，请重新读取服务。');
 if(entries[id]&&JSON.stringify(entries[id].payload)!==JSON.stringify(entry.payload))throw Error('该服务还有一份待核对申请，请先查看原预约。');
 if(!entries[id]&&Object.keys(entries).length>=30)throw Error('请先核对已有预约申请，再提交新的申请。');
 entries[id]=entry;wx.setStorageSync(storageKey(owner),entries);
 if(JSON.stringify(read(owner,id))!==JSON.stringify(entry))throw Error('本机保存未完成，预约尚未发送，请重试读取恢复记录。');
 return entry;
}
function remove(owner,payload){
 const entries=index(owner),entry=entries[payload.serviceId];
 if(!entry||entry.payload.clientKey!==payload.clientKey)return;
 delete entries[payload.serviceId];wx.setStorageSync(storageKey(owner),entries);
 if(read(owner,payload.serviceId))throw Error('预约状态已确认，本机恢复记录暂未更新，请稍后再核对。');
}
function clientKey(){const part=()=>Math.floor(Math.random()*0x100000000).toString(16).padStart(8,'0');return 'bk_'+Date.now().toString(36)+'_'+part()+part()+part();}
module.exports={context,read,save,remove,clientKey,list:owner=>Object.values(index(owner))};
