'use strict';
// Local crash recovery is separate from explicitly saved/cloud drafts and consent.
const clone=value=>JSON.parse(JSON.stringify(value));
const key=uid=>'city_life_form_recovery_v1_'+uid;
function all(storage,uid){const value=storage.getStorageSync(key(uid));if(value&& !Array.isArray(value))throw Error('本机恢复记录格式暂不兼容，原记录已保留');return Array.isArray(value)?clone(value):[];}
function list(storage,uid){const value=storage.getStorageSync(key(uid));return Array.isArray(value)?value.filter(r=>r&&r.version===1&&['resident','industry'].includes(r.family)&&typeof r.id==='string').map(clone):[];}
function write(storage,uid,value,revision=null){
 const rows=all(storage,uid),previous=rows.find(r=>r?.id===value.id);
 if(previous?previous.revision!==revision:revision!==null)throw Error('恢复草稿已被其他页面修改，请保留当前内容后重新读取');
 if(!previous&&rows.length>=60)throw Error('本机恢复草稿较多，请在草稿箱整理后重试');
 const record={...clone(value),version:1,revision:(previous?.revision||0)+1,savedAt:Date.now()};
 storage.setStorageSync(key(uid),[record,...rows.filter(r=>r?.id!==record.id)]);return record;
}
function remove(storage,uid,id,revision){const rows=all(storage,uid),record=rows.find(r=>r?.id===id);if(!record)return true;if(record.revision!==revision)return false;const next=rows.filter(r=>r?.id!==id);if(next.length)storage.setStorageSync(key(uid),next);else storage.removeStorageSync(key(uid));return true;}
function controller(page,options,storage){
 let timer,revision=options.revision??null,last='',disposed=false;
 const clearTimer=()=>{clearTimeout(timer);timer=null;};
 const flush=()=>{
  clearTimer();if(disposed||!options.active()||!options.dirty())return false;
  const snapshot=options.snapshot(),fingerprint=JSON.stringify(snapshot);if(fingerprint===last)return true;
  try{const saved=write(storage,options.owner,snapshot,revision);revision=saved.revision;last=fingerprint;page.setData({recoveryNotice:'已自动保存在本机，可从草稿箱继续',recoveryError:''});return true;}
  catch(e){page.setData({recoveryNotice:'',recoveryError:'自动保存失败：'+e.message+'。请手动保存草稿。'});return false;}
 };
 return {flush,schedule(){clearTimer();if(!disposed){timer=setTimeout(flush,500);timer.unref?.();}},clear(){clearTimer();if(!options.active())return false;try{const removed=remove(storage,options.owner,options.id,revision);if(removed){revision=null;last='';page.setData({recoveryNotice:'',recoveryError:''});}return removed;}catch(e){page.setData({recoveryError:'本机恢复草稿清理失败，可在草稿箱核对后删除。'});return false;}},dispose(){flush();disposed=true;clearTimer();}};
}
module.exports={list,write,remove,controller};
