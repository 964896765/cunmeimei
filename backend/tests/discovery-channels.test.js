'use strict';
const {acceptedConsent}=require('./helpers/publication-confirmation');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const channels = require('../../miniprogram/utils/discovery-channels');
const catalog = require('../../miniprogram/utils/classification-contract');

test('seven discovery channels cover every industry and all 418 projects exactly once', () => {
  const assigned = channels.definitions.flatMap(channel => channel.industries);
  assert.equal(assigned.length, 27);
  assert.equal(new Set(assigned).size, 27);
  assert.deepEqual([...assigned].sort(), catalog.categories.map(category => category.id).sort());
  for (const project of catalog.projects) assert.ok(channels.channelFor(project.id), project.id);
  assert.deepEqual(channels.definitions.find(channel => channel.id === 'merchant').industries, ['C01','C07','C17']);
  assert.equal(channels.channelFor('C27G01S01'), 'service');
  assert.equal(channels.channelFor('C24G01S01'), 'public');
});

async function checkGroupedQueries(repo) {
  await repo.seedRegions(['频道验收地区']);
  const owner = await repo.upsertIdentity('dev_local', 'discovery-channel-fixture');
  const records = [];
  for (const category of catalog.categories) {
    const project = category.groups[0].items[0];
    const publication = await repo.createPublication(owner,{publicationConsent:acceptedConsent(),
      type:'service', district:'频道验收地区', title:'隔离频道验收 ' + category.id,
      description:'仅用于验证按行业归并后的读取和分页，属于隔离测试数据。', price:'',
      attributes:{categoryId:project.id, cityCode:'310100', districtCode:'310101'}
    });
    await repo.reviewPublication(publication.id, 'published', '隔离读取边界验收');
    records.push({id:publication.id, channel:channels.channelFor(category.id)});
  }
  for (const channel of channels.definitions) {
    const expected = records.filter(record => record.channel === channel.id).map(record => record.id).sort();
    const rows = await repo.listFeed({channel:channel.id, limit:50});
    assert.deepEqual(rows.map(row => row.id).sort(), expected, channel.id);
    const pages = [];
    for (let offset = 0; offset < expected.length; offset += 2) {
      pages.push(...await repo.listFeed({channel:channel.id, limit:2, offset}));
    }
    assert.deepEqual(pages.map(row => row.id).sort(), expected, channel.id + ' pagination');
  }
}

test('memory feed applies discovery grouping before pagination while preserving content types', async () => {
  await checkGroupedQueries(require('../src/memory-repository').createMemoryRepository());
});

test('PostgreSQL feed uses the same 27-industry groups before pagination', {skip:!process.env.PG_TEST_DATABASE_URL && 'PG_TEST_DATABASE_URL not configured'}, async () => {
  const dsn = process.env.PG_TEST_DATABASE_URL;
  require('../src/test-database-guard').assertIsolatedDatabase(dsn);
  const {Pool} = require('pg');
  const control = new Pool({connectionString:dsn});
  const schema = 'discovery_groups_' + crypto.randomBytes(6).toString('hex');
  let pool, repo;
  try {
    await control.query('CREATE SCHEMA "' + schema + '"');
    const options = '-c search_path=' + schema;
    pool = new Pool({connectionString:dsn, options});
    await require('../src/schema-migrations').applyMigrations(pool);
    repo = require('../src/pg-repository').createPgRepository(dsn, {options});
    await checkGroupedQueries(repo);
    const owner = await repo.upsertIdentity('dev_local', 'historical-forum-fixture');
    const attributes = {categoryId:'C08G02S05', industryProjectId:'C08G02S05', cityCode:'310100', districtCode:'310101'};
    const publication = (await pool.query("INSERT INTO publications(user_id,type,title,description,district,status,attributes) VALUES($1,'community','历史论坛读取验收','隔离历史记录','频道验收地区','published',$2) RETURNING id", [owner, attributes])).rows[0];
    const payload = {projectId:'C08G02S05', title:'历史论坛读取验收', detail:'隔离历史记录', district:'频道验收地区', cityCode:'310100', fields:{}, imageIds:[]};
    await pool.query("INSERT INTO industry_entries(id,user_id,project_id,policy,channel,payload,status,client_key,request_hash) VALUES($1,$2,'C08G02S05','COMMUNITY','public',$3,'published','historical_forum_fixture','historical_fixture_hash')", [publication.id, owner, payload]);
    assert.equal(await repo.getItem(publication.id), null);
    assert.equal(await repo.publicIndustryEntry(publication.id), null);
    assert.equal((await repo.homeTargets({q:'历史论坛读取验收'})).items.length, 0);
    assert.ok((await repo.myPublications(owner)).some(item => item.id === publication.id));
    assert.deepEqual(await repo.deliverAds('频道验收地区', 'home'), []);
  } finally {
    if (repo) await repo.close();
    if (pool) await pool.end();
    await control.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await control.end();
  }
});
