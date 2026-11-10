'use strict';
const connect=require('./devtools_connection'),path=require('node:path');
(async()=>{const m=await connect();const mode=await m.callWxMethod('getStorageSync','city_life_acceptance_mode');
 try{
  const token=await m.callWxMethod('getStorageSync','city_life_v2_auth_token');if(token){const r=await fetch('http://127.0.0.1:3100/api/v1/me',{headers:{Authorization:'Bearer '+token}});if(r.ok)await m.callWxMethod('setStorageSync','city_life_user_id',(await r.json()).userId);}
  await m.callWxMethod('setStorageSync','city_life_acceptance_mode',false);let p=await m.reLaunch('/pages/home/index');if(p.path!=='pages/home/index')throw Error('Unexpected page');await m.screenshot({path:path.join(__dirname,'../docs/product-home.png')});
  await m.callWxMethod('setStorageSync','city_life_acceptance_mode',true);p=await m.switchTab('/pages/discover/index');await p.setData({q:'图文发布与收藏功能验收',type:'used'});
  await m.evaluate(()=>{const p=getCurrentPages();setTimeout(()=>p[p.length-1].filter(),0);return true;});
  for(let n=0;n<30;n++){if((await p.data('filtered')).some(x=>x.title==='图文发布与收藏功能验收'))break;await new Promise(r=>setTimeout(r,200));}
  if(!(await p.data('filtered')).length)throw Error('Content screenshot missing actual records');await m.screenshot({path:path.join(__dirname,'../docs/product-discover-content.png')});
  console.log('PASS: actual simulator home and explicit acceptance-content screenshots captured');
 }finally{await m.callWxMethod('setStorageSync','city_life_acceptance_mode',mode||false);await m.reLaunch('/pages/home/index');await m.disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
