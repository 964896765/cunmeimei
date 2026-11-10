// Older clients and some desktop simulators expose chooseImage only.
let selecting=false;
const context=()=>['city_life_user_id','city_life_v2_auth_token'].map(key=>wx.getStorageSync?.(key)||'').join(':');
function chooseImages(options){
 if(selecting||Number(options.count)<=0)return false;
 const owner=context(),ticket={},count=Math.min(9,Math.max(1,Math.floor(Number(options.count)||1)));
 const release=()=>{if(selecting===ticket)selecting=false;};
 const fail=error=>{release();options.fail?.(error);if(!/cancel/i.test(error?.errMsg||'')&&!options.fail)wx.showToast({title:error?.code==='ACCOUNT_CHANGED'?'账号已变化，请重新选择图片':'未能选择图片，请重试',icon:'none'});};
 const success=result=>{release();if(context()!==owner){fail({code:'ACCOUNT_CHANGED',errMsg:'chooseImages:fail account changed'});return;}return options.success(result);};
 const common={...options,count,sizeType:['compressed'],success,fail,complete:r=>{release();options.complete?.(r);}};
 selecting=ticket;
 try{
  if(typeof wx.chooseMedia==='function'){wx.chooseMedia({...common,mediaType:['image']});return true;}
  if(typeof wx.chooseImage==='function'){
   wx.chooseImage({...common,success:r=>success({tempFiles:(r.tempFilePaths||[]).map((tempFilePath,i)=>({tempFilePath,size:r.tempFiles?.[i]?.size}))})});return true;
  }
 }catch(error){fail(error);return false;}
 release();
 wx.showToast({title:'当前微信版本不支持选择图片，请更新后重试',icon:'none'});
 return false;
}
module.exports={chooseImages};
