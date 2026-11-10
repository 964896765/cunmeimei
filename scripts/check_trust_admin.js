'use strict';
// Executes the actual admin DOM-building script against the real API; no browser or screenshot claim.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),base=require('../miniprogram/utils/runtime').apiBaseUrl;
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.hidden=false;this.value='';this.text='';}
 set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(x=>x.textContent||'').join('');}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}addEventListener(name,fn){this.listeners[name]=fn;}querySelector(){return null;}
}
(async()=>{const html=fs.readFileSync('backend/admin/index.html','utf8'),checks=[];
 for(const role of ['operator','verifier']){
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(x=>[x[1],new Element('div')]));let cookie='';const requests=[];
  const fetcher=async(route,options={})=>{requests.push({route,method:options.method||'GET'});const response=await fetch(base+route,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{})}});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return response;};
  const sandbox={document:{getElementById:id=>{if(!elements.has(id))throw Error('Missing real HTML element '+id);return elements.get(id);},createElement:tag=>new Element(tag)},fetch:fetcher,confirm:()=>false,prompt:()=>null,console,setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync('backend/admin/app.js','utf8'),sandbox);await new Promise(r=>setTimeout(r,200));elements.get('password').value=role==='verifier'?process.env.VERIFICATION_ADMIN_PASSWORD:process.env.ADMIN_PASSWORD;elements.get('admin-role').value=role;await elements.get('login-form').listeners.submit({preventDefault(){}});
  assert.equal(elements.get('dashboard').hidden,false,elements.get('message').textContent);assert.equal(elements.get('project-catalog').children.length,418);checks.push(role+': actual admin script renders the 418-item registry using authorized API');
  const buttons=[];function walk(e){if(e.tagName==='button')buttons.push(e.textContent);for(const c of e.children)walk(c);}for(const e of elements.values())walk(e);
  assert.ok(!buttons.some(x=>/实名通过|身份已核验|签发身份/.test(x)));assert.equal(buttons.some(x=>x==='核验房源或分类授权'),role==='verifier');checks.push(role+': business verification controls follow role and no manual identity certification control exists');
  assert.ok(requests.some(x=>x.route==='/admin/api/trust')&&requests.some(x=>x.route==='/admin/api/queue'));assert.equal(elements.get('password').value,'');checks.push(role+': existing and new admin queues load together, credential input is cleared');
 }
 fs.writeFileSync('docs/trust-admin-result.json',JSON.stringify({passed:checks.length,failed:0,checks,visualScreenshot:false,source:'actual admin script, DOM adapter and real local PostgreSQL API; browser launch blocked by tool policy',checkedAt:new Date().toISOString()},null,2));console.log('PASS '+checks.length+' admin script/API checks; browser visuals unverified');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
