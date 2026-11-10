'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),sharp=require('../backend/node_modules/sharp');
const connect=require('./devtools_connection');const base='http://127.0.0.1:3100';
async function request(route,method='GET',body,auth={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.ok(r.ok,route+': '+r.status);return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function poll(read,accept){for(let i=0;i<60;i++){const value=await read();if(accept(value))return value;await new Promise(r=>setTimeout(r,200));}throw Error('Expected gallery state did not arrive');}
(async()=>{
 let pickerMethod='chooseImage';const mini=await connect(),errors=[],checks=[];
 const keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode'],original=[];
 for(const key of keys)original.push(await mini.callWxMethod('getStorageSync',key));mini.on('exception',e=>errors.push(e));
 const call=(name,...args)=>mini.evaluate((name,args)=>{const pages=getCurrentPages(),p=pages[pages.length-1];setTimeout(()=>Promise.resolve(p[name](...args)).catch(e=>console.error(e.message)),0);return true;},name,args);
 try{
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/local-business-result.json'),'utf8'));
  const owner=(await request('/api/v1/dev/login','POST',{devUser:fixture.ownerDevUser})).data;
  for(const [i,value] of [owner.token,owner.userId,true].entries())await mini.callWxMethod('setStorageSync',keys[i],value);
  const login=await request('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD});const admin={cookie:login.cookie,csrf:login.data.csrf};
  await mini.mockWxMethod('showModal',{confirm:true,cancel:false});
  const image=await sharp(Buffer.from('<svg width="600" height="420"><rect width="600" height="420" fill="#e8f2ed"/><path d="M140 250l100-130 100 130 100-80" fill="none" stroke="#176b5b" stroke-width="12"/><text x="300" y="330" text-anchor="middle" font-size="28" fill="#176b5b">DEVELOPMENT IMAGE CHECK</text><text x="300" y="375" text-anchor="middle" font-size="22" fill="#176b5b">NOT A REAL SERVICE PHOTO</text></svg>')).png().toBuffer();
  const localPath=await mini.evaluate(base64=>{const file=wx.env.USER_DATA_PATH+'/service-gallery-check.png';wx.getFileSystemManager().writeFileSync(file,base64,'base64');return file;},image.toString('base64'));
  pickerMethod=await mini.evaluate(()=>typeof wx.chooseMedia==='function'?'chooseMedia':'chooseImage');await mini.mockWxMethod(pickerMethod,pickerMethod==='chooseMedia'?{tempFiles:[{tempFilePath:localPath,size:image.length,fileType:'image'}]}:{tempFilePaths:[localPath],tempFiles:[{path:localPath,size:image.length}]});
  console.log('Creating gallery through actual service form');
  let page=await mini.reLaunch('/pages/merchant-services/index?merchantId='+fixture.merchantId);await poll(()=>page.data(),d=>d.canEdit);
  await (await page.$('.add-photo')).tap();await poll(()=>page.data(),d=>d.photos.length===1&&!d.uploading);
  const photo=(await page.data()).photos[0];checks.push('actual simulator file upload stores service photo in PostgreSQL');
  const title='服务图册开发验收'+Date.now();
  await (await page.$('input')).input(title);await (await page.$('textarea')).input('开发环境服务图册验收，图片是上传校验图，不代表真实服务。');
  let buttons=await page.$$('button.btn');await buttons[buttons.length-1].tap();
  const listed=await poll(()=>request('/api/v1/merchants/'+fixture.merchantId+'/services','GET',undefined,owner),r=>r.data.items.some(x=>x.title===title));const service=listed.data.items.find(x=>x.title===title);
  assert.deepEqual(service.imageIds,[photo.id]);assert.equal(service.status,'pending_review');checks.push('service text and gallery saved pending platform review');
  const queue=(await request('/admin/api/queue','GET',undefined,admin)).data;assert.deepEqual(queue.services.find(x=>x.id===service.id).imageIds,[photo.id]);
  assert.equal((await fetch(base+'/admin/api/media/'+photo.id,{headers:{Cookie:admin.cookie}})).status,200);checks.push('admin queue exposes the actual image for authorized review');
  assert.equal((await fetch(base+'/api/v1/media/'+photo.id+'?test=1')).status,404);
  await request('/admin/api/review-service','POST',{id:service.id,status:'published'},admin);
  page=await mini.reLaunch('/pages/detail/index?id='+service.id);await poll(()=>page.data(),d=>d.item?.imageIds?.length===1);
  assert.ok(await page.$('.gallery'));assert.equal((await fetch(base+'/api/v1/media/'+photo.id+'?test=1')).status,200);
  await mini.screenshot({path:path.join(__dirname,'../docs/product-service-gallery.png')});checks.push('approved gallery renders in actual service detail');
  page=await mini.reLaunch('/pages/merchant-services/index?merchantId='+fixture.merchantId);await poll(()=>page.data(),d=>d.items.some(x=>x.id===service.id));
  await call('editService',{currentTarget:{dataset:{id:service.id}}});await poll(()=>page.data(),d=>d.photos.length===1&&d.photos[0].path);
  await mini.pageScrollTo(9999);await mini.screenshot({path:path.join(__dirname,'../docs/product-service-editor.png')});checks.push('existing gallery reloads as private image in service editor');
  await (await page.$('input')).input(title+'修改');buttons=await page.$$('button.btn');await buttons[buttons.length-1].tap();
  await poll(()=>request('/api/v1/merchants/'+fixture.merchantId+'/services','GET',undefined,owner),r=>r.data.items.find(x=>x.id===service.id)?.status==='pending_review');
  assert.equal((await fetch(base+'/api/v1/media/'+photo.id+'?test=1')).status,404);checks.push('editing forces review and removes public image access');
  await request('/admin/api/review-service','POST',{id:service.id,status:'published'},admin);await call('load');await poll(()=>page.data(),d=>d.items.find(x=>x.id===service.id)?.status==='published');
  await call('serviceAction',{currentTarget:{dataset:{id:service.id,action:'pause'}}});
  await poll(()=>request('/api/v1/merchants/'+fixture.merchantId+'/services','GET',undefined,owner),r=>r.data.items.find(x=>x.id===service.id)?.status==='draft');
  assert.equal((await fetch(base+'/api/v1/media/'+photo.id+'?test=1')).status,404);checks.push('actual pause action hides service gallery');
  assert.equal(errors.length,0);checks.push('no captured simulator runtime exceptions');
  fs.writeFileSync(path.join(__dirname,'../docs/gallery-ui-result.json'),JSON.stringify({passed:checks.length,failed:0,checks,merchantId:fixture.merchantId,serviceId:service.id,imageId:photo.id,testData:true},null,2));
  for(const check of checks)console.log('PASS '+check);
 }finally{await mini.restoreWxMethod(pickerMethod);await mini.restoreWxMethod('showModal');for(let i=0;i<keys.length;i++)await mini.callWxMethod('setStorageSync',keys[i],original[i]);await mini.reLaunch('/pages/home/index');await mini.disconnect();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
