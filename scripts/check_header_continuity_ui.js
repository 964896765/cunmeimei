'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('../backend/node_modules/sharp');
const pause=ms=>new Promise(r=>setTimeout(r,ms)),base=require('../miniprogram/utils/runtime').apiBaseUrl,phase=process.argv.includes('--before')?'before':'after';
async function poll(read,accept){for(let i=0;i<60;i++){const v=await read();if(accept(v))return v;await pause(150);}throw Error('Page not ready');}
(async()=>{
 const mini=await require('./devtools_connection')(),keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode'],original=[],checks=[],images=[],exceptions=[];let user,prefKey;
 const req=async(route,method='GET',body)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(user?{Authorization:'Bearer '+user.token}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,route+' '+r.status);return r.json();};
 const check=(ok,label)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
 const shot=async(name)=>{
  await pause(200);const file=path.resolve('docs/header-continuity-'+phase+'-'+name+'.png');await mini.screenshot({path:file});
  const geometry=await mini.evaluate(()=>{const p=getCurrentPages().slice(-1)[0],c=p.selectComponent('#navigation-header');return {width:wx.getWindowInfo().windowWidth,height:c.data.headerHeight,continuous:c.properties.continuous||false};});
  const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true}),ratio=info.width/geometry.width,y=Math.round(geometry.height*ratio);
  const deltas=[.02,.98].map(f=>{const x=Math.round(info.width*f),b=((y+3)*info.width+x)*info.channels;return Math.max(...[-2,-1,0,1,2].flatMap(d=>[0,1,2].map(k=>Math.abs(data[((y+d)*info.width+x)*info.channels+k]-data[b+k]))));});
  images.push({name,file:path.basename(file),seamDelta:deltas,continuous:geometry.continuous});
  if(phase==='after')check(deltas.every(d=>d<=4),name+' header/background seam is continuous (RGB delta '+deltas.join(',')+')');
 };
 mini.on('exception',e=>exceptions.push(e));
 try{
  for(const k of keys)original.push(await mini.callWxMethod('getStorageSync',k));user=await req('/api/v1/dev/login','POST',{devUser:'header-continuity-'+Date.now()});prefKey='city_life_preferences_'+user.userId;
  for(const [i,v]of [user.token,user.userId,true].entries())await mini.callWxMethod('setStorageSync',keys[i],v);
  const themes=phase==='before'?['prism']:['prism','dark','clear','quiet','warm','gentle'];
  for(const theme of themes){const prefs=await req('/api/v1/me/preferences'),updated=await req('/api/v1/me/preferences','PUT',{...prefs,theme,largeText:theme==='clear',reduceMotion:theme==='clear'});await mini.callWxMethod('setStorageSync',prefKey,updated);
   for(const name of ['publish','me']){
    await mini.evaluate(name=>{setTimeout(()=>wx.reLaunch({url:'/pages/'+name+'/index'}),100);return true;},name);await pause(2000);const page=await poll(()=>mini.currentPage(),p=>p.path==='pages/'+name+'/index');await poll(()=>page.data(),d=>name==='publish'?d.districts.length>0:!d.summaryLoading);await mini.pageScrollTo(0);await shot(name+'-'+theme);
    if(phase==='after'&&name==='publish'){check((await page.$$('.industry-choice.active')).length===1,'one selected industry in '+theme);check(await (await page.$('.drafts-button')).text()==='草稿箱','text-only draft entry retained in '+theme);}
    if(theme==='prism'&&name==='me'){await mini.pageScrollTo(260);await shot(name+'-scrolled');}
   }
  }
  if(phase==='after')check(exceptions.length===0,'no captured WeChat runtime exceptions');
  fs.writeFileSync('docs/header-continuity-'+phase+'-result.json',JSON.stringify({passed:checks.length,images,checks,physicalDevice:false,checkedAt:new Date().toISOString()},null,2));
 }finally{try{if(prefKey)await mini.callWxMethod('removeStorageSync',prefKey);for(let i=0;i<original.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]||'');await mini.evaluate(()=>{getApp().globalData.openPersonalCenter=true;setTimeout(()=>wx.switchTab({url:'/pages/me/index'}),100);return true;});await pause(800);}finally{await mini.disconnect();}}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
