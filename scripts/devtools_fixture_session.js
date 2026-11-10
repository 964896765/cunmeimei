'use strict';
// Runtime-only storage overlay: fixture identities and all writes stay in memory.
// Original auth values are compared in this Node process, never logged or saved.
module.exports=async function fixtureSession(mini,{origin,uid,globalKey,bindRuntimeOrigin=false}){
 const keys=['city_life_user_id','city_life_v2_auth_token','city_life_session_expires_at','city_life_acceptance_mode','city_life_auth_intent_v1'],before=[];
 for(const key of keys)before.push(await mini.callWxMethod('getStorageSync',key));
 let installed=false;
 async function restore(){
  let restored=true;
  if(installed){
   restored=await mini.evaluate(globalKey=>{
    const app=getApp(),f=app.globalData[globalKey];if(!f)return false;
    wx.getStorageSync=f.original.get;wx.setStorageSync=f.original.set;wx.removeStorageSync=f.original.remove;wx.request=f.original.request;wx.showModal=f.original.modal;
    if(f.runtime)f.runtime.apiBaseUrl=f.original.apiBaseUrl;
    delete app.globalData[globalKey];return true;
   },globalKey);installed=false;
  }
  const after=[];for(const key of keys)after.push(await mini.callWxMethod('getStorageSync',key));
  const authStorageUnchanged=JSON.stringify(before)===JSON.stringify(after);
  if(!authStorageUnchanged)throw Error('Original authentication storage changed during the fixture session');
  if(!restored)throw Error('Fixture hook disappeared; original auth is unchanged, but runtime restoration could not be verified');
  return {authStorageUnchanged,runtimeOverlayRemoved:true};
 }
 try{
  installed=true;
  await mini.evaluate(({origin,uid,globalKey,bindRuntimeOrigin})=>{
   const app=getApp();if(app.globalData[globalKey])throw Error('Fixture session already installed');
   const shadow=Object.create(null),f=app.globalData[globalKey]={original:{get:wx.getStorageSync,set:wx.setStorageSync,remove:wx.removeStorageSync,request:wx.request,modal:wx.showModal},shadow,modalCount:0};
   if(bindRuntimeOrigin){const runtime=require('utils/runtime.js');if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.apiBaseUrl)||!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Fixture origin must be local development');f.runtime=runtime;f.original.apiBaseUrl=runtime.apiBaseUrl;runtime.apiBaseUrl=origin;}
   shadow.city_life_user_id=uid;shadow.city_life_v2_auth_token='LOCAL_MEMORY_ONLY_FIXTURE_TOKEN_01234567890123456789';shadow.city_life_acceptance_mode=false;
   shadow.city_life_session_expires_at=Date.now()+3600000;shadow.city_life_auth_intent_v1='';
   shadow['city_life_preferences_'+uid]={theme:'prism',largeText:false,reduceMotion:true,notificationPreview:true,allowContacts:true,revision:1};
   wx.getStorageSync=key=>Object.prototype.hasOwnProperty.call(shadow,key)?shadow[key]:f.original.get(key);
   wx.setStorageSync=(key,value)=>{shadow[key]=value;};wx.removeStorageSync=key=>{shadow[key]='';};
   wx.request=options=>f.original.request({...options,url:origin+options.url.replace(/^https?:\/\/[^/]+/,'')});
   wx.showModal=options=>{f.pendingModal=options;f.modalCount++;};
   return true;
  },{origin,uid,globalKey,bindRuntimeOrigin});
  return {restore};
 }catch(error){try{await restore();}catch{}throw error;}
};
