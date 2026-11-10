'use strict';
// PRE-SUBMISSION CHECK ONLY. A pass is not a WeChat compilation, audit or store approval.
const fs=require('node:fs');
const path=require('node:path');
function checkWxRelease(project,runtime,privateProject={}){
 const errors=[];
 if(!/^wx[0-9a-f]{16}$/i.test(project?.appid||''))errors.push('REAL_APPID_REQUIRED');
 if(project?.setting?.urlCheck!==true)errors.push('DOMAIN_CHECK_MUST_BE_ENABLED');
 if(privateProject?.setting?.urlCheck===false)errors.push('PRIVATE_DOMAIN_CHECK_MUST_BE_ENABLED');
 if(runtime?.mode!=='server')errors.push('SERVER_MODE_REQUIRED');
 if(runtime?.devLogin!==false)errors.push('DEV_LOGIN_MUST_BE_DISABLED');
 const url=String(runtime?.apiBaseUrl||'');
 try{const parsed=new URL(url),host=parsed.hostname.toLowerCase();
  const publicDomain=!require('node:net').isIP(host.replace(/^\[|\]$/g,''))&&host.length<=253&&host.split('.').length>=2&&host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))&&!/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host);
  if(parsed.protocol!=='https:'||!publicDomain||parsed.username||parsed.password||parsed.port||parsed.search||parsed.hash||parsed.pathname!=='/')errors.push('HTTPS_PUBLIC_API_REQUIRED');}
 catch{errors.push('HTTPS_PUBLIC_API_REQUIRED');}
 return {ok:errors.length===0,errors};
}
if(require.main===module){
 const root=path.resolve(__dirname,'..');
 const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
 const runtime=require(path.join(root,'miniprogram/utils/runtime.js'));
 const privatePath=path.join(root,'project.private.config.json');
 const privateProject=fs.existsSync(privatePath)?JSON.parse(fs.readFileSync(privatePath,'utf8')):{};
 const report=checkWxRelease(project,runtime,privateProject);
 console.log(JSON.stringify(report,null,2));
 if(!report.ok)process.exitCode=1;
}
module.exports={checkWxRelease};
