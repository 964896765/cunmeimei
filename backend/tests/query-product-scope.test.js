'use strict';
const {acceptedConsent}=require('./helpers/publication-confirmation');
const {acceptedFixtureRequest}=require('./helpers/publication-confirmation');

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { createMemoryRepository } = require('../src/memory-repository');
const catalog = require('../../miniprogram/utils/classification-contract');
const scope = require('../../miniprogram/utils/product-scope');
const { residentFields } = require('./helpers/resident-fields');

test('closed forum projects remain in the 418 directory and cannot start either publication flow', () => {
  const readiness = require('../../miniprogram/utils/publication-readiness');
  const industry = require('../../miniprogram/utils/industry-workflows');
  assert.equal(catalog.projects.length, 418);
  for (const id of scope.forumProjectIds) {
    assert.ok(catalog.find(id));
    assert.equal(catalog.publicationFor(id).enabled, false);
    assert.equal(catalog.publicationFor(id).capabilities.publicDisplayAllowed, false);
    assert.equal(readiness.state(id, undefined, {industryWorkflows:true}).canStart, false);
    assert.equal(industry.workflow(id), null);
  }
  for (const id of scope.practicalInformationProjectIds) {
    assert.deepEqual(catalog.kindsFor(id), ['community']);
    assert.equal(catalog.publicationFor(id).capabilities.bookingAllowed, false);
  }
});

test('query product accepts reviewed practical information and rejects public interaction requests', async t => {
  const repo = createMemoryRepository();
  await repo.seedRegions(['中心街道']);
  const server = createApp({repo, areas:['中心街道'], allowDevLogin:true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  async function request(path, method = 'GET', body, token) {
    const response = await fetch(origin + path, {
      method,
      headers:{'Content-Type':'application/json', ...(token ? {Authorization:'Bearer ' + token} : {})},
      body:body === undefined ? undefined : JSON.stringify(acceptedFixtureRequest(path,method,body))
    });
    return {status:response.status, data:await response.json()};
  }
  const login = await request('/api/v1/dev/login', 'POST', {devUser:'query-scope-fixture'});
  const input = {...residentFields('community'), type:'community', district:'中心街道', title:'寻找遗失的钥匙', detail:'在中心街道附近遗失钥匙一串，请通过站内联系。'};
  const created = await request('/api/v1/publications', 'POST', input, login.data.token);
  assert.equal(created.status, 201);
  const id = created.data.publication.id;
  for (const [method, action] of [['GET','interaction'], ['PUT','like'], ['DELETE','like'], ['POST','comments']]) {
    const response = await request('/api/v1/items/' + id + '/' + action, method, method === 'POST' ? {body:'公开留言',parentId:id} : undefined, login.data.token);
    assert.equal(response.status, 404);
    assert.equal(response.data.error, 'PUBLIC_INTERACTIONS_CLOSED');
  }
  const forum = await request('/api/v1/publications', 'POST', {...input, attributes:{...input.attributes, categoryId:'C08G02S05'}}, login.data.token);
  assert.equal(forum.status, 400);
  assert.equal(repo.__publications.length, 1);
  const config = (await request('/api/v1/config')).data;
  assert.equal(config.features.publicInteractions, false);
  assert.equal(config.features.forumPublishing, false);
  assert.equal(config.features.benefitMode, 'points_only');
});

test('public lookup hides old forum entries while their owner can still access the original record', async () => {
  const repo = createMemoryRepository();
  await repo.seedRegions(['中心街道']);
  const old = await repo.createPublication('owner',{publicationConsent:acceptedConsent(),type:'community', district:'中心街道', title:'历史社群帖子', description:'保留历史记录', attributes:{categoryId:'C08G02S05'}});
  repo.__publications.find(item => item.id === old.id).status = 'published';
  assert.equal((await repo.listFeed({})).length, 0);
  assert.equal(await repo.getItem(old.id), null);
  assert.equal((await repo.myPublications('owner'))[0].id, old.id);
});


test('cached industry public types cannot retain forum content after the scope change', () => {
 for(const type of ['community','public','service']){
  for(const id of scope.forumProjectIds){
   assert.equal(scope.isPublicInformation({type,attributes:{categoryId:id}}),false);
   assert.equal(scope.isPublicInformation({type,attributes:{categoryId:'C08G01S01',industryProjectId:id}}),false);
  }
 }
 assert.equal(scope.isPublicInformation({type:'community',attributes:{categoryId:'C08G01S01'}}),true);
});
