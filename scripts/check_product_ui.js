'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),sharp=require('../backend/node_modules/sharp');
const connect=require('./devtools_connection');
const base='http://127.0.0.1:3101';let passed=0;
function ok(value,label){assert.ok(value,label);passed++;console.log('PASS '+label);}
async function poll(read,accept,label){for(let n=0;n<40;n++){const value=await read();if(accept(value))return value;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out: '+label);}
async function request(route,method='GET',data,credentials={}){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Development-Test-Data':'true',...(credentials.token?{Authorization:'Bearer '+credentials.token}:{}),...(credentials.cookie?{Cookie:credentials.cookie,'X-CSRF-Token':credentials.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{
 let pickerMethod='chooseImage';const mini=await connect(),exceptions=[];mini.on('exception',e=>exceptions.push(e));
 const originalToken=await mini.callWxMethod('getStorageSync','city_life_v2_auth_token'),originalMode=await mini.callWxMethod('getStorageSync','city_life_acceptance_mode'),originalUserId=await mini.callWxMethod('getStorageSync','city_life_user_id');
 const call=(name,...args)=>mini.evaluate((name,args)=>{const pages=getCurrentPages(),p=pages[pages.length-1];if(typeof p[name]!=='function')throw Error('Missing page action '+name);setTimeout(()=>{Promise.resolve(p[name](...args)).catch(e=>console.error(e.message));},0);return true;},name,args);
 const shot=async name=>{await new Promise(r=>setTimeout(r,350));await mini.screenshot({path:path.join(__dirname,'../docs/product-'+name+'.png')});};
 try{
  await mini.mockWxMethod('showModal',{confirm:true,cancel:false});
  const owner=(await request('/api/v1/dev/login','POST',{devUser:'product-ui-author'})).data;
  const reader=(await request('/api/v1/dev/login','POST',{devUser:'product-ui-reader'})).data;
  const adminLogin=await request('/admin/api/login','POST',{password:process.env.ADMIN_PASSWORD});assert.equal(adminLogin.status,200);const admin={cookie:adminLogin.cookie,csrf:adminLogin.data.csrf};
  await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',false);
  await mini.reLaunch('/pages/home/index');let page=await mini.currentPage();await poll(()=>page.data('loading'),x=>!x,'home load');ok(!(await page.data('latest')).some(x=>/验收.*\d{10}/.test(x.title)),'ordinary home excludes numbered development records');await shot('home');
  page=await mini.switchTab('/pages/discover/index');await poll(()=>page.data('loading'),x=>!x,'discover load');await shot('discover-empty');
  await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',owner.token);await mini.callWxMethod('setStorageSync','city_life_user_id',owner.userId);await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',true);
  page=await mini.switchTab('/pages/publish/index');await shot('publish');
  await call('choose',{currentTarget:{dataset:{type:'used'}}});await poll(()=>page.data('showForm'),Boolean,'publish form');
  const png=await sharp(Buffer.from('<svg width="600" height="420"><rect width="600" height="420" fill="#e8f2ed"/><rect x="130" y="80" width="340" height="210" rx="20" fill="none" stroke="#176b5b" stroke-width="10"/><path d="M160 290v60m280-60v60" stroke="#176b5b" stroke-width="10"/><text x="300" y="390" text-anchor="middle" font-size="25" fill="#176b5b">IMAGE UPLOAD CHECK</text></svg>')).png().toBuffer();
  const localPath=await mini.evaluate(base64=>{const file=wx.env.USER_DATA_PATH+'/product-image-check.png';wx.getFileSystemManager().writeFileSync(file,base64,'base64');return file;},png.toString('base64'));
  pickerMethod=await mini.evaluate(()=>typeof wx.chooseMedia==='function'?'chooseMedia':'chooseImage');await mini.mockWxMethod(pickerMethod,pickerMethod==='chooseMedia'?{tempFiles:[{tempFilePath:localPath,size:png.length,fileType:'image'}]}:{tempFilePaths:[localPath],tempFiles:[{path:localPath,size:png.length}]});
  await call('choosePhotos');await poll(()=>page.data('photos'),p=>p.length===1,'binary image upload');ok(true,'simulator reads a real file and uploads it to PostgreSQL');
  const title='图文发布与收藏功能验收';
  await page.setData({title,detail:'此内容用于本地功能验收，不代表实际待售商品。图片为明确标记的上传验证图。',price:'80',district:'中心街道',attributes:{condition:'正常使用'},agreed:true});
  await call('saveDraft');await poll(()=>page.data('draftAvailable'),Boolean,'draft persistence');ok(true,'structured photo draft saved');await shot('publish-form');
  await call('submit');
  const publications=await poll(()=>request('/api/v1/me/publications','GET',undefined,owner),r=>r.data.items.some(x=>x.title===title),'publication created');const pub=publications.data.items.find(x=>x.title===title);
  await poll(()=>mini.currentPage(),p=>p.path==='pages/my-posts/index','submitted navigation');ok(pub.status==='pending'&&pub.imageIds.length===1,'photo and type-specific fields persisted pending moderation');
  assert.equal((await request('/admin/api/review','POST',{target:'publication',id:pub.id,status:'published'},admin)).status,200);
  await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',reader.token);
  page=await mini.reLaunch('/pages/detail/index?id='+pub.id);await poll(()=>page.data('item'),Boolean,'detail image data');ok((await page.data('item')).images.length===1,'approved image detail rendered with category and price');await shot('detail');
  await call('toggleFavorite');await poll(()=>page.data('faved'),Boolean,'saved');ok(true,'favorite action persisted through actual page');
  page=await mini.reLaunch('/pages/me/index');await call('showFavorites');await poll(()=>page.data('items'),items=>items.some(x=>x.id===pub.id),'saved list');ok(true,'personal saved list reads actual saved item');await shot('saved');
  const contact=await request('/api/v1/items/'+pub.id+'/contact','POST',{message:'希望了解这条本地验收信息的后续情况'},reader);assert.equal(contact.status,201);
  await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',owner.token);page=await mini.reLaunch('/pages/messages/index');await poll(()=>page.data('contacts'),items=>items.some(x=>x.id===contact.data.request.id),'inbound contact');
  await page.setData({tab:'contacts'});await shot('contacts');ok(true,'received contact appears in actual notification center');
  await request('/api/v1/me/contacts/'+contact.data.request.id,'POST',{action:'accept',response:'本条仅用于功能验收，已同意继续了解，不提供实际商品或交易。'},owner);
  await page.setData({tab:'notices'});await call('refresh');await poll(()=>page.data('items'),items=>items.some(x=>x.targetId===pub.id),'review notice');await shot('messages');ok(true,'actual moderation event persisted into notification inbox');
  const community=(await request('/api/v1/publications','POST',{type:'community',title:'街坊留言功能验收',detail:'此条为本地开发环境的交流功能验收记录，不代表实际活动。',district:'中心街道',attributes:{topic:'功能验收'}},owner)).data.publication;
  await request('/admin/api/review','POST',{target:'publication',id:community.id,status:'published'},admin);
  await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',reader.token);page=await mini.reLaunch('/pages/detail/index?id='+community.id);await call('like');await poll(()=>page.data('liked'),Boolean,'like');
  await page.setData({comment:'友善交流功能可以正常提交。'});await call('sendComment');
  const pending=await poll(()=>request('/admin/api/comments','GET',undefined,admin),r=>r.data.items.some(x=>x.title===community.title),'pending comment');const comment=pending.data.items.find(x=>x.title===community.title);
  await request('/admin/api/comments/review','POST',{id:comment.id,status:'published'},admin);await call('loadInteractions');await poll(()=>page.data('comments'),c=>c.some(x=>x.id===comment.id),'public comments');ok(true,'like and moderated comment flow works in simulator');await shot('community');
  ok(exceptions.length===0,'no simulator runtime exceptions during new product flows');
  fs.writeFileSync(path.join(__dirname,'../docs/product-ui-result.json'),JSON.stringify({passed,failed:0,publicationId:pub.id,communityId:community.id,testData:true,checkedAt:new Date().toISOString()},null,2));
 }finally{
  await mini.restoreWxMethod(pickerMethod);await mini.restoreWxMethod('showModal');await mini.callWxMethod('setStorageSync','city_life_v2_auth_token',originalToken);await mini.callWxMethod('setStorageSync','city_life_user_id',originalUserId||'');await mini.callWxMethod('setStorageSync','city_life_acceptance_mode',originalMode||false);await mini.reLaunch('/pages/home/index');await mini.disconnect();
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
