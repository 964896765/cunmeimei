'use strict';
const {ApiError,text,uuid}=require('./rules');
function profilePatch(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError(400,'INVALID_PROFILE','个人资料格式无效');
 const patch={};
 for(const key of Object.keys(value)){
  if(!['displayName','bio','cityCode','avatarImageId'].includes(key))throw new ApiError(400,'INVALID_PROFILE','不支持的个人资料字段');
  if(key==='displayName')patch[key]=text(value[key],40,2);
  if(key==='bio')patch[key]=text(value[key],120);
  if(key==='cityCode'){patch[key]=text(value[key],6);require('./geography').cityReference(patch[key]);}
  if(key==='avatarImageId'){if(value[key]!==null&&!uuid(value[key]))throw new ApiError(400,'INVALID_IMAGE','头像标识无效');patch[key]=value[key];}
 }
 if(!Object.keys(patch).length)throw new ApiError(400,'INVALID_PROFILE','请选择要修改的资料');
 return patch;
}
module.exports={profilePatch};
