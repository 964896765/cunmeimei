'use strict';
// Only files in this dedicated directory are disposable. Drafts and storage are untouched.
const valid=value=>/^[0-9a-f-]{36}$/i.test(value||'');
const directory=()=>wx.env.USER_DATA_PATH+'/profile-cache';
const generations=new Map();
function entries(uid){
 if(!valid(uid))return [];
 const fs=wx.getFileSystemManager();let names;try{names=fs.readdirSync(directory());}catch{return [];}
 return names.filter(name=>name.startsWith(uid+'_')&&/^[0-9a-f-]{36}_[0-9a-f-]{36}\.jpg$/i.test(name)).map(name=>{const path=directory()+'/'+name;return {path,size:fs.statSync(path).size};});
}
function size(uid){return entries(uid).reduce((total,file)=>total+file.size,0);}
function clear(uid){generations.set(uid,(generations.get(uid)||0)+1);const fs=wx.getFileSystemManager();for(const file of entries(uid))fs.unlinkSync(file.path);return size(uid);}
async function read(uid,id){
 if(!valid(uid)||!valid(id))throw Error('头像标识无效');
 const fs=wx.getFileSystemManager(),path=directory()+'/'+uid+'_'+id+'.jpg';
 try{fs.accessSync(path);return path;}catch{}
 const generation=generations.get(uid)||0,temporary=await require('./api').privateImage(id);
 // A late download must not create another account's persistent cache.
 if(wx.getStorageSync('city_life_user_id')!==uid)throw Error('账号已切换，请重试');
 if(generation!==(generations.get(uid)||0))return temporary;
 try{try{fs.accessSync(directory());}catch{fs.mkdirSync(directory(),true);}fs.copyFileSync(temporary,path);return path;}catch{return temporary;}
}
module.exports={read,size,clear};
