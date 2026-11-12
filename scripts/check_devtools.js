'use strict';
const automator=require('../backend/node_modules/miniprogram-automator');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const mini=await require('./devtools_connection')();
 const originalTestMode=await mini.callWxMethod('getStorageSync','city_life_acceptance_mode');await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',true);
 const errors=[];mini.on('exception',e=>errors.push(e));
 const server=require('../miniprogram/utils/runtime').mode==='server';
 let report,originalToken,ownerToken;
 try {
  if(server){
   report=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/local-business-result.json'),'utf8'));
   originalToken=await mini.callWxMethod('getStorageSync','city_life_v2_auth_token');
   const r=await fetch('http://127.0.0.1:3101/api/v1/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({devUser:report.ownerDevUser})});
   if(r.status!==200)throw Error('Local merchant development login failed');ownerToken=(await r.json()).token;
  }
  const app=JSON.parse(fs.readFileSync(path.join(__dirname,'../miniprogram/app.json'),'utf8'));
  const passed=[];
  for(const route of app.pages){
   if(server)await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',route.startsWith('pages/merchant-')?ownerToken:originalToken);
   const query=route==='pages/detail/index'?'?id='+(server?report.publicationId:'l3'):route==='pages/booking/index'?'?id='+(server?report.serviceId:'s1'):route==='pages/chat/index'?'?id=system':server&&route.startsWith('pages/merchant-')?'?merchantId='+report.merchantId:'';
   const page=await mini.reLaunch('/'+route+query);
   if(page.path!==route)throw Error('Unexpected route: '+page.path+' instead of '+route);
   await page.waitFor(300);
   const roots=await page.$$('view');
   if(!roots.length)throw Error('No rendered view: '+route);
   passed.push(route);console.log('PASS rendered '+route+' ('+roots.length+' views)');
  }
  if(errors.length)throw Error(JSON.stringify(errors));
  await mini.reLaunch('/pages/home/index');
  fs.writeFileSync(path.join(__dirname,'../docs/local-devtools-result.json'),JSON.stringify({mode:server?'server':'demo',rendered:passed,exceptions:errors,checkedAt:new Date().toISOString()},null,2));
  console.log('PASS: all 15 pages rendered; no captured runtime exceptions');
 }finally{await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',originalTestMode||false);if(server&&originalToken)await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',originalToken);await mini.disconnect();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
