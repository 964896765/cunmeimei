'use strict';
require('./devtools_image_compat');
const automator=require('../backend/node_modules/miniprogram-automator');
module.exports=async function connect(wsEndpoint='ws://127.0.0.1:9420'){
 let last;
 for(let attempt=0;attempt<40;attempt++){
  let mini;
  try{mini=await automator.connect({wsEndpoint});const page=await mini.currentPage();if(page?.path)return mini;throw Error('Simulator page not ready');}
  catch(e){last=e;if(mini)await mini.disconnect();await new Promise(r=>setTimeout(r,500));}
 }
 throw last;
};
