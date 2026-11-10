'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('../backend/node_modules/pg');
const automator=require('../backend/node_modules/miniprogram-automator');
(async()=>{
 const report=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/local-business-result.json'),'utf8'));
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 let mini;
 try{
  const p=await pool.query('SELECT status FROM publications WHERE id=$1',[report.publicationId]);assert.equal(p.rows[0].status,'published');
  const s=await pool.query('SELECT status FROM service_catalog WHERE id=$1',[report.serviceId]);assert.equal(s.rows[0].status,'published');
  const b=await pool.query('SELECT status FROM booking_requests WHERE id=$1',[report.bookingId]);assert.equal(b.rows[0].status,'completed');
  const m=await pool.query('SELECT status FROM verified_merchants WHERE id=$1',[report.merchantId]);assert.equal(m.rows[0].status,'active');
  console.log('PASS: publication, merchant, service and completed booking retained after restart');
  mini=await require('./devtools_connection')();
  const token=await mini.callWxMethod('getStorageSync','city_life_v2_auth_token');
  const r=await fetch('http://127.0.0.1:3100/api/v1/me',{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);
  console.log('PASS: pre-restart simulator session still authenticated by restarted API');
  const ready=await fetch('http://127.0.0.1:3100/api/v1/ready');assert.equal(ready.status,200);
  console.log('PASS: restarted API verifies database schema');
  let assertions=6;
  const productPath=path.join(__dirname,'../docs/product-ui-result.json');
  if(fs.existsSync(productPath)){const product=JSON.parse(fs.readFileSync(productPath,'utf8'));const images=await pool.query('SELECT octet_length(i.data) AS bytes,octet_length(i.thumbnail) AS thumb FROM publications p JOIN content_images i ON i.id=ANY(p.image_ids) WHERE p.id=$1',[product.publicationId]);assert.ok(images.rows[0].bytes>0&&images.rows[0].thumb>0);assert.ok((await pool.query('SELECT 1 FROM saved_items WHERE target_id=$1',[product.publicationId])).rows.length);assert.ok((await pool.query('SELECT 1 FROM user_notifications WHERE target_id=$1',[product.publicationId])).rows.length);assert.ok((await pool.query("SELECT 1 FROM content_comments WHERE publication_id=$1 AND status='published'",[product.communityId])).rows.length);assert.equal((await fetch('http://127.0.0.1:3100/api/v1/items/'+product.publicationId)).status,404);assertions+=5;console.log('PASS: new images, thumbnails, saved items, notifications, moderated comments and test-data isolation retained');}
  const galleryPath=path.join(__dirname,'../docs/gallery-ui-result.json');
  if(fs.existsSync(galleryPath)){
   const gallery=JSON.parse(fs.readFileSync(galleryPath,'utf8'));
   const row=(await pool.query('SELECT status,image_ids FROM service_catalog WHERE id=$1',[gallery.serviceId])).rows[0];
   assert.equal(row.status,'draft');assert.deepEqual(row.image_ids,[gallery.imageId]);
   const image=(await pool.query('SELECT octet_length(data) AS bytes,octet_length(thumbnail) AS thumb FROM content_images WHERE id=$1',[gallery.imageId])).rows[0];
   assert.ok(image.bytes>0&&image.thumb>0);
   assert.equal((await fetch('http://127.0.0.1:3100/api/v1/media/'+gallery.imageId+'?test=1')).status,404);
   assertions+=4;console.log('PASS: service gallery references, original/thumbnail bytes and paused privacy retained (4 assertions)');
   fs.writeFileSync(path.join(__dirname,'../docs/gallery-persistence-result.json'),JSON.stringify({passed:4,failed:0,checkedAt:new Date().toISOString()},null,2));
  }
  report.persistenceAfterRestart={passed:assertions,failed:0,checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(__dirname,'../docs/local-business-result.json'),JSON.stringify(report,null,2));
 }finally{if(mini)await mini.disconnect();await pool.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
