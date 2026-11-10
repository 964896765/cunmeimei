'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Pool}=require('../backend/node_modules/pg');
(async()=>{
 const report=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/prism-privacy-ui-result.json'),'utf8'));
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 try{
  const loginResponse=await fetch('http://127.0.0.1:3100/api/v1/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({devUser:report.ownerDevUser})});assert.equal(loginResponse.status,200);const login=await loginResponse.json();assert.equal(login.userId,report.ownerUserId);
  const headers={Authorization:'Bearer '+login.token};
  const settings=await fetch('http://127.0.0.1:3100/api/v1/me/preferences',{headers});assert.equal(settings.status,200);const prefs=await settings.json();assert.ok(prefs.theme==='prism'&&prefs.notificationPreview===false&&prefs.allowContacts===false&&prefs.revision>=6);
  const requests=await fetch('http://127.0.0.1:3100/api/v1/me/privacy-requests',{headers});assert.equal(requests.status,200);const row=(await requests.json()).items.find(x=>x.id===report.requestId);assert.ok(row&&row.status==='responded'&&row.response.includes('本地开发验收'));
  const audit=await pool.query("SELECT action FROM admin_audit_events WHERE target_id=$1 AND action IN ('privacy_request_read','privacy_request_responded')",[report.requestId]);assert.ok(audit.rows.some(x=>x.action==='privacy_request_read')&&audit.rows.some(x=>x.action==='privacy_request_responded'));
  fs.writeFileSync(path.join(__dirname,'../docs/prism-persistence-result.json'),JSON.stringify({passed:4,failed:0,checkedAt:new Date().toISOString()},null,2));
  console.log('PASS: identity, private preferences, request response and audit persist after database/backend restart (4 assertions)');
 }finally{await pool.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
