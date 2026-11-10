'use strict';
// Real WeChat compilation/rendering/filesystem/HTTP; loopback responses are fixtures.
// Never connects to the API, migrates databases or clears user storage.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const connect=require('./devtools_connection'),sharp=require('../backend/node_modules/sharp');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(fn,accept,label){for(let i=0;i<70;i++){const v=await fn();if(accept(v))return v;await pause(100);}throw Error('Timed out: '+label);}
(async()=>{
 const out=path.resolve(__dirname,'../docs/local-ui-audit');fs.mkdirSync(out,{recursive:true});
 const jpeg=(await sharp({create:{width:4,height:4,channels:3,background:'#cba4b6'}}).jpeg().toBuffer()).toString('base64');
 const state={uploads:0,postError:false,servicesError:false,binaryValid:false};
 const server=http.createServer(async(req,res)=>{
  const route=new URL(req.url,'http://127.0.0.1').pathname;let status=200,data={items:[]};
  if(route==='/api/v1/config')data={areas:['中心街道'],categories:[],features:{}};
  else if(route==='/api/v1/me/publications'){if(state.postError){status=503;data={error:'LOCAL_UI_FIXTURE_FAILURE',message:'本地界面测试：发布记录暂不可用'};}else data={items:[{id:'30000000-0000-4000-8000-000000000002',type:'used',title:'本地界面测试发布',description:'这是一条内存界面测试记录，不代表真实用户内容。',district:'中心街道',status:'pending',price:'20',revision:1,attributes:{},imageIds:[],createdAt:'2026-11-01T01:00:00Z'}]};}
  else if(route==='/api/v1/me/merchants')data={items:[{id:'50000000-0000-4000-8000-000000000002',role:'owner'}]};
  else if(route==='/api/v1/merchants/50000000-0000-4000-8000-000000000002/services'){if(state.servicesError){status=503;data={error:'LOCAL_UI_FIXTURE_FAILURE',message:'本地界面测试：服务记录暂不可用'};}else data={items:[{id:'60000000-0000-4000-8000-000000000002',title:'本地界面测试服务',description:'本地内存服务测试，不代表真实商家服务。',status:'published',price:'面议',imageIds:[]}]};}
  else if(route==='/api/v1/media'&&req.method==='POST'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);state.uploads++;state.binaryValid=bytes[0]===255&&bytes[1]===216&&req.headers['content-type']==='image/jpeg';status=201;data={image:{id:'70000000-0000-4000-8000-'+String(state.uploads).padStart(12,'0')}};
  }
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const mini=await connect().catch(e=>{server.close();throw e;}),checks=[],errors=[],saved=[],uid='10000000-0000-4000-8000-000000000002';let hooked=false;
 const keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode','city_life_preferences_'+uid];
 const check=(v,label)=>{assert.ok(v,label);checks.push(label);console.log('PASS '+label);};
 mini.on('exception',e=>errors.push(String(e.message||e.description||'runtime exception')));
 try{
  const existing=(await mini.callWxMethod('getStorageInfoSync')).keys;
  for(const key of keys)saved.push({key,exists:existing.includes(key),value:await mini.callWxMethod('getStorageSync',key)});
  await mini.evaluate(({jpeg,origin})=>{
   const a=getApp(),p=wx.env.USER_DATA_PATH+'/media-native-audit-'+Date.now();
   const f=a.globalData.__mediaNativeAudit={request:wx.request,chooseMedia:wx.chooseMedia,files:[p+'.jpg',p+'.gif'],picks:0,timeoutValid:false};
   wx.getFileSystemManager().writeFileSync(f.files[0],jpeg,'base64');wx.getFileSystemManager().writeFileSync(f.files[1],'GIF89a','utf8');
   wx.chooseMedia=options=>{f.picks++;f.picker=options;};
   wx.request=options=>{if(options.url.endsWith('/api/v1/media')&&options.method==='POST')f.timeoutValid=options.timeout===15000;return f.request({...options,url:origin+options.url.replace(/^https?:\/\/[^/]+/,'')});};
   return true;
  },{jpeg,origin});hooked=true;
  await mini.callWxMethod('setStorageSync',keys[0],'LOCAL_MEDIA_UI_FIXTURE_TOKEN_01234567890123456789');await mini.callWxMethod('setStorageSync',keys[1],uid);await mini.callWxMethod('setStorageSync',keys[2],false);
  const fixture=async()=>({...state,...await mini.evaluate(()=>{const f=getApp().globalData.__mediaNativeAudit;return {picks:f.picks,timeoutValid:f.timeoutValid};})});
  const pick=bad=>mini.evaluate(bad=>{const f=getApp().globalData.__mediaNativeAudit,o=f.picker;delete f.picker;o.success({tempFiles:[{tempFilePath:f.files[bad?1:0],size:1000}]});o.complete?.({errMsg:'chooseMedia:ok'});return true;},bad);
  const tapText=async(page,text)=>{for(const b of await page.$$('button'))if((await b.text()).trim()===text){await b.tap();return;}throw Error('Button not found: '+text);};
  let page=await mini.reLaunch('/pages/my-posts/index');await poll(()=>page.data(),d=>!d.loading&&d.items.length===1,'publication list');await pause(350);check(!await page.$('.empty'),'real publication list does not show an empty state');
  await tapText(page,'修改内容');await poll(()=>page.data(),d=>d.editing,'publication editor');await tapText(page,'添加照片');await poll(fixture,f=>f.picks===1,'publication picker');await (await page.$('.more')).tap();await poll(()=>page.data(),d=>!d.editing,'publication cancelled with chooser pending');await pick(false);await pause(150);check((await fixture()).uploads===0&&!(await page.data()).editing,'closed publication editor drops a late native chooser callback');
  await tapText(page,'修改内容');await poll(()=>page.data(),d=>d.editing,'reopened editor');await tapText(page,'添加照片');await poll(fixture,f=>f.picks===2,'second publication picker');await pick(false);await poll(()=>page.data(),d=>!d.busy&&d.editForm?.photos.length===1,'native filesystem image upload');
  const uploaded=await fixture();check(uploaded.uploads===1&&uploaded.binaryValid,'native filesystem JPEG passes signature validation and binary request handling');check(uploaded.timeoutValid,'native binary upload applies the finite timeout');
  await (await page.$('.edit-photos .link')).tap();await poll(()=>page.data(),d=>d.editForm?.photos.length===0,'native photo removal');check((await page.data()).editForm.photos.length===0,'native removal preserves the current editor photo list');await (await page.$('.more')).tap();await poll(()=>page.data(),d=>!d.editing,'editor closed');
  state.postError=true;await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].refresh();return true;});await poll(()=>page.data(),d=>!d.loading&&!!d.loadError,'publication error');check(!!await page.$('.state-panel')&&!await page.$('.empty'),'publication failure renders a retry alert instead of an empty-success message');await pause(350);await mini.screenshot({path:path.join(out,'publication-retry-native.png')});
  state.postError=false;await tapText(page,'重新读取发布记录');await poll(()=>page.data(),d=>!d.loading&&!d.loadError,'publication retry');check((await page.data()).items.length===1,'publication retry restores actual fixture rows');
  page=await mini.reLaunch('/pages/merchant-services/index?merchantId=50000000-0000-4000-8000-000000000002');await poll(()=>page.data(),d=>!d.loading&&d.canEdit&&d.items.length===1,'service list');
  await tapText(page,'编辑并重新审核');await (await page.$('.add-photo')).tap();await poll(fixture,f=>f.picks===3,'service picker');await (await page.$('.link')).tap();await poll(()=>page.data(),d=>!d.editingId,'service cancelled with chooser pending');await pick(false);await pause(150);check((await fixture()).uploads===1&&!(await page.data()).editingId,'cancelled service editor drops its late chooser callback');
  await (await page.$('.add-photo')).tap();await poll(fixture,f=>f.picks===4,'new service photo');await pick(false);await poll(()=>page.data(),d=>!d.uploading&&d.photos.length===1,'service JPEG upload');check((await fixture()).uploads===2,'service photo upload uses the same guarded binary transport');
  await (await page.$('.add-photo')).tap();await poll(fixture,f=>f.picks===5,'bad service photo');await pick(true);await poll(()=>page.data(),d=>!d.uploading&&!!d.error,'invalid signature rejected');check((await fixture()).uploads===2&&(await page.data()).photos.length===1,'unsupported image never uploads and preserves the already selected photo');await pause(350);await mini.screenshot({path:path.join(out,'service-photo-error-native.png')});
  state.servicesError=true;await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].load();return true;});await poll(()=>page.data(),d=>!d.loading&&!!d.loadError,'service error');check(!!await page.$('.state-panel')&&!await page.$('.empty'),'service list failure has a retry alert and disables unverified editing');await pause(350);await mini.screenshot({path:path.join(out,'service-retry-native.png')});
  state.servicesError=false;await tapText(page,'重新读取服务项目');await poll(()=>page.data(),d=>!d.loading&&!d.loadError&&d.canEdit,'service retry');check((await page.data()).photos.length===1,'service retry preserves unsaved form photos');check(!errors.length,'no captured native runtime exceptions');
  fs.writeFileSync(path.join(out,'media-native-result.json'),JSON.stringify({checks,passed:checks.length,failed:0,errors,tool:await mini.send('Tool.getInfo'),source:'real WeChat compiler, rendered controls, local filesystem and wx.request transport to a loopback fixture HTTP server; image picker callbacks are mocked',httpFixtureServer:true,realBackend:false,realPicker:false,physicalDevice:false,checkedAt:new Date().toISOString()},null,2));
 }catch(e){try{await mini.screenshot({path:path.join(out,'media-native-failure.png')});}catch{}throw e;}finally{
  try{
   if(hooked)await mini.evaluate(()=>{const a=getApp(),f=a.globalData.__mediaNativeAudit;wx.request=f.request;wx.chooseMedia=f.chooseMedia;for(const file of f.files){try{wx.getFileSystemManager().unlinkSync(file);}catch{}}delete a.globalData.__mediaNativeAudit;return true;});
   for(const s of saved){if(s.exists)await mini.callWxMethod('setStorageSync',s.key,s.value);else await mini.callWxMethod('removeStorageSync',s.key);}
   if(hooked)await mini.reLaunch('/pages/home/index');
  }finally{await mini.disconnect();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
