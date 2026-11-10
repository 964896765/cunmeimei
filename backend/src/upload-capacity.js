'use strict';
const {ApiError}=require('./rules');
// Reject excess work immediately: queued uploads retain request buffers in memory.
function createCapacity(limit){
 let active=0;
 return async function run(work){
  if(active>=limit)throw new ApiError(503,'UPLOAD_BUSY','图片处理繁忙，请稍后重试');
  active++;
  try{return await work();}finally{active--;}
 };
}
// Shared across repositories and HTTP applications in this process.
const acceptUpload=createCapacity(2);
const processImage=createCapacity(1);
const MAX_IMAGE_PIXELS=16000000;
module.exports={createCapacity,acceptUpload,processImage,MAX_IMAGE_PIXELS};
