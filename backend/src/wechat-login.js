'use strict';
const {ApiError}=require('./rules');
function provider(appid,secret,fetcher=fetch){return async code=>{
 if(!appid||!secret)throw new ApiError(503,'WECHAT_NOT_CONFIGURED','微信登录服务尚未配置，可先继续浏览');
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),6000);
 try{const url='https://api.weixin.qq.com/sns/jscode2session?appid='+encodeURIComponent(appid)+'&secret='+encodeURIComponent(secret)+'&js_code='+encodeURIComponent(code)+'&grant_type=authorization_code';let response;try{response=await fetcher(url,{signal:abort.signal});}catch{throw new ApiError(502,'WECHAT_UNAVAILABLE','微信登录暂不可用，请稍后重试');}
  if(!response.ok)throw new ApiError(502,'WECHAT_UNAVAILABLE','微信登录暂不可用，请稍后重试');let result;try{result=await response.json();}catch{throw new ApiError(502,'WECHAT_UNAVAILABLE','微信登录响应异常，请重试');}
  if(!result||typeof result!=='object'||Array.isArray(result))throw new ApiError(502,'WECHAT_UNAVAILABLE','微信登录响应异常，请重试');
  if(result.errcode===45011)throw new ApiError(429,'WECHAT_LOGIN_LIMIT','微信登录较频繁，请稍后重试');
  if(result.errcode===40163)throw new ApiError(401,'WECHAT_CODE_USED','本次微信凭证已使用，请重新点击登录');
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(result.openid||'')||result.errcode)throw new ApiError(401,'WECHAT_CODE_INVALID','微信登录凭证无效，请重新点击登录');
  return result.openid;
 }finally{clearTimeout(timer);}
};}
module.exports={provider};
