'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),mini=path.join(root,'miniprogram'),out=path.join(root,'docs/remediation/b123-2026-11-18'),backup=path.join(require('node:os').homedir(),'.codex/backups/city-life-miniapp');
const compiler='C:/Program Files (x86)/Tencent/微信web开发者工具/resources/app.asar.unpacked/node_modules/wcc-exec';
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const all=files(mini).map(file=>path.relative(mini,file).replaceAll('\\','/')),results=[];
for(const [binary,extension,extra]of [['wcc.exe','.wxml',['-d']],['wcsc.exe','.wxss',[]]]){
 const inputs=all.filter(file=>file.endsWith(extension)),target=path.join(backup,'b123-compiled-'+extension.slice(1)+'.js');
 const result=cp.spawnSync(path.join(compiler,binary),[...extra,'-o',target,...inputs],{cwd:mini,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4*1024*1024});
 results.push({compiler:binary,inputs:inputs.length,exitCode:result.status,passed:result.status===0&&!result.error,diagnostics:result.stderr||'',outputBytes:fs.existsSync(target)?fs.statSync(target).size:0});
}
const report={checkedAt:new Date().toISOString(),scope:'official local WXML/WXSS compilation, not an uploaded WeChat package or device acceptance',results};fs.writeFileSync(path.join(out,'view-compilation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.passed))process.exitCode=1;
