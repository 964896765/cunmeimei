'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {Pool}=require('../backend/node_modules/pg');
const output=path.resolve(__dirname,'../docs/remediation/publication-2026-11-14');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,accept,label){
 for(let attempt=0;attempt<80;attempt++){const value=await read();if(accept(value))return value;await pause(150);}
 throw Error('Timed out '+label);
}

async function main(){
 const dsn=process.env.PG_TEST_DATABASE_URL;require('../backend/src/test-database-guard').assertIsolatedDatabase(dsn);
 const control=new Pool({connectionString:dsn}),schema='publication_ui_'+crypto.randomBytes(6).toString('hex');
 const checks=[],exceptions=[];let pool,repo,server,mini,session,browser,cleanup,complete=false;
 fs.mkdirSync(output,{recursive:true});
 const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);console.log('PASS '+label);};
 try{
  await control.query('CREATE SCHEMA "'+schema+'"');const options='-c search_path='+schema;
  pool=new Pool({connectionString:dsn,options});await require('../backend/src/schema-migrations').applyMigrations(pool);
  repo=require('../backend/src/pg-repository').createPgRepository(dsn,{options});await repo.seedRegions(['中心街道']);
  const uid=await repo.upsertIdentity('dev_local','publication-ui-owner');
  const token='LOCAL_MEMORY_ONLY_FIXTURE_TOKEN_01234567890123456789';
  await repo.newSession(uid,crypto.createHash('sha256').update(token).digest('hex'),new Date(Date.now()+3600000).toISOString());
  server=require('../backend/src/server').createApp({repo,areas:['中心街道'],allowDevLogin:true,adminPassword:'isolated-publication-ui-operator'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const image=await repo.uploadContentImage(uid,await require('../backend/node_modules/sharp')({create:{width:80,height:80,channels:3,background:'#e5cfdc'}}).png().toBuffer());
  mini=await require('./devtools_connection')();mini.on('exception',error=>exceptions.push(String(error.message||error.description||error)));
  session=await require('./devtools_fixture_session')(mini,{origin,uid,globalKey:'__publicationAudit',bindRuntimeOrigin:true});
  const go=async route=>{
   await mini.reLaunch(route);const page=await poll(()=>mini.currentPage(),page=>page.path===route.split('?')[0].slice(1),'page '+route);
   await poll(()=>page.data(),data=>!data.loading&&!data.configLoading,'settled '+route);await pause(800);return mini.currentPage();
  };
  const capture=async file=>{await pause(150);await mini.screenshot({path:path.join(output,file)});};
  let page=await go('/pages/publish/index');
  check((await page.data()).categories.length===27,'all 27 industries remain available in the directory');
  check((await page.$$('.publish-tools')).length===0,'four publishing tools start collapsed');
  await (await page.$('.publish-tools-toggle')).trigger('tap');
  check((await poll(()=>page.$$('.drafts-button'),items=>items?.length===4,'four tool entries')).length===4,'grid button expands all four real tool entries');
  await capture('publish-tools.png');
  await (await page.$$('.drafts-button'))[0].trigger('tap');
  let legal=await poll(()=>mini.currentPage(),page=>page.path==='pages/legal/index','notice reader');
  await poll(()=>legal.data(),data=>!data.loading&&data.blocks?.length,'notice contents');
  check((await legal.data()).blocks.filter(block=>block.kind==='heading-2').length===12,'publishing guide opens all twelve notice chapters');
  await capture('publication-notice.png');
  page=await go('/pages/publish/index');
  await (await page.$$('.industry-choice'))[4].trigger('tap');
  await poll(()=>page.data(),data=>data.selectedCategory==='C05','housing selection');
  check((await page.data()).selectedCategory==='C05','housing industry selection uses the existing catalog');
  check((await poll(()=>page.$$('.project-art'),items=>items?.length===5,'housing illustrations')).length===5,'five actual housing projects have matched illustrations');
  await capture('publish-housing.png');
  await (await page.$('.publish-search-entry')).trigger('tap');await (await page.$('.project-search-input')).input('二手手机');
  await poll(()=>page.data(),data=>data.searchHasQuery,'project search');
  check((await page.data()).projects.some(item=>item.id==='C04G01S01'),'search finds a real project across the 418-item catalog');
  await capture('publish-search.png');
  await (await page.$('.project-search-cancel')).trigger('tap');
  check((await page.data()).selectedCategory==='C05','search cancellation restores the selected industry');

  page=await go('/pages/publish-form/index?categoryId=C04G01S01');
  const photoPath=await mini.evaluate(async id=>require('utils/api.js').privateImage(id),image.id);
  await page.setData({title:'隔离界面验收 · 二手手机',detail:'本条仅用于隔离数据库与微信开发者工具回归，不是真实物品信息。',price:'80',amount:'80',district:'中心街道',attributes:{categoryId:'C04G01S01',categoryVersion:'2.0-audit',templateCode:'GOODS',templateVersion:'3',cityCode:'310100',districtCode:'310101',priceMode:'amount',condition:'正常使用'},photos:[{id:image.id,path:photoPath}],photoCount:1,canAddPhoto:true});
  await (await page.$('.form-actions .primary')).trigger('tap');
  await poll(()=>page.data(),data=>data.preview,'publication preview');
  const confirmation=await poll(()=>page.$('#publication-confirmation'),Boolean,'confirmation component');
  await poll(()=>confirmation.data(),data=>!!data.document&&!data.loading,'notice version');
  check(!(await confirmation.data()).checked,'publication confirmation starts unchecked');
  check(!(await page.data()).publicationConsent,'unchecked preview has no consent payload');
  await mini.callWxMethod('pageScrollTo',{scrollTop:99999,duration:0});await capture('confirmation-unchecked.png');
  await (await page.$('.preview-actions .primary')).trigger('tap');
  check((await pool.query('SELECT count(*)::int n FROM publication_confirmations')).rows[0].n===0,'disabled submit creates no server confirmation');
  await (await confirmation.$('checkbox-group')).trigger('change',{value:['publication']});
  await poll(()=>page.data(),data=>data.publicationConsent?.accepted,'explicit checkbox callback');
  await capture('confirmation-checked.png');
  await (await page.$('.preview-actions .secondary')).trigger('tap');
  await poll(()=>page.data(),data=>!data.preview,'back to edit');
  check(!(await page.data()).publicationConsent,'returning to edit clears confirmation');
  await (await page.$('.form-actions .primary')).trigger('tap');
  const fresh=await poll(()=>page.$('#publication-confirmation'),Boolean,'fresh confirmation component');
  await poll(()=>fresh.data(),data=>!!data.document&&!data.loading,'fresh notice');
  check(!(await fresh.data()).checked,'reopened preview requires a new checkbox confirmation');
  const currentDocument=(await fresh.data()).document;
  await fresh.setData({document:{...currentDocument,version:'isolated-stale-version'}});
  await (await fresh.$('checkbox-group')).trigger('change',{value:['publication']});
  await poll(()=>page.data(),data=>data.publicationConsent?.version==='isolated-stale-version','stale notice fixture');
  await (await page.$('.preview-actions .primary')).trigger('tap');
  await poll(()=>page.data(),data=>!!data.error&&!data.submitting&&!data.publicationConsent,'stale confirmation recovery');
  await poll(()=>fresh.data(),data=>data.document?.version===currentDocument.version&&!data.loading,'reloaded current notice');
  check((await page.data()).title==='隔离界面验收 · 二手手机','stale notice rejection preserves the form');
  check(!(await fresh.data()).checked,'stale notice reload requires a fresh explicit checkbox');
  await capture('confirmation-stale-version.png');
  await (await fresh.$('checkbox-group')).trigger('change',{value:['publication']});
  await (await page.$('.preview-actions .primary')).trigger('tap');
  await poll(()=>mini.currentPage(),page=>page.path==='pages/my-posts/index','submitted records');
  const publication=(await pool.query('SELECT id,status FROM publications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[uid])).rows[0];
  check(publication?.status==='pending','actual submit enters platform review');
  const records=await repo.publicationRecords(publication.id);
  check(records.confirmations.length===1&&records.confirmations[0].userId===uid,'actual UI submission stores one confirmation bound to its owner');
  check(records.confirmations[0].content.title==='隔离界面验收 · 二手手机','confirmation stores the submitted content snapshot');

  page=await go('/pages/industry/index?projectId=C02G01S01');
  const industryConfirmation=await poll(()=>page.$('#publication-confirmation'),Boolean,'industry confirmation');
  await poll(()=>industryConfirmation.data(),data=>!!data.document,'industry notice');
  check(!(await industryConfirmation.data()).checked,'industry submission also starts with an unchecked confirmation');
  await mini.callWxMethod('pageScrollTo',{scrollTop:99999,duration:0});await capture('industry-confirmation.png');

  browser=await require('./headless_browser')();await browser.navigate(origin+'/admin');
  await poll(()=>browser.evaluate('!!document.querySelector("#login-form")'),Boolean,'admin login');
  await browser.evaluate('document.querySelector("#password").value="isolated-publication-ui-operator";document.querySelector("#login-form").requestSubmit();true');
  await poll(()=>browser.evaluate('!document.querySelector("#dashboard").hidden'),Boolean,'admin dashboard');
  await browser.evaluate('document.querySelector("#publication-record-id").value='+JSON.stringify(publication.id)+';document.querySelector("#publication-record-search").requestSubmit();true');
  await poll(()=>browser.evaluate('!!document.querySelector("#publication-record-result .publication-records")'),Boolean,'admin publication archive');
  check(await browser.evaluate('document.querySelector("#publication-record-result").textContent.includes("publication-1.0-20261114")'),'admin archive displays the recorded notice version');
  await browser.evaluate('const panel=document.querySelector("#publication-record-result");for(const detail of panel.querySelectorAll("details"))detail.open=true;panel.scrollIntoView();true');
  await browser.screenshot(path.join(output,'admin-publication-records.png'));
  check(exceptions.length===0,'no captured mini-program runtime exceptions');complete=true;
 }finally{
  let restoreError;
  try{if(session)cleanup=await session.restore();if(mini)await mini.reLaunch('/pages/publish/index');}catch(error){restoreError=error.message;}
  if(mini)await mini.disconnect();if(browser)await browser.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(repo)await repo.close();if(pool)await pool.end();
  await control.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await control.end();
  fs.writeFileSync(path.join(output,'ui-result.json'),JSON.stringify({status:complete&&!restoreError?'pass':'incomplete',checks,passed:checks.length,exceptions,cleanup,restoreError,physicalDevice:false,isolatedPostgres:true,checkbox:'explicit native component change callback fixture',checkedAt:new Date().toISOString()},null,2)+'\n');
  if(restoreError)throw Error(restoreError);
 }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
