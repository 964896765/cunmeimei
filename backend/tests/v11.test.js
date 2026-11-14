'use strict';
const {residentFields}=require('./helpers/resident-fields');
const test=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('../src/server');
const {createMemoryRepository}=require('../src/memory-repository');

async function setup(t){
 const repo=createMemoryRepository(),server=createApp({repo,areas:['中心街道','北城区'],allowDevLogin:true,adminPassword:'local-test-admin-password'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 async function call(path,opts={}){
  const res=await fetch(base+path,{method:opts.method||'GET',headers:{'Content-Type':'application/json',...(opts.token?{Authorization:'Bearer '+opts.token}:{}),...(opts.cookie?{Cookie:opts.cookie}:{}),...(opts.csrf?{'X-CSRF-Token':opts.csrf}:{})},body:opts.body===undefined?undefined:JSON.stringify(require('./helpers/publication-confirmation').acceptedFixtureRequest(path,opts.method||'GET',opts.body))});
  return {status:res.status,data:await res.json(),cookie:(res.headers.get('set-cookie')||'').split(';')[0]};
 }
 const login=async name=>(await call('/api/v1/dev/login',{method:'POST',body:{devUser:name}})).data.token;
 const admin=async()=>{const r=await call('/admin/api/login',{method:'POST',body:{password:'local-test-admin-password'}});return {cookie:r.cookie,csrf:r.data.csrf};};
 return {repo,call,login,admin};
}
const data={...residentFields(),type:'used',title:'本地闲置书桌',detail:'一张九成新的实木书桌，仅用于内容编辑审核测试',price:'180',district:'中心街道'};
const edit={...data,title:'本地闲置书桌已调整',detail:'重新上传的信息需要进入人工复审，不应该自动公开',price:'150'};

test('V0.11: editing a published item hides it until a fresh approval; revisions prevent stale overwrites',async t=>{
 const {call,login,admin}=await setup(t),owner=await login('v11-author'),other=await login('v11-intruder');
 const id=(await call('/api/v1/publications',{method:'POST',token:owner,body:data})).data.publication.id;
 const mod=await admin();
 assert.equal((await call('/admin/api/review',{method:'POST',...mod,body:{id,target:'publication',status:'published',reason:''}})).status,200);
 assert.equal((await call('/api/v1/items/'+id)).status,200);
 const path='/api/v1/me/publications/'+id;
 assert.equal((await call(path,{method:'PUT',token:other,body:{...edit,expectedRevision:1}})).status,404,'cross-user edit forbidden');
 assert.equal((await call(path,{method:'PUT',body:{...edit,expectedRevision:1}})).status,401);
 assert.equal((await call(path,{method:'PUT',token:owner,body:{...edit,expectedRevision:0}})).status,400);
 const response=await call(path,{method:'PUT',token:owner,body:{...edit,expectedRevision:1}});
 assert.equal(response.status,200);assert.equal(response.data.publication.status,'pending');assert.equal(response.data.publication.revision,2);
 assert.equal(response.data.publication.title,edit.title);
 assert.equal((await call('/api/v1/items/'+id)).status,404,'old detail hidden immediately');
 assert.equal((await call('/api/v1/feed?q='+encodeURIComponent(edit.title))).data.items.length,0);
 assert.equal((await call(path,{method:'PUT',token:owner,body:{...data,expectedRevision:1}})).status,409,'stale client cannot overwrite');
 const queue=(await call('/admin/api/queue',{cookie:mod.cookie})).data;
 assert.equal(queue.publications.filter(x=>x.id===id).length,1,'resubmission reenters queue once');
 assert.equal((await call('/admin/api/review',{method:'POST',...mod,body:{id,target:'publication',status:'published',reason:''}})).status,200);
 const live=await call('/api/v1/items/'+id);assert.equal(live.status,200);assert.equal(live.data.item.title,edit.title);
});

test('V0.11: rejected items can be revised; closed items cannot be resurrected or altered',async t=>{
 const {call,login,admin}=await setup(t),owner=await login('v11-rejected-author'),mod=await admin();
 const id=(await call('/api/v1/publications',{method:'POST',token:owner,body:data})).data.publication.id;
 assert.equal((await call('/admin/api/review',{method:'POST',...mod,body:{id,target:'publication',status:'rejected',reason:'演示内容需要更详细说明'}})).status,200);
 const path='/api/v1/me/publications/'+id;
 const response=await call(path,{method:'PUT',token:owner,body:{...edit,expectedRevision:1}});
 assert.equal(response.status,200);assert.equal(response.data.publication.moderationReason,'');
 assert.equal((await call('/admin/api/review',{method:'POST',...mod,body:{id,target:'publication',status:'published',reason:''}})).status,200);
 assert.equal((await call(path+'/withdraw',{method:'POST',token:owner,body:{}})).status,200);
 assert.equal((await call(path,{method:'PUT',token:owner,body:{...edit,expectedRevision:2}})).status,404);
 assert.equal((await call('/api/v1/items/'+id)).status,404);
});

test('V0.11: editing respects active district, locked categories and immutable post type',async t=>{
 const {repo,call,login}=await setup(t),owner=await login('v11-policy-author');
 const id=(await call('/api/v1/publications',{method:'POST',token:owner,body:data})).data.publication.id;
 const url='/api/v1/me/publications/'+id;
 assert.equal((await call(url,{method:'PUT',token:owner,body:{...edit,type:'housing',attributes:{},imageIds:[],expectedRevision:1}})).status,404,'cannot change original category');
 await repo.setRegionEnabled('北城区',false);
 assert.equal((await call(url,{method:'PUT',token:owner,body:{...edit,district:'北城区',expectedRevision:1}})).status,400);
 await repo.setCategoryEnabled('used',false);
 assert.equal((await call(url,{method:'PUT',token:owner,body:{...edit,expectedRevision:1}})).status,403);
 await repo.setCategoryEnabled('used',true);
 assert.equal((await call(url,{method:'PUT',token:owner,body:{...edit,expectedRevision:1}})).status,200);
});
