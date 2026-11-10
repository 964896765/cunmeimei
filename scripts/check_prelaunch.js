'use strict';
// Local source checks only. Real PG, devices and production are separate gates.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const env={...process.env,DATABASE_URL:'',PG_TEST_DATABASE_URL:''};
const checks=[];
function run(name,command,args){
 const result=spawnSync(command,args,{cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 const ok=result.status===0&&!result.error&&!result.signal;
 const output=String(result.stdout||'')+String(result.stderr||'');
 const counts={};for(const key of ['tests','pass','fail','skipped']){const match=output.match(new RegExp('^# '+key+' (\\d+)$','m'));if(match)counts[key]=Number(match[1]);}
 const check={name,status:ok?'pass':'fail',...(Object.keys(counts).length?{counts}:{})};checks.push(check);
 console.log((ok?'PASS ':'FAIL ')+name+(Object.keys(counts).length?' '+JSON.stringify(counts):''));
 // Business and test database URLs are cleared in these child commands.
 if(!ok)console.log(output.slice(-6000)||'Command unavailable or timed out');
}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
const syntaxFiles=['backend/src','backend/admin','miniprogram','scripts'].flatMap(dir=>files(path.join(root,dir))).filter(file=>file.endsWith('.js'));
const invalid=syntaxFiles.filter(file=>spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:10000}).status!==0).map(file=>path.relative(root,file));
checks.push({name:'javascript_syntax',status:invalid.length?'fail':'pass',files:syntaxFiles.length,invalid});
console.log((invalid.length?'FAIL ':'PASS ')+'javascript_syntax ('+syntaxFiles.length+' files)');
run('miniapp_structure_and_wxml',process.env.PYTHON||'python',['scripts/check_project.py']);
run('historical_integrity_and_routes',process.env.PYTHON||'python',['scripts/check_v25.py']);
run('local_business_smoke',process.execPath,['tests/smoke.js']);
run('non_pg_regression',process.execPath,['backend/src/run-tests.js']);
const {checkWxRelease}=require('./check_wx_release');
const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
const privateFile=path.join(root,'project.private.config.json');
const wx=checkWxRelease(project,require('../miniprogram/utils/runtime'),fs.existsSync(privateFile)?JSON.parse(fs.readFileSync(privateFile,'utf8')):{});
checks.push({name:'wechat_release_configuration',status:wx.ok?'pass':'blocked',errors:wx.errors});
console.log((wx.ok?'PASS ':'BLOCKED ')+'wechat_release_configuration '+wx.errors.join(', '));
const report={checkedAt:new Date().toISOString(),sourceChecksPassed:checks.every(c=>c.status!=='fail'),checks,
 requiredExternalEvidence:['isolated PostgreSQL regression and recovery','WeChat compilation and Android/iOS devices','production HTTPS, identity and permissions','production backups, alerts and operational compliance']};
fs.mkdirSync(path.join(root,'docs'),{recursive:true});
fs.writeFileSync(path.join(root,'docs/prelaunch-checks-result.json'),JSON.stringify(report,null,2)+'\n');
// A configured package alone never supplies the external sign-off evidence.
process.exitCode=checks.some(c=>c.status!=='pass')?1:0;
