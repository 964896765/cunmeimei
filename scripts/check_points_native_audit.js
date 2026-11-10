'use strict';
// Real DevTools compiler/renderer; wx.request is replaced with explicit fixtures.
// No real login, mutation, database migration, server connection or deployment.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const connect=require('./devtools_connection');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const out=path.resolve(__dirname,'../docs/local-ui-audit');
async function poll(fn,accept,label){for(let i=0;i<60;i++){const v=await fn();if(accept(v))return v;await pause(100);}throw Error('Timed out: '+label);}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const mini=await connect(),checks=[],errors=[],uid='10000000-0000-4000-8000-000000000001';
 const keys=['city_life_v2_auth_token','city_life_user_id','city_life_acceptance_mode','city_life_preferences_'+uid],saved=[];
 const check=(v,label)=>{assert.ok(v,label);checks.push(label);console.log('PASS '+label);};
 let hooked=false;
 mini.on('exception',e=>errors.push(String(e.message||e.description||'runtime exception').replace(/1[3-9]\d{9}/g,'[REDACTED]')));
 try{
  const existing=(await mini.callWxMethod('getStorageInfoSync')).keys;
  for(const key of keys)saved.push({key,exists:existing.includes(key),value:await mini.callWxMethod('getStorageSync',key)});
  await mini.evaluate(uid=>{
   const app=getApp(),id='20000000-0000-4000-8000-000000000001';
   app.globalData.__pointsUiAudit={uid,requests:[],appeals:[],viewError:false,preferences:{theme:'prism',largeText:false,reduceMotion:false,notificationPreview:true,allowContacts:true,revision:1},rewards:[{id,publication_id:'30000000-0000-4000-8000-000000000001',rule_code:'publication_approved',rule_revision:2,amount:5,status:'rejected',revision:3,can_appeal:true,reason:'本地界面测试记录：用于验证申诉入口和状态展示',created_at:'2026-10-31T01:00:00Z',settle_after:'2026-11-02T01:00:00Z'}]};
   app.globalData.__pointsUiRequest=wx.request;
   wx.request=function(options){
    const f=app.globalData.__pointsUiAudit,p=options.url.replace(/^https?:\/\/[^/]+/,'').split('?')[0],method=options.method||'GET';f.requests.push({path:p,method});
    let data={items:[],hasMore:false},statusCode=200;
    if(p==='/api/v1/config')data={areas:['中心街道'],categories:[],features:{}};
    else if(p==='/api/v1/me/summary')data={publications:0,bookings:0,saved:0,unread:0};
    else if(p==='/api/v1/me')data={userId:f.uid};
    else if(p==='/api/v1/me/profile')data={id:f.uid,displayName:'本地界面测试账号',bio:'',avatarImageId:null,loginProviders:['dev_local']};
    else if(p==='/api/v1/me/preferences'){if(method==='PUT')f.preferences=options.data;data=f.preferences;}
    else if(p==='/api/v1/me/merchant-application')data={application:null};
    else if(p==='/api/v1/points/account')data={available:0,held:3,pending:5,earned:8,spent:5};
    else if(p==='/api/v1/points/rules')data={items:[{code:'publication_approved',enabled:false,amount:5,dailyLimit:10,publicationDailyLimit:5,settlementHours:48,revision:2}]};
    else if(p==='/api/v1/points/rewards'){data={items:f.rewards};if(f.viewError){statusCode=503;data={error:'TEST_NETWORK',message:'本地测试：请求失败后应允许重试'};}}
    else if(p==='/api/v1/points/ledger')data={items:[{id:'ledger-ui-1',kind:'hold',amount:3,available_delta:-3,held_delta:3,available_after:0,held_after:3,reason:'本地测试账本：不代表真实交易',created_at:'2026-10-31T01:00:00Z'}]};
    else if(p==='/api/v1/points/appeals')data={items:f.appeals};
    else if(p.endsWith('/appeals')&&method==='POST'){const a={id:'40000000-0000-4000-8000-000000000001',reason:options.data.reason,status:'pending',created_at:new Date().toISOString(),response:'',resolution:''};f.appeals=[a];f.rewards[0].can_appeal=false;f.rewards[0].open_appeal_id=a.id;data={appeal:a};statusCode=201;}
    else if(p.endsWith('/withdraw')&&method==='POST'){f.appeals[0].status='withdrawn';data={ok:true};}
    let ended=false;const timer=setTimeout(()=>{if(ended)return;ended=true;const r={statusCode,data,header:{}};options.success?.(r);options.complete?.(r);},20);
    return {abort(){if(ended)return;ended=true;clearTimeout(timer);const e={errMsg:'request:fail abort'};options.fail?.(e);options.complete?.(e);}};
   };
   return true;
  },uid);hooked=true;
  await mini.callWxMethod('setStorageSync',keys[0],'LOCAL_UI_FIXTURE_TOKEN_012345678901234567890123456789');await mini.callWxMethod('setStorageSync',keys[1],uid);await mini.callWxMethod('setStorageSync',keys[2],false);
  const page=await mini.reLaunch('/pages/me/index');await poll(()=>page.data(),d=>!d.summaryLoading,'personal summary');
  const tapText=async text=>{for(const b of await page.$$('button'))if((await b.text()).trim()===text){await b.tap();return;}throw Error('Button not found: '+text);};
  await (await page.$('.points-entry')).tap();await poll(()=>page.data(),d=>d.mode==='points'&&!d.pointsBusy,'points workspace');
  await mini.evaluate(()=>{const f=getApp().globalData.__pointsUiAudit;f.rewards=[f.rewards[0],{...f.rewards[0],id:'20000000-0000-4000-8000-000000000002'},{...f.rewards[0],id:'20000000-0000-4000-8000-000000000003'}];});await tapText('刷新积分明细');await poll(()=>page.data(),d=>!d.pointsBusy&&d.pointsRows.length===3,'three reward rows');
  const data=await page.data();check(data.pointsAccount?.available===0,'native points view preserves actual zero');check(data.pointsRows.length===3,'native points view renders multiple fixture rewards');check(data.pointsRows[0].dateLabel==='2026-10-31 09:00','native points view shows Beijing time');
  const buttons=await page.$$('button');let appealButton;for(const b of buttons)if((await b.text()).includes('申请积分复核')){appealButton=b;break;}check(appealButton,'native WXML include binds appeal control');await appealButton.tap();await poll(()=>page.data(),d=>!!d.pointsDraft,'appeal draft');await pause(350);
  const form=await page.$('.points-appeal-form'),cards=await page.$$('.section-card');check(!!form,'appeal form is rendered inside its selected reward');check((await form.offset()).top<(await cards[2].offset()).top,'first reward appeal form precedes the second reward, not the end of the list');
  const position=await mini.evaluate(()=>new Promise(resolve=>{const p=getCurrentPages().slice(-1)[0],id=p.data.pointsDraft.id;wx.createSelectorQuery().select('#reward-appeal-'+id).boundingClientRect().exec(r=>resolve({top:r[0]?.top,header:p.selectComponent('#navigation-header').data.headerHeight}));}));check(position.top>=position.header-2,'selected appeal form is visible below the measured header');
  await pause(350);await mini.screenshot({path:path.join(out,'points-inline-form-native.png')});
  await (await page.$('textarea')).input('本地界面验收：补充原始材料引用并申请复核');await tapText('提交申诉');await poll(()=>page.data(),d=>d.pointsView==='appeals'&&!d.pointsBusy,'appeal submitted');check((await page.data()).pointsRows[0].status==='pending','native appeal submission shows pending record');
  await pause(350);await mini.screenshot({path:path.join(out,'points-appeal-native.png')});
  await (await page.$('picker')).trigger('change',{value:1});await poll(()=>page.data(),d=>d.pointsView==='ledger'&&!d.pointsBusy,'ledger');check((await page.data()).pointsRows[0].subtitle.includes('-3'),'native ledger shows debit and hold separately');
  await pause(350);await mini.screenshot({path:path.join(out,'points-ledger-native.png')});
  await mini.evaluate(()=>{getApp().globalData.__pointsUiAudit.viewError=true;});await (await page.$('picker')).trigger('change',{value:0});await poll(()=>page.data(),d=>!!d.pointsError&&!d.pointsBusy,'error state');check((await page.data()).pointsRows.length===0,'native error state does not show fake reward data');
  await mini.evaluate(()=>{getApp().globalData.__pointsUiAudit.viewError=false;});await tapText('刷新积分明细');await poll(()=>page.data(),d=>!d.pointsBusy&&!d.pointsError,'retry');check((await page.data()).pointsRows.length===3,'native retry restores fixture reward');
  await (await page.$('picker')).trigger('change',{value:3});await poll(()=>page.data(),d=>d.pointsView==='rules'&&!d.pointsBusy,'rules');
  check(!errors.length,'no captured native runtime exceptions');
  fs.writeFileSync(path.join(out,'points-native-result.json'),JSON.stringify({checks,passed:checks.length,failed:0,errors,tool:await mini.send('Tool.getInfo'),registeredRoutes:JSON.parse(fs.readFileSync(path.resolve(__dirname,'../miniprogram/app.json'),'utf8')).pages.length,source:'real WeChat compiler and renderer, all request responses are explicit in-memory UI fixtures',realBackend:false,physicalDevice:false,checkedAt:new Date().toISOString()},null,2));
 }finally{
  try{
   for(const s of saved){if(s.exists)await mini.callWxMethod('setStorageSync',s.key,s.value);else await mini.callWxMethod('removeStorageSync',s.key);}
   if(hooked){await mini.evaluate(()=>{const a=getApp();wx.request=a.globalData.__pointsUiRequest;delete a.globalData.__pointsUiRequest;delete a.globalData.__pointsUiAudit;return true;});await mini.reLaunch('/pages/home/index');}
  }finally{await mini.disconnect();}
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
