'use strict';
const config=require('./runtime');
const KEY='city_life_v2_auth_token';
const online=()=>config.mode==='server';
function baseUrl(){
 if(!config.apiBaseUrl || !/^https:\/\//.test(config.apiBaseUrl)&&!/^(http:\/\/localhost|http:\/\/127\.0\.0\.1)(:\d+)?$/.test(config.apiBaseUrl))throw Error('服务端地址未配置为 HTTPS');
 return config.apiBaseUrl.replace(/\/$/,'');
}
function raw(method,path,data,token,options={}){return new Promise((resolve,reject)=>{
 wx.request({url:baseUrl()+path,method,data:data||{},timeout:options.timeout||10000,header:{'Content-Type':options.contentType||'application/json',...(config.devLogin&&wx.getStorageSync('city_life_acceptance_mode')?{'X-Development-Test-Data':'true'}:{}),...(token?{Authorization:'Bearer '+token}:{})},success(res){if(res.statusCode>=200&&res.statusCode<300)resolve(res.data);else{const err=Error(res.data?.message||'服务器请求失败');err.code=res.data?.error;reject(err);}},fail(){reject(Error('网络连接失败，请稍后重试。'));}});
});}
let signInPromise=null,exchange=null,sessionVersion=0;
const EXPIRY='city_life_session_expires_at';
const identity=()=>({owner:wx.getStorageSync('city_life_user_id')||'',token:wx.getStorageSync(KEY)||''});
function authError(code,message){const error=Error(message);error.code=code;return error;}
function wechatCode(){return new Promise((resolve,reject)=>wx.login({timeout:10000,success:r=>r.code?resolve(r.code):reject(authError('WECHAT_LOGIN_CANCELLED','未取得微信登录凭证，可重试或继续浏览')),fail:()=>reject(authError('WECHAT_LOGIN_CANCELLED','微信登录未完成，可重试或继续浏览'))}));}
function smsDeviceId(){
 const key='city_life_sms_installation',saved=wx.getStorageSync(key);
 if(typeof saved==='string'&&/^[\w-]{24,96}$/.test(saved))return saved;
 const id='sms_'+Date.now().toString(36)+'_'+Array.from({length:3},()=>Math.random().toString(36).slice(2).padEnd(10,'0')).join('');
 wx.setStorageSync(key,id);return id;
}
async function smsRequest(action,input){
 const started=identity(),version=sessionVersion,bound=input.purpose!=='signin';
 if(bound&&!hasSession())throw authError('SESSION_EXPIRED','登录已过期，请重新登录后重新获取验证码');
 const payload={...input,deviceId:smsDeviceId()};
 if(!bound)payload.wechatCode=await wechatCode();
 const check=()=>{const current=identity();if(version!==sessionVersion||started.owner!==current.owner||started.token!==current.token)throw authError('ACCOUNT_CHANGED','账号状态已变化，请重新获取验证码');};
 check();
 const result=await raw('POST','/api/v1/auth/sms/'+action,payload,bound?started.token:'',{timeout:15000});
 check();
 return result;
}
function login(options={}){if(hasSession()&&!options.force)return Promise.resolve(wx.getStorageSync(KEY));if(signInPromise)return signInPromise;let attempt;attempt=require('./auth-intent').request(options).finally(()=>{if(signInPromise===attempt)signInPromise=null;});signInPromise=attempt;return attempt;}
function completeLogin(nonce,consent,sms){const broker=require('./auth-intent');if(!broker.isCurrent(nonce))return Promise.reject(authError('AUTH_CANCELLED','原登录操作已取消'));if(exchange?.nonce===nonce)return exchange.promise;
 const version=sessionVersion,started=identity(),startedExpiry=wx.getStorageSync(EXPIRY);let attempt;attempt=(async()=>{
  let r;
  if(sms)r=await smsRequest('verify',{...sms,...consent,purpose:'signin'});
  else if(config.devLogin)r=await raw('POST','/api/v1/dev/login',{devUser:config.devUser});
  else r=await raw('POST','/api/v1/auth/wechat',{code:await wechatCode(),...consent});
  const current=identity();if(version!==sessionVersion||current.owner!==started.owner||current.token!==started.token||!broker.isCurrent(nonce))throw authError('AUTH_CANCELLED','原登录操作已取消');
  if(typeof r.token!=='string'||r.token.length<16||typeof r.userId!=='string'||!r.userId)throw Error('登录响应无效，请重试');
  try{wx.setStorageSync('city_life_user_id',r.userId);wx.setStorageSync(KEY,r.token);wx.setStorageSync(EXPIRY,Date.now()+Math.min(604800,Number(r.expiresIn)||604800)*1000);}catch{try{if(wx.getStorageSync('city_life_user_id')===r.userId){for(const [key,value]of [['city_life_user_id',started.owner],[KEY,started.token],[EXPIRY,startedExpiry]]){if(value)wx.setStorageSync(key,value);else wx.removeStorageSync(key);}}}catch{try{wx.removeStorageSync(KEY);wx.removeStorageSync('city_life_user_id');wx.removeStorageSync(EXPIRY);}catch{}}throw authError('SESSION_STORAGE_FAILED','无法保存登录状态，请清理空间后重试');}return r;
 })().finally(()=>{if(exchange?.promise===attempt)exchange=null;});exchange={nonce,promise:attempt};return attempt;
}
// All authenticated transports share account checks and a single reauthentication.
// Chooser contexts contain owner:token; validate them before asynchronous file work,
// then bind to the owner so a legitimate token refresh never crosses accounts.
function sessionGuard(expectedOwner,chooserContext=false){
 const version=sessionVersion,started=identity();let dispatchedOwner='';
 if(chooserContext&&expectedOwner&&[started.owner,started.token].join(':')!==expectedOwner)throw authError('ACCOUNT_CHANGED','账号已切换，请重新选择图片');
 const wanted=chooserContext?started.owner:expectedOwner;
 const check=()=>{const current=identity();if(wanted&&(current.owner||'guest')!==wanted||version!==sessionVersion||started.owner&&current.owner!==started.owner||dispatchedOwner&&current.owner!==dispatchedOwner)throw authError('ACCOUNT_CHANGED','账号状态已变化，请重新打开当前页面');};
 return {check,bind(){dispatchedOwner=identity().owner;check();}};
}
async function authenticated(transport,guard,reason='这项操作需要登录'){
 guard.check();const page=typeof getCurrentPages==='function'?getCurrentPages().slice(-1)[0]:null,route=page?.route||'';let replay=!hasSession(),token=hasSession()?wx.getStorageSync(KEY):await login({reason});guard.bind();
 const send=async value=>{guard.check();try{const result=await transport(value);guard.check();return result;}catch(e){guard.check();throw e;}};
 const withPhone=async value=>{try{return await send(value);}catch(e){if(e.code!=='PHONE_VERIFICATION_REQUIRED')throw e;await require('./auth-intent').requestPhone({reason:'这项业务需要单独验证手机号，号码默认不公开。'});guard.check();replay=true;return send(wx.getStorageSync(KEY));}};
 let result;try{result=await withPhone(token);}catch(e){
  if(['SESSION_EXPIRED','LOGIN_REQUIRED'].includes(e.code)){guard.check();const current=identity();if(signInPromise)token=await signInPromise;else if(current.token&&current.token!==token)token=current.token;else{if(current.token===token){wx.removeStorageSync(KEY);wx.removeStorageSync(EXPIRY);}token=await login({force:true,reason:'登录已过期，请重新登录后继续'});}guard.check();replay=true;result=await withPhone(token);}
  else if(e.code==='PHONE_VERIFICATION_REQUIRED'){await require('./auth-intent').requestPhone({reason:'这项发布或联系业务需要单独验证手机号，号码默认不公开。'});guard.check();replay=true;result=await send(wx.getStorageSync(KEY));}
  else throw e;
 }
 if(replay&&route)require('./auth-intent').notifyReplay(route,result);return result;
}
async function request(method,path,data,auth=false,expectedOwner){
 if(auth)return authenticated(token=>raw(method,path,data,token),sessionGuard(expectedOwner));
 const check=()=>{if(expectedOwner&&(identity().owner||'guest')!==expectedOwner)throw authError('ACCOUNT_CHANGED','账号状态已变化，请重新打开当前页面');};
 check();const result=await raw(method,path,data,'');check();return result;
}
function imageType(data){
 if(Object.prototype.toString.call(data)!=='[object ArrayBuffer]'||!data.byteLength)throw Error('图片内容为空，请重新选择 JPG 或 PNG 图片');
 if(data.byteLength>2*1024*1024)throw Error('图片最多2MB，请压缩后再试');
 const bytes=new Uint8Array(data);
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value))return 'image/png';
 throw Error('请选择有效的 JPG 或 PNG 图片');
}
async function uploadLicense(applicationId,buffer,contentType,expectedContext){
 if(!online())throw Error('仅服务端模式允许上传');
 const guard=sessionGuard(expectedContext,true),actualType=imageType(buffer);
 if(contentType&&actualType!==contentType)throw Error('图片格式与文件类型不一致，请重新选择');
 return authenticated(token=>raw('POST','/api/v1/merchant-applications/'+encodeURIComponent(applicationId)+'/license',buffer,token,{contentType:actualType,timeout:15000}),guard);
}
async function uploadMemorialProof(hallId,filePath){
 const guard=sessionGuard(undefined,true);
 const data=await new Promise((resolve,reject)=>wx.getFileSystemManager().readFile({filePath,success:r=>resolve(r.data),fail:()=>reject(Error('无法读取材料图片'))}));
 const contentType=imageType(data);guard.check();
 return authenticated(token=>raw('POST','/api/v1/memorial/halls/'+encodeURIComponent(hallId)+'/proofs',data,token,{contentType,timeout:15000}),guard);
}
function hasSession(){const expiry=Number(wx.getStorageSync(EXPIRY)||0);return !!wx.getStorageSync(KEY)&&(!expiry||expiry>Date.now());}
async function logout(){const started=identity();sessionVersion++;signInPromise=null;require('./auth-intent').cancel();require('./auth-intent').cancelPhone();let serverRevoked=!started.token;try{if(started.token)await raw('POST','/api/v1/auth/logout',{},started.token);serverRevoked=true;}catch(e){if(['SESSION_EXPIRED','LOGIN_REQUIRED'].includes(e.code))serverRevoked=true;}finally{const current=identity();if(current.owner===started.owner&&current.token===started.token&&!signInPromise){wx.removeStorageSync(KEY);wx.removeStorageSync('city_life_user_id');wx.removeStorageSync(EXPIRY);}}return {serverRevoked};}
function showError(e){wx.showToast({title:e.message||'请求失败',icon:'none',duration:2500});}
module.exports={online,request,login,completeLogin,logout,hasSession,uploadLicense,uploadMemorialProof,showError};
module.exports.sendSmsCode=input=>smsRequest('send',input);
module.exports.verifySmsPhone=input=>smsRequest('verify',{...input,purpose:'bind',phoneConsent:true});

async function uploadImage(filePath,expectedOwner){
 if(!online())throw Error('仅服务端模式允许上传');
 const guard=sessionGuard(expectedOwner,true);guard.check();
 const data=await new Promise((resolve,reject)=>wx.getFileSystemManager().readFile({filePath,success:r=>resolve(r.data),fail:()=>reject(Error('无法读取图片，请重新选择'))}));
 guard.check();const contentType=imageType(data);
 const result=await authenticated(token=>raw('POST','/api/v1/media',data,token,{contentType,timeout:15000}),guard);
 return result.image;
}
module.exports.uploadImage=uploadImage;

function discardDownload(filePath){try{wx.getFileSystemManager().unlink({filePath,fail(){}});}catch{}}
async function privateImage(id,route='/api/v1/media/'){
 const guard=sessionGuard(),temporary=new Set();let kept='';
 try{
  const url=baseUrl()+route+encodeURIComponent(id);
  const result=await authenticated(token=>new Promise((resolve,reject)=>wx.downloadFile({url,timeout:15000,header:{Authorization:'Bearer '+token},success:r=>{
   if(r.tempFilePath)temporary.add(r.tempFilePath);
   if(r.statusCode===200&&r.tempFilePath){resolve(r.tempFilePath);return;}
   reject(authError(r.statusCode===401?'SESSION_EXPIRED':'IMAGE_UNAVAILABLE',r.statusCode===403?'无权读取这张图片':'图片暂不可读取，请稍后重试'));
  },fail:()=>reject(Error('图片读取失败，请检查网络后重试'))})),guard);
  guard.check();kept=result;return result;
 }finally{for(const filePath of temporary)if(filePath!==kept)discardDownload(filePath);}
}
module.exports.privateImage=privateImage;

module.exports.privateMemorialProof=id=>privateImage(id,'/api/v1/memorial/me/proofs/');
