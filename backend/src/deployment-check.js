'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {validRegionName}=require('./taxonomy');
const {parseTrustedProxyIps}=require('./client-address');
function validateDeployment(env,root=path.resolve(__dirname,'../..'),{requireProduction=false}={}){
 const errors=[];
 try{parseTrustedProxyIps(env.TRUSTED_PROXY_IPS||'');}catch{errors.push('TRUSTED_PROXY_IPS_INVALID');}
 const add=(condition,code)=>{if(!condition)errors.push(code);};
 add(['development','test','production'].includes(env.NODE_ENV),'NODE_ENV_REQUIRED');
 if(requireProduction)add(env.NODE_ENV==='production','PRODUCTION_MODE_REQUIRED');
 if(env.DATA_DRIVER!==undefined)add(['postgres','memory'].includes(env.DATA_DRIVER),'DATA_DRIVER_INVALID');
 if(env.NODE_ENV!=='production'&&env.HOST)add(['127.0.0.1','::1','localhost'].includes(env.HOST),'DEV_LOOPBACK_REQUIRED');
 for(const key of ['ALLOW_DEV_LOGIN','PLATFORM_PUBLISH_APPROVED','PLATFORM_CONTACT_APPROVED']){
  if(env[key]!==undefined)add(['true','false'].includes(env[key]),key+'_INVALID');
 }
 for(const key of ['OPERATOR_ADMIN_PERMISSIONS','VERIFIER_ADMIN_PERMISSIONS']){
  const grants=(env[key]||'').split(',').filter(Boolean);
  add(grants.every(value=>require('./admin-permissions').optionalPermissions.includes(value)),key+'_INVALID');
 }
 if(env.NODE_ENV==='production'){
  add(env.DATA_DRIVER==='postgres','PROD_POSTGRES_REQUIRED');
  let databaseConfigured=false;
  try{const database=new URL(env.DATABASE_URL||'');databaseConfigured=['postgres:','postgresql:'].includes(database.protocol)&&!!database.hostname&&database.pathname.length>1&&!database.hash;}catch{}
  add(databaseConfigured,'DATABASE_URL_REQUIRED');
  add(env.ALLOW_DEV_LOGIN==='false','PROD_DEV_LOGIN_DISABLED');
  add(/^wx[0-9a-f]{16}$/i.test(env.WECHAT_APPID||''),'WECHAT_APPID_REQUIRED');
  add((env.WECHAT_SECRET||'').length>=16,'WECHAT_SECRET_REQUIRED');
  add(require('./legal-documents').documents({operatorName:env.PLATFORM_OPERATOR_NAME||' ',contactEmail:env.PRIVACY_CONTACT_EMAIL||' '}).configured,'LEGAL_OPERATOR_AND_PRIVACY_CONTACT_REQUIRED');
  add((env.ADMIN_PASSWORD||'').length>=16,'ADMIN_PASSWORD_WEAK');
  for(const key of ['SUPER_ADMIN_PASSWORD','VERIFICATION_ADMIN_PASSWORD']){
   if(env[key])add(env[key].length>=16,key+'_WEAK');
  }
  const passwords=[env.ADMIN_PASSWORD,env.SUPER_ADMIN_PASSWORD,env.VERIFICATION_ADMIN_PASSWORD].filter(Boolean);
  add(new Set(passwords).size===passwords.length,'ADMIN_PASSWORDS_MUST_DIFFER');
  add(/^[A-Za-z0-9+/]{43}=$/.test(env.PHONE_ENCRYPTION_KEY||'')&&Buffer.from(env.PHONE_ENCRYPTION_KEY||'','base64').length===32,'PHONE_ENCRYPTION_KEY_REQUIRED');
  const areas=(env.SERVICE_AREAS||'').split(',').map(x=>x.trim()).filter(Boolean);
  add(areas.length>0&&areas.every(validRegionName),'SERVICE_AREAS_REQUIRED');
  const storage=env.PRIVATE_UPLOAD_DIR||'';
  const normalized=storage?path.resolve(root,storage):'';
  add(!!storage&&path.isAbsolute(storage),'PRIVATE_STORAGE_ABSOLUTE_PATH_REQUIRED');
  add(!!storage&&normalized!==root&&!normalized.startsWith(root+path.sep),'PRIVATE_STORAGE_OUTSIDE_SOURCE_REQUIRED');
  if(storage&&fs.existsSync(normalized)){
   try{add(fs.statSync(normalized).isDirectory(),'PRIVATE_STORAGE_NOT_DIRECTORY');}
   catch{errors.push('PRIVATE_STORAGE_UNREADABLE');}
  }
 }
 return {ok:errors.length===0,errors};
}
module.exports={validateDeployment};
