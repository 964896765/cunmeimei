'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const WebSocket=require('../backend/node_modules/ws');
module.exports=async function browser(){
 const executable='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';if(!fs.existsSync(executable))throw Error('Local Edge browser is required for UI acceptance');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'citylife-browser-'));
 const child=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,DATABASE_URL:'',PG_TEST_DATABASE_URL:'',ADMIN_PASSWORD:'',VERIFICATION_ADMIN_PASSWORD:'',WECHAT_SECRET:''}});
 let ws,seq=0;const pending=new Map();
 async function close(){
  if(ws){try{ws.send(JSON.stringify({id:++seq,method:'Browser.close'}));}catch{}ws.close();}
  for(let i=0;i<30&&child.exitCode===null;i++)await new Promise(resolve=>setTimeout(resolve,100));if(child.exitCode===null)child.kill();
  const expected=path.resolve(os.tmpdir())+path.sep+'citylife-browser-';if(!path.resolve(profile).startsWith(expected))throw Error('Unexpected browser profile cleanup path');
  for(let i=0;i<10;i++){try{fs.rmSync(profile,{recursive:true,force:true});return;}catch{await new Promise(resolve=>setTimeout(resolve,200));}}throw Error('Temporary browser profile cleanup failed');
 }
 try{
  const endpoint=await new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(Error('Browser startup timed out')),15000);child.on('error',()=>{clearTimeout(timer);reject(Error('Browser startup failed'));});child.stderr.on('data',data=>{buffer+=String(data);const match=/DevTools listening on (ws:\/\/[^\s]+)/.exec(buffer);if(match){clearTimeout(timer);resolve(match[1]);}});});
  ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  ws.on('message',data=>{const event=JSON.parse(String(data));if(event.id&&pending.has(event.id)){const p=pending.get(event.id);pending.delete(event.id);clearTimeout(p.timer);event.error?p.reject(Error('Browser protocol operation failed')):p.resolve(event.result||{});}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser operation timed out'));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const cdp=(method,params)=>send(method,params,sessionId);await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser page evaluation failed');return r.result?.value;};
  return {evaluate,navigate:url=>cdp('Page.navigate',{url}),screenshot:async file=>fs.writeFileSync(file,Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64')),close};
 }catch(error){await close();throw error;}
};
