'use strict';
// Real WeChat rendering/controls/HTTP, isolated in-memory fixture backend and identity.
// No business DB, real booking, migration, persistent auth writes or deployment.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const connect=require('./devtools_connection'),fixtureSession=require('./devtools_fixture_session');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(fn,accept,label){for(let i=0;i<100;i++){const value=await fn();if(accept(value))return value;await pause(100);}throw Error('Timed out: '+label);}
(async()=>{
 const out=path.resolve(__dirname,'../docs/local-ui-audit');fs.mkdirSync(out,{recursive:true});
 const screenshots=!process.argv.includes('--no-screenshots'),recoveryScreenshots=process.argv.includes('--capture-recovery');
 fs.writeFileSync(path.join(out,'booking-flow-native-result.json'),JSON.stringify({status:'running',checkedAt:new Date().toISOString()},null,2));
 const sid='30000000-0000-4000-8000-000000000006',mid='40000000-0000-4000-8000-000000000006',bid='50000000-0000-4000-8000-000000000006',uid='10000000-0000-4000-8000-000000000006';
 const dateAfter=n=>new Date(Date.now()+8*3600000+n*86400000).toISOString().slice(0,10),day=dateAfter(1),next=dateAfter(2),later=dateAfter(3);
 const state={slotFail:false,holdDate:'',held:[],posts:[],bookings:[],rejections:[],rejectNext:false,visible:false,serviceMissing:false,merchantStatus:'pending_confirm',merchantFail:false,forbidden:false,actions:[],actionMode:'fail'};
 const send=(res,status,data)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 const fail=res=>send(res,503,{error:'LOCAL_FIXTURE_FAILURE',message:'本地测试：结果暂未返回，请核对'});
 const slots=(date)=>({serviceId:sid,date,timezone:'Asia/Shanghai',slots:[{time:'10:00',available:true},{time:'11:00',available:true},{time:'11:00',available:true},{time:'15:00',available:false}]});
 const merchantRow=()=>({id:bid,serviceId:sid,serviceTitle:'本地测试家电维修服务',status:state.merchantStatus,requestedAt:day+'T02:00:00.000Z',remark:'本地测试备注，不含真实客户数据'});
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1');let body={};
   if(req.method==='POST'){const chunks=[];for await(const chunk of req)chunks.push(chunk);body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}
   if(url.pathname==='/api/v1/items/'+sid)return state.serviceMissing?send(res,404,{error:'NOT_FOUND',message:'本地测试：服务已暂停公开'}):send(res,200,{item:{id:sid,title:'本地测试家电维修服务',kind:'service',type:'service',district:'中心街道',price:'面议',images:[],attributes:{}}});
   if(url.pathname==='/api/v1/services/'+sid+'/slots'){
    const date=url.searchParams.get('date');if(date===state.holdDate){state.held.push({res,date});return;}
    return state.slotFail?fail(res):send(res,200,slots(date));
   }
   if(url.pathname==='/api/v1/bookings'&&req.method==='POST'){
    state.posts.push(body);const requestedAt=new Date(body.date+'T'+body.time+':00+08:00').toISOString();
    if(state.rejectNext){state.rejectNext=false;state.rejections.push({clientKey:body.clientKey,errorCode:'SLOT_TAKEN'});return fail(res);}
    const existing=state.bookings.find(b=>b.clientKey===body.clientKey);
    if(existing)return send(res,200,{booking:existing,replayed:true});
    state.bookings.push({id:bid.slice(0,-1)+String(state.bookings.length+1),serviceId:sid,clientKey:body.clientKey,status:'pending_confirm',requestedAt,remark:body.remark});return fail(res);
   }
   if(url.pathname.startsWith('/api/v1/me/booking-submissions/')){const key=url.pathname.split('/').at(-1),rejection=state.rejections.find(r=>r.clientKey===key);if(rejection)return send(res,200,{...rejection,rejected:true});const found=state.visible&&state.bookings.find(b=>b.clientKey===key);return found?send(res,200,{booking:found,replayed:true}):send(res,404,{error:'BOOKING_SUBMISSION_NOT_FOUND',message:'本地测试：尚未找到本次申请'});}
   if(url.pathname==='/api/v1/me/bookings')return send(res,200,{items:state.visible?state.bookings:[]});
   if(url.pathname==='/api/v1/merchants/'+mid+'/bookings'){
    if(state.forbidden)return send(res,403,{error:'MERCHANT_FORBIDDEN',message:'本地测试：无权读取该商家的预约'});
    return state.merchantFail?fail(res):send(res,200,{items:[merchantRow()]});
   }
   if(url.pathname==='/api/v1/merchants/'+mid+'/bookings/'+bid+'/action'&&req.method==='POST'){
    state.actions.push(body);state.merchantStatus=body.action==='complete'?'completed':body.action==='decline'?'declined':'confirmed';
    return state.actionMode==='fail'?fail(res):send(res,200,{booking:merchantRow()});
   }
   if(url.pathname==='/api/v1/me/preferences')return send(res,200,{theme:'prism',largeText:false,reduceMotion:true,notificationPreview:true,allowContacts:true,revision:1});
   return send(res,200,{items:[],unread:0});
  }catch{send(res,400,{error:'INVALID_FIXTURE_REQUEST'});}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let mini,session,cleanup;const checks=[],errors=[];
 const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);console.log('PASS '+label);};
 const tap=async(page,label)=>{for(const el of await page.$$('button'))if((await el.text()).trim()===label){await el.tap();return;}throw Error('Button not found: '+label);};
 try{
  mini=await connect();mini.on('exception',error=>errors.push(String(error.message||error.description||'runtime exception')));
  const captureRecovery=mini.screenshot.bind(mini);
  if(!screenshots)mini.screenshot=async()=>{};
  session=await fixtureSession(mini,{origin:'http://127.0.0.1:'+server.address().port,uid,globalKey:'__bookingFlowAudit'});
  let page=await mini.reLaunch('/pages/booking/index?id='+sid);
  await poll(()=>page.data(),d=>!d.loadingItem&&!d.loadingSlots&&d.openSlots.length===2,'initial slots');
  await (await page.$('textarea')).input('本地测试：保留原预约备注');await poll(()=>page.data(),d=>d.remark==='本地测试：保留原预约备注','remark input');
  const choose=async date=>{await (await page.$$('picker'))[0].trigger('change',{value:date});};
  state.holdDate=day;await choose(day);await poll(async()=>state.held.length,n=>n===1,'old date held');
  await choose(next);await poll(()=>page.data(),d=>d.date===next&&!d.loadingSlots&&d.time==='10:00','new date slots');
  for(const held of state.held.splice(0))send(held.res,200,{...slots(held.date),slots:[{time:'16:00',available:true}]});state.holdDate='';
  await pause(350);let data=await page.data();check(data.date===next&&data.time==='10:00','old date response cannot overwrite the current slot');
  state.slotFail=true;await choose(later);await poll(()=>page.data(),d=>!!d.slotError&&!d.loadingSlots,'slot failure');
  data=await page.data();check(data.remark==='本地测试：保留原预约备注'&&data.time===''&&!!await page.$('.booking-slot-error'),'failed slot read shows retry and retains the remark');
  await mini.screenshot({path:path.join(out,'booking-slot-recovery-native.png')});
  state.slotFail=false;await tap(page,'重新查询时段');await poll(()=>page.data(),d=>!d.slotError&&!d.loadingSlots&&d.time==='10:00','slot retry');
  await (await page.$$('picker'))[1].trigger('change',{value:1});await poll(()=>page.data(),d=>d.time==='11:00','second slot selected');
  await choose(later);await poll(()=>page.data(),d=>!d.loadingSlots&&d.time==='11:00','same date reread');
  check((await page.data()).slotIndex===1,'available selection survives a same-day refresh');
  await tap(page,'提交预约申请');await poll(()=>page.data(),d=>d.pendingCheck&&!d.submitting,'unknown create result');
  check(state.posts.length===1&&state.bookings.length===1,'unknown response sends one POST and does not retry automatically');
  const original={...state.posts[0]};
  await choose(next);const remarkInput=await page.$('textarea');
  await remarkInput.trigger('input',{value:'不应替换原申请'});await pause(200);data=await page.data();
  check(data.date===original.date&&data.remark===original.remark&&await remarkInput.property('disabled')===true&&await remarkInput.value()===original.remark,'unknown create result freezes the original date and rendered remark');
  page=await mini.reLaunch('/pages/my-bookings/index');await poll(()=>page.data(),d=>!d.loading&&d.pendingItems.length===1,'pending booking entry');
  check(!!await page.$('.booking-pending-entry')&&state.posts.length===1,'my bookings exposes the saved pending request without submitting again');
  if(recoveryScreenshots)await captureRecovery({path:path.join(out,'booking-pending-entry-native.png')});
  await tap(page,'继续核对原申请');page=await poll(()=>mini.currentPage(),p=>p.path==='pages/booking/index','resume pending navigation');await poll(()=>page.data(),d=>d.pendingCheck&&!d.loadingItem,'restored booking page');data=await page.data();
  check(data.date===original.date&&data.time===original.time&&data.remark===original.remark&&await mini.evaluate(()=>getCurrentPages().slice(-1)[0]._pending.payload.clientKey)===original.clientKey&&state.posts.length===1,'page recreation restores the original date, remark and request key without a POST');
  await tap(page,'核对预约结果');await poll(()=>page.data(),d=>!d.checking&&d.submitError.includes('暂未查到'),'inconclusive check');
  check((await page.data()).pendingCheck&&state.posts.length===1,'no matching record keeps the result uncertain without a new POST');
  await mini.screenshot({path:path.join(out,'booking-result-check-native.png')});
  state.serviceMissing=true;page=await mini.reLaunch('/pages/booking/index?id='+sid);await poll(()=>page.data(),d=>!d.loadingItem&&d.pendingCheck&&!!d.itemError,'paused service recovery');
  check(!!await page.$('.booking-pending-check')&&!!await page.$('.booking-item-error'),'paused public service retains the independent booking reconciliation controls');
  if(recoveryScreenshots)await captureRecovery({path:path.join(out,'booking-paused-recovery-native.png')});
  state.visible=true;await tap(page,'核对预约结果');await poll(()=>page.data(),d=>!!d.submitted&&!d.checking,'reconcile committed booking');
  check(state.posts.length===1&&!(await page.data()).pendingCheck,'matching active booking acknowledges the original creation without resubmission');
  await mini.screenshot({path:path.join(out,'booking-acknowledged-native.png')});
  state.serviceMissing=false;
  page=await mini.reLaunch('/pages/booking/index?id='+sid);await poll(()=>page.data(),d=>!d.loadingItem&&!d.loadingSlots&&!!d.time,'new form');
  await choose(day);await poll(()=>page.data(),d=>d.date===day&&!d.loadingSlots&&!!d.time,'second request date');
  await (await page.$('textarea')).input('本地测试：只重试原申请');await poll(()=>page.data(),d=>d.remark==='本地测试：只重试原申请','retry remark');
  await tap(page,'提交预约申请');await poll(()=>page.data(),d=>d.pendingCheck&&!d.submitting,'second unknown request');const snapshot=state.posts.at(-1),logical=state.bookings.length;
  await tap(page,'重试原申请');await poll(()=>page.data(),d=>!!d.submitted&&!d.submitting,'explicit same request retry');
  check(JSON.stringify(snapshot)===JSON.stringify(state.posts.at(-1))&&state.bookings.length===logical,'explicit retry preserves the exact original payload and fixture replays it');
  page=await mini.reLaunch('/pages/booking/index?id='+sid);await poll(()=>page.data(),d=>!d.loadingItem&&!d.loadingSlots&&!!d.time,'rejection form');state.rejectNext=true;
  await tap(page,'提交预约申请');await poll(()=>page.data(),d=>d.pendingCheck&&!d.submitting,'unknown rejection response');const postCount=state.posts.length;
  await tap(page,'核对预约结果');await poll(()=>page.data(),d=>!d.pendingCheck&&!d.checking&&!!d.rejectedText,'recorded rejection');
  check(!!await page.$('.booking-rejected')&&state.posts.length===postCount&&state.bookings.length===logical,'recorded rejection releases uncertainty without creating or retrying a booking');
  page=await mini.reLaunch('/pages/merchant-bookings/index?merchantId='+mid);await poll(()=>page.data(),d=>!d.loading&&d.canAct&&d.items.length===1,'merchant bookings');
  check((await page.data()).items[0].requestedLabel===day+' 10:00（北京时间）','merchant appointment shows Beijing time');
  await tap(page,'确认预约');await poll(()=>page.data(),d=>d.busyId===bid,'merchant modal lock');await tap(page,'确认预约');await pause(150);
  check(await mini.evaluate(()=>getApp().globalData.__bookingFlowAudit.modalCount)===1&&state.actions.length===0,'repeated confirm taps open one modal and send no premature mutation');
  const answer=()=>mini.evaluate(()=>{const f=getApp().globalData.__bookingFlowAudit,m=f.pendingModal;delete f.pendingModal;m.success({confirm:true});return true;});
  await answer();await poll(()=>page.data(),d=>!!d.actionError&&!d.busyId,'unknown merchant action');await tap(page,'确认预约');await pause(150);
  check(state.actions.length===1,'unknown merchant mutation blocks repeat processing until a successful refresh');
  await mini.screenshot({path:path.join(out,'merchant-booking-result-check-native.png')});
  await tap(page,'核对预约状态');await poll(()=>page.data(),d=>!d.loading&&!d.actionError&&d.items[0]?.status==='confirmed','merchant reconciliation');
  check(state.actions.length===1&&(await page.data()).canAct,'refresh reads the acknowledged server state without repeating the mutation');
  state.actionMode='ok';await tap(page,'标记服务已完成');await poll(()=>mini.evaluate(()=>!!getApp().globalData.__bookingFlowAudit.pendingModal),Boolean,'complete modal');await answer();
  await poll(()=>page.data(),d=>!d.loading&&!d.busyId&&d.items[0]?.status==='completed','merchant completion');
  check(state.actions.length===2&&(await page.data()).items[0].statusText==='已完成','completion updates the row after a matching server acknowledgment');
  state.merchantFail=true;await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].load();return true;});await poll(()=>page.data(),d=>!d.loading&&!!d.error,'merchant list failure');data=await page.data();
  check(data.items.length===1&&!data.canAct&&!!await page.$('.merchant-booking-error'),'failed permission read retains rows and pauses processing');
  await mini.screenshot({path:path.join(out,'merchant-booking-read-retry-native.png')});
  state.merchantFail=false;await tap(page,'重新读取预约');await poll(()=>page.data(),d=>!d.loading&&d.canAct&&!d.error,'merchant retry');
  state.forbidden=true;await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].load();return true;});await poll(()=>page.data(),d=>!d.loading&&!!d.error&&!d.items.length,'merchant permission denied');
  check(!(await page.data()).canAct,'explicit permission denial removes private customer rows');check(!errors.length,'no captured native runtime exceptions');
  const tool=await mini.send('Tool.getInfo');cleanup=await session.restore();session=null;
  await mini.reLaunch('/pages/home/index');
  check(cleanup.authStorageUnchanged&&cleanup.runtimeOverlayRemoved,'runtime fixture removed and original authentication storage unchanged');
  fs.writeFileSync(path.join(out,'booking-flow-native-result.json'),JSON.stringify({status:'pass',checks,passed:checks.length,failed:0,errors,tool,screenshots,recoveryScreenshots,source:'real WeChat controls and wx.request to a loopback HTTP fixture; modal callbacks simulated',httpFixtureServer:true,realBackend:false,physicalDevice:false,persistentFixtureIdentity:false,cleanup,checkedAt:new Date().toISOString()},null,2));
  fs.writeFileSync(path.join(out,'booking-flow-cleanup.json'),JSON.stringify({...cleanup,page:(await mini.currentPage()).path,checkedAt:new Date().toISOString()},null,2));
 }catch(error){fs.writeFileSync(path.join(out,'booking-flow-native-result.json'),JSON.stringify({status:'fail',checks,passed:checks.length,failed:1,error:error.message,screenshots,checkedAt:new Date().toISOString()},null,2));try{if(mini)await mini.screenshot({path:path.join(out,'booking-flow-native-failure.png')});}catch{}throw error;}
 finally{
  try{if(session){cleanup=await session.restore();await mini.reLaunch('/pages/home/index');fs.writeFileSync(path.join(out,'booking-flow-cleanup.json'),JSON.stringify({...cleanup,runCompleted:false,page:(await mini.currentPage()).path,checkedAt:new Date().toISOString()},null,2));}}
  finally{if(mini)await mini.disconnect();for(const held of state.held)held.res.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
