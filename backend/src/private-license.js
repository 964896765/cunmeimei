'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const crypto=require('node:crypto');
const {ApiError}=require('./rules');
const LIMIT=2*1024*1024;
function verifyImage(bytes,claimed){
 if(bytes.length<32)throw new ApiError(400,'INVALID_IMAGE','图片文件无效');
 const png=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.toString('ascii',12,16)==='IHDR';
 const jpg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9;
 const detected=png?'image/png':jpg?'image/jpeg':null;
 if(!detected||detected!==claimed)throw new ApiError(415,'UNSUPPORTED_IMAGE','仅接收真实 PNG/JPEG 图片，类型必须匹配');
 if(png){const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width>6000||height>6000)throw new ApiError(400,'INVALID_IMAGE','图片尺寸异常');}
 return detected;
}
async function readUpload(req){const claimed=(req.headers['content-type']||'').split(';')[0].toLowerCase().trim();if(!['image/jpeg','image/png'].includes(claimed))throw new ApiError(415,'UNSUPPORTED_IMAGE','只支持 PNG 或 JPEG 图片');
 const length=Number(req.headers['content-length']);if(req.headers['content-length']&&(!Number.isSafeInteger(length)||length<=0||length>LIMIT))throw new ApiError(413,'UPLOAD_TOO_LARGE','图片最多 2MB');
 const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>LIMIT)throw new ApiError(413,'UPLOAD_TOO_LARGE','图片最多 2MB');chunks.push(chunk);}
 const bytes=Buffer.concat(chunks,total);verifyImage(bytes,claimed);return {bytes,contentType:claimed};}
function checkedFile(base,id){if(!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id))throw Error('invalid id');return path.join(base,id+'.blob');}
async function writePrivate(base,id,bytes){await fs.mkdir(base,{recursive:true,mode:0o700});await fs.writeFile(checkedFile(base,id),bytes,{flag:'wx',mode:0o600});}
async function readPrivate(base,id){return fs.readFile(checkedFile(base,id));}
async function unlinkPrivate(base,id){await fs.unlink(checkedFile(base,id)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
module.exports={readUpload,verifyImage,writePrivate,readPrivate,unlinkPrivate,LIMIT};
