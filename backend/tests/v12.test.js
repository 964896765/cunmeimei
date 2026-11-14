'use strict';
const {acceptedConsent}=require('./helpers/publication-confirmation');
const test = require('node:test');
const assert = require('node:assert/strict');
const {createMemoryRepository} = require('../src/memory-repository');
const {createApp} = require('../src/server');
const {literalSearchPattern} = require('../src/search-pattern');

async function start(t, options = {}) {
  const repo = createMemoryRepository();
  const server = createApp({repo, areas:['中心街道'], allowDevLogin:true, adminPassword:'a-long-test-admin-password', ...options});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, {method='GET', raw, json, token}={}) {
    const response = await fetch(base + path, {
      method,
      headers:{'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})},
      body:raw === undefined ? (json === undefined ? undefined : JSON.stringify(json)) : raw
    });
    return {status:response.status, body:await response.json()};
  }
  return {repo, call};
}

test('V0.12: PostgreSQL pattern escapes LIKE wildcards and backslashes', () => {
  assert.equal(literalSearchPattern(''), '%%');
  assert.equal(literalSearchPattern('家具'), '%家具%');
  assert.equal(literalSearchPattern('%'), '%\\%%');
  assert.equal(literalSearchPattern('_'), '%\\_%');
  assert.equal(literalSearchPattern('a\\b'), '%a\\\\b%');
  assert.equal(literalSearchPattern('50%_'), '%50\\%\\_%');
});

test('V0.12: public search treats percent and underscore as ordinary text', async t => {
  const {repo, call}=await start(t);
  const uid=await repo.upsertIdentity('dev_local','filter-user');
  const regular=await repo.createPublication(uid,{publicationConsent:acceptedConsent(),type:'used',district:'中心街道',title:'普通书桌',description:'一张普通书桌出售',price:'100'});
  const marked=await repo.createPublication(uid,{publicationConsent:acceptedConsent(),type:'used',district:'中心街道',title:'限时 50%_优惠',description:'搜索通配符应该只匹配正文实际字符',price:'100'});
  await repo.reviewPublication(regular.id,'published','');
  await repo.reviewPublication(marked.id,'published','');
  for (const q of ['%', '_']) {
    const result=await call('/api/v1/feed?q='+encodeURIComponent(q));
    assert.equal(result.status,200);
    assert.deepEqual(result.body.items.map(x=>x.id),[marked.id]);
  }
  const byRegion=await call('/api/v1/feed?q='+encodeURIComponent('中心街道'));
  assert.equal(byRegion.body.items.length,2);
});

test('V0.12: JSON payload limit is measured in UTF-8 bytes, not JavaScript characters', async t => {
  const {call}=await start(t);
  const emoji='😀'.repeat(9000); // 36,000 bytes plus JSON overhead, only 18,000 UTF-16 units
  const tooLarge=await call('/api/v1/dev/login',{method:'POST',json:{devUser:emoji}});
  assert.equal(tooLarge.status,413);
  assert.equal(tooLarge.body.error,'TOO_LARGE');
  const small=await call('/api/v1/dev/login',{method:'POST',json:{devUser:'小城_user'}});
  assert.equal(small.status,200);
  assert.ok(small.body.token);
});

test('V0.12: malformed UTF-8 JSON fails with a clear 400 instead of fallback replacement', async t => {
  const {call}=await start(t);
  const invalid=Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xc3,0x28,0x22,0x7d]);
  const r=await call('/api/v1/dev/login',{method:'POST',raw:invalid});
  assert.equal(r.status,400);
  assert.equal(r.body.error,'INVALID_JSON');
});

test('V0.12: production disables unreviewed sensitive license collection server-side', async t=> {
  const {call}=await start(t,{production:true,allowDevLogin:false});
  const config=await call('/api/v1/config');
  assert.equal(config.status,200);
  assert.equal(config.body.features.licenseUpload,'disabled_pending_security_review');
  const testId='11111111-1111-4111-8111-111111111111';
  const upload=await call(`/api/v1/merchant-applications/${testId}/license`,{method:'POST',raw:Buffer.from('not a credential')});
  assert.equal(upload.status,503);
  assert.equal(upload.body.error,'LICENSE_UPLOAD_NOT_READY');
  const details=await call(`/api/v1/merchant-applications/${testId}/evidence`,{method:'POST',json:{registrationCode:'123456789012345'}});
  assert.equal(details.status,503);
  assert.equal(details.body.error,'MERCHANT_EVIDENCE_NOT_READY');
});
