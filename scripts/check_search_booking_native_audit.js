'use strict';
// Actual WeChat rendering and HTTP transport; local fixture data, mocked GPS/modal.
// No business API, database migration, cloud connection or global cache clearing.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const connect=require('./devtools_connection'),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,accept,label){for(let i=0;i<80;i++){const value=await fn();if(accept(value))return value;await pause(100);}throw Error('Timed out: '+label);}
(async()=>{
 const out=path.resolve(__dirname,'../docs/local-ui-audit');fs.mkdirSync(out,{recursive:true});
 const state={feeds:[],held:[],failPage:0,bookingError:false,cancelPosts:0,cancelled:false};
 const send=(res,status,data)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 const feed=(q,page)=>({items:[{id:'fixture-'+q+'-'+page,type:'used',kind:'listing',title:'本地测试：'+q,district:'南城街道',price:'20',attributes:{},createdAt:'2026-11-01T01:00:00Z'}],pagination:{hasMore:page===1||page===501}});
 const bookingId='80000000-0000-4000-8000-000000000003';
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/v1/config')return send(res,200,{areas:['南城街道'],categories:[],features:{}});
  if(url.pathname==='/api/v1/feed'){
   const q=url.searchParams.get('q')||'发现页',page=Number(url.searchParams.get('page'));state.feeds.push({q,page});
   if(q==='本地旧请求'){state.held.push({res,q,page});return;}
   return send(res,state.failPage===page?503:200,state.failPage===page?{error:'LOCAL_FIXTURE_FAILURE',message:'本地测试：下一页暂不可用'}:feed(q,page));
  }
  if(url.pathname==='/api/v1/me/bookings')return send(res,state.bookingError?503:200,state.bookingError?{error:'LOCAL_FIXTURE_FAILURE',message:'本地测试：预约读取中断'}:{items:[{id:bookingId,serviceTitle:'本地测试预约（非真实服务）',status:state.cancelled?'cancelled':'pending_confirm',requestedAt:'2026-11-02T01:30:00Z',remark:'仅用于界面验收'},{id:'80000000-0000-4000-8000-000000000004',serviceTitle:'本地测试：时间缺失',status:'confirmed',requestedAt:null}]});
  // Commit the fixture cancellation, but return 503 to model an uncertain reply.
  if(url.pathname.endsWith('/cancel')&&req.method==='POST'){state.cancelPosts++;state.cancelled=true;return send(res,503,{error:'LOCAL_FIXTURE_UNCERTAIN',message:'本地测试：取消结果返回异常'});}
  if(url.pathname==='/api/v1/me/preferences')return send(res,200,{theme:'prism',largeText:false,reduceMotion:false,notificationPreview:true,allowContacts:true,revision:1});
  return send(res,200,{items:[],recorded:false});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const mini=await connect().catch(e=>{server.close();throw e;}),saved=[],checks=[],errors=[],uid='10000000-0000-4000-8000-000000000003';let hooked=false;
 const keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode','city_life_preferences_'+uid,'city_life_search_history_'+uid,'city_life_browse_city'];
 const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);console.log('PASS '+label);};
 mini.on('exception',e=>errors.push(String(e.message||e.description||'runtime exception')));
 try{
  const existing=(await mini.callWxMethod('getStorageInfoSync')).keys;
  for(const key of keys)saved.push({key,exists:existing.includes(key),value:await mini.callWxMethod('getStorageSync',key)});
  await mini.evaluate(({origin,uid})=>{
   const a=getApp(),f=a.globalData.__searchBookingAudit={request:wx.request,setStorage:wx.setStorageSync,modal:wx.showModal,location:wx.getLocation,targets:{exploreTarget:a.globalData.exploreTarget,exploreCategoryTarget:a.globalData.exploreCategoryTarget},blockHistory:false,modals:0};
   a.globalData.exploreTarget='';delete a.globalData.exploreCategoryTarget;
   wx.request=options=>f.request({...options,url:origin+options.url.replace(/^https?:\/\/[^/]+/,'')});
   wx.setStorageSync=(key,value)=>{if(f.blockHistory&&key==='city_life_search_history_'+uid)throw Error('LOCAL_FIXTURE_STORAGE_QUOTA');return f.setStorage(key,value);};
   wx.showModal=options=>{f.modals++;f.pendingModal=options;};
   wx.getLocation=options=>setTimeout(()=>options.success({latitude:999,longitude:113}),10);
   return true;
  },{origin,uid});hooked=true;
  await mini.callWxMethod('setStorageSync',keys[0],'LOCAL_SEARCH_BOOKING_UI_FIXTURE_TOKEN_0123456789');await mini.callWxMethod('setStorageSync',keys[1],uid);await mini.callWxMethod('setStorageSync',keys[2],false);await mini.callWxMethod('setStorageSync',keys[5],{cityCode:'441900',districtCode:'441900004'});
  const tap=async(page,label)=>{for(const b of await page.$$('button'))if((await b.text()).trim()===label){await b.tap();return;}throw Error('Button not found: '+label);};
  let page=await mini.reLaunch('/pages/search/index');await poll(()=>page.data(),d=>!d.loading&&!d.landingLoading,'search landing');
  await mini.evaluate(()=>{getApp().globalData.__searchBookingAudit.blockHistory=true;return true;});await (await page.$('input')).input('本地测试维修');await tap(page,'搜索');await poll(()=>page.data(),d=>!d.loading&&d.items.length===1,'search despite quota');
  check(!!(await page.data()).historyNotice&&state.feeds.some(x=>x.q==='本地测试维修'),'storage quota notice does not block an actual wx.request search');await pause(250);check(!!await page.$('.history-notice'),'search history failure has a visible local-only notice');
  await (await page.$('input')).input('本地旧请求');await tap(page,'搜索');await poll(async()=>state.held.length,n=>n===1,'held old query');await (await page.$('input')).input('本地新请求');await tap(page,'搜索');await poll(()=>page.data(),d=>!d.loading&&d.submittedQ==='本地新请求'&&d.items[0]?.id.includes('本地新请求'),'new query wins');
  for(const held of state.held.splice(0))send(held.res,200,feed(held.q,held.page));await pause(250);check((await page.data()).items[0].id.includes('本地新请求'),'delayed earlier HTTP results cannot replace the newer submitted query');
  state.failPage=2;await tap(page,'继续加载');await poll(()=>page.data(),d=>!d.loading&&!!d.error,'next-page failure');check((await page.data()).items.length===1,'failed next page retains current search results');await pause(250);await mini.screenshot({path:path.join(out,'search-pagination-retry-native.png')});
  state.failPage=0;await tap(page,'重试加载');await poll(()=>page.data(),d=>!d.loading&&!d.error&&d.page===2,'retry same page');check((await page.data()).items.length===2,'retry appends the failed page without discarding the first page');
  await mini.evaluate(()=>{const p=getCurrentPages().slice(-1)[0];p.fetchPage(501,p.version);return true;});await poll(()=>page.data(),d=>!d.loading&&d.limitReached,'pagination boundary');await pause(200);check(!(await page.data()).hasMore&&(await (await page.$('.list-end')).text()).includes('结果较多'),'pagination limit suggests narrowing the query instead of claiming all results were shown');
  await (await page.$('.search-content')).scrollTo(0,99999);await pause(350);await mini.screenshot({path:path.join(out,'search-limit-native.png')});
  page=await mini.reLaunch('/pages/discover/index');await poll(()=>page.data(),d=>!d.loading&&d.filtered.length===1,'discovery');await (await page.$('.sort-trigger')).tap();await poll(()=>page.data(),d=>d.sortOpen,'sort sheet');
  await (await page.$('[data-code="distance"]')).tap();await poll(()=>page.data(),d=>!d.sortBusy&&!!d.sortError,'invalid native location');check((await page.data()).sortOpen&&(await page.data()).sortCode==='latest'&&(await page.data()).filtered.length===1,'invalid GPS keeps previous discovery rows and the sorting sheet');await pause(350);await mini.screenshot({path:path.join(out,'discovery-location-error-native.png')});
  page=await mini.reLaunch('/pages/my-bookings/index');await poll(()=>page.data(),d=>!d.loading&&d.items.length===2,'booking list');check((await page.data()).items[0].time==='09:30','booking slot displays Beijing time');check((await page.data()).items[1].date==='时间待确认','missing booking time is shown without a fabricated epoch date');
  await (await page.$('.cancel')).tap();await poll(()=>mini.evaluate(()=>getApp().globalData.__searchBookingAudit.modals),n=>n===1,'cancel confirmation');check(!!(await page.data()).cancelingId,'cancel action is locked while confirmation is pending');
  await mini.evaluate(()=>{getApp().globalData.__searchBookingAudit.pendingModal.success({confirm:true});return true;});await poll(()=>page.data(),d=>!d.cancelingId&&!!d.actionError,'uncertain cancellation');check(state.cancelPosts===1,'uncertain cancellation issues one mutation');
  await (await page.$('.cancel')).tap();await pause(200);check(state.cancelPosts===1,'uncertain cancellation cannot be blindly resubmitted');await pause(200);await mini.screenshot({path:path.join(out,'booking-uncertain-native.png')});
  await tap(page,'刷新预约状态');await poll(()=>page.data(),d=>!d.loading&&!d.actionError&&d.items[0]?.status==='cancelled','confirm committed state');check(!(await page.data()).items[0].canCancel&&state.cancelPosts===1,'refresh reconciles a committed cancellation without sending it again');
  state.bookingError=true;await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].refresh();return true;});await poll(()=>page.data(),d=>!d.loading&&!!d.error,'booking list error');check((await page.data()).items.length===2,'booking read failure preserves existing rows');await pause(300);check(!!await page.$('.booking-error')&&!await page.$('.empty'),'booking error is distinct from a successful empty list');await mini.screenshot({path:path.join(out,'booking-retry-native.png')});
  state.bookingError=false;await tap(page,'重新读取预约');await poll(()=>page.data(),d=>!d.loading&&!d.error,'booking retry');check((await page.data()).items[0].status==='cancelled','booking retry preserves the confirmed server state');check(!errors.length,'no captured native runtime exceptions');
  fs.writeFileSync(path.join(out,'search-booking-native-result.json'),JSON.stringify({checks,passed:checks.length,failed:0,errors,tool:await mini.send('Tool.getInfo'),source:'real WeChat controls and wx.request to a loopback fixture server; GPS, storage quota and modal confirmation are simulated',httpFixtureServer:true,realBackend:false,physicalDevice:false,checkedAt:new Date().toISOString()},null,2));
 }catch(error){try{await mini.screenshot({path:path.join(out,'search-booking-native-failure.png')});}catch{}throw error;}finally{
  try{
   if(hooked)await mini.evaluate(()=>{const a=getApp(),f=a.globalData.__searchBookingAudit;wx.request=f.request;wx.setStorageSync=f.setStorage;wx.showModal=f.modal;wx.getLocation=f.location;a.globalData.exploreTarget=f.targets.exploreTarget;a.globalData.exploreCategoryTarget=f.targets.exploreCategoryTarget;delete a.globalData.__searchBookingAudit;return true;});
   for(const s of saved){if(s.exists)await mini.callWxMethod('setStorageSync',s.key,s.value);else await mini.callWxMethod('removeStorageSync',s.key);}
   if(hooked)await mini.reLaunch('/pages/home/index');
  }finally{await mini.disconnect();for(const held of state.held)held.res.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
