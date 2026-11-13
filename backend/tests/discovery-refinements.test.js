'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const definitions = require('../../miniprogram/utils/discovery-refinements');
const channels = require('../../miniprogram/utils/discovery-channels');
const browse = require('../../miniprogram/utils/browse-query');
const {feedUrl} = require('../../miniprogram/utils/feed-query');
const query = require('../src/discovery-refinement-query');

test('seven fixed channels expose only supported business fields and their own category trees', () => {
 assert.deepEqual(channels.definitions.map(item => item.name), ['招聘','房产','闲置','商家','服务','活动','便民']);
 for (const channel of channels.definitions) {
  const tree = browse.categoryColumns('', channel.id);
  assert.deepEqual(tree.columns[0].slice(1).map(item => item.id).sort(), [...channel.industries].sort());
  const chips = definitions.chips(channel.id);
  assert.equal(chips[0].key, 'category');
  assert.equal(chips.at(-1).key, 'sort');
  assert.ok(chips.length >= 4);
 }
 assert.deepEqual(definitions.configurations.job.fields, ['employment','salary','days']);
 assert.deepEqual(definitions.configurations.used.fields, ['price','condition','days']);
 assert.ok(!definitions.configurations.used.fields.includes('radiusKm'));
 assert.equal(definitions.field('price','housing',{intent:'出租'}).label, '租金');
 assert.ok(definitions.field('price','housing',{intent:'出售'}).options.some(item => item.value === 'gte2m'));
});

test('business refinements reject malformed, cross-channel and unrecognized values', () => {
 for (const raw of ['invalid', '[]', 'null', '{"employment":true}', '{"employment":"全职 OR 1=1"}', '{"price":"lt100"}', '{"salary":"5000"}', '{"__proto__":"polluted"}']) {
  assert.throws(() => definitions.normalize(raw, 'job', true));
 }
 assert.throws(() => definitions.normalize(' '.repeat(1201), 'job', true));
 assert.deepEqual(definitions.normalize({salary:'5000_8000',employment:'全职'}, 'job', true), {employment:'全职',salary:'5000_8000'});
 assert.deepEqual(definitions.normalize({price:'gte2m',intent:'出租'}, 'housing'), {intent:'出租'});
 assert.deepEqual(definitions.normalize({salary:'5000_8000'}, 'used'), {});
 assert.deepEqual(definitions.normalize({}, 'all', true), {});
});

test('funnel panels match the real fields of every channel and include a common date limit', () => {
 for (const channel of channels.definitions) {
  const expected=[...definitions.configurations[channel.id].fields];
  if(!expected.includes('days'))expected.push('days');
  assert.deepEqual(definitions.panel(channel.id).map(field=>field.key),expected);
  assert.ok(!expected.includes('images'));
 }
 const housing=definitions.panel('housing',{intent:'出售',price:'500k_1m'});
 assert.ok(housing.find(field=>field.key==='price').options.some(option=>option.value==='500k_1m'&&option.selected));
 assert.ok(!housing.find(field=>field.key==='price').options.some(option=>option.value==='2000_3000'));
});

test('query, route, active tags and reset preserve the same normalized business conditions', () => {
 const refinements = {supply:'bookable',price:'100_500'};
 const value = {type:'service',cityCode:'310100',refinements};
 const feed = new URL(feedUrl(value), 'http://test');
 assert.deepEqual(JSON.parse(feed.searchParams.get('refinements')), {price:'100_500',supply:'bookable'});
 assert.deepEqual(browse.common({...value,refinements:encodeURIComponent(JSON.stringify(refinements))}).refinements, {price:'100_500',supply:'bookable'});
 assert.equal(browse.extras(value).filter(item => item.key.startsWith('refinement:')).length, 2);
 assert.deepEqual(browse.remove(value,'refinement:price'), {refinements:{supply:'bookable'}});
 assert.deepEqual(browse.reset(value).refinements, {});
 assert.notEqual(browse.signature(value), browse.signature({...value,refinements:{}}));
 const map = new URL(browse.mapUrl({...value,bounds:{west:120,east:122,south:30,north:32}}), 'http://test');
 assert.deepEqual(JSON.parse(map.searchParams.get('refinements')), {price:'100_500',supply:'bookable'});
});

test('matching uses numeric ranges, structured salary overlap, actual conditions and valid activity times', () => {
 const item = {kind:'listing',type:'service',price:'￥ 150',attributes:{industryFields:{salaryMin:'4000',salaryMax:'6000',area:'80',employment:'全职',intent:'出租'},condition:'正常使用'}};
 assert.ok(query.matches(item, {price:'100_500',salary:'5000_8000',area:'80_120',employment:'全职',intent:'出租',condition:'正常使用',supply:'requests'}));
 assert.ok(!query.matches({...item,price:'面议'}, {price:'lt100'}));
 assert.ok(!query.matches({...item,price:'500'}, {price:'100_500'}));
 assert.ok(!query.matches({...item,attributes:{industryFields:{salaryMin:'8000',salaryMax:'5000'}}}, {salary:'5000_8000'}));
 assert.ok(!query.matches({...item,attributes:{area:'80平方米'}}, {area:'80_120'}));
 assert.ok(!query.matches({...item,attributes:{industryProjectId:'C03G01S01'}}, {supply:'requests'}));
 assert.ok(!query.matches({...item,kind:'service'}, {supply:'requests'}));
 assert.ok(query.matches({...item,kind:'service'}, {supply:'bookable'}));
 const soon = {attributes:{industryFields:{startsAt:new Date(Date.now()+3600000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString()}}};
 assert.ok(query.matches(soon, {eventState:'upcoming'}));
 assert.ok(!query.matches(soon, {eventState:'ongoing'}));
 assert.ok(!query.matches({attributes:{industryFields:{startsAt:'invalid',endsAt:'invalid'}}}, {eventState:'upcoming'}));
});

async function checkFeed(repo) {
 await repo.seedRegions(['隔离筛选验收地区']);
 const owner = await repo.upsertIdentity('dev_local','discovery-refinements-fixture');
 const records = [
  ['招聘一','C02G01S01',{industryFields:{employment:'全职',salaryMin:'4000',salaryMax:'6000'}},''],
  ['招聘二','C02G01S01',{industryFields:{employment:'兼职',salaryMin:'8000',salaryMax:'10000'}},''],
  ['招聘旧数据','C02G01S01',{},''],
  ['出租','C05G01S03',{intent:'出租',area:'80'},'2000'],
  ['出售','C05G01S02',{intent:'出售',area:'100'},'500000'],
  ['面议房源','C05G01S02',{intent:'出售',area:'未知'},'面议'],
  ['低价闲置','C04G01S01',{condition:'正常使用'},'99'],
  ['区间闲置','C04G01S01',{condition:'几乎全新'},'100'],
  ['上边界闲置','C04G01S01',{condition:'几乎全新'},'500'],
  ['服务需求','C03G01S01',{},'150'],
  ['失物招领','C08G01S01',{},''],
  ['审核资讯','C08G02S01',{},''],
  ['官方指引','C26G01S01',{},'']
 ];
 const ids = {};
 for (const [title,categoryId,attributes,price] of records) {
  const item = await repo.createPublication(owner, {type:'service',title:'隔离读取夹具 '+title,description:'仅用于隔离筛选回归，不是真实岗位、房源或服务。',district:'隔离筛选验收地区',price,attributes:{categoryId,...attributes}});
  await repo.reviewPublication(item.id,'published','隔离读取夹具');
  ids[title] = item.id;
 }
 const cases = [
  ['job',{employment:'全职',salary:'5000_8000'},['招聘一']],
  ['job',{salary:'8000_12000'},['招聘二']],
  ['housing',{intent:'出租',price:'2000_3000',area:'80_120'},['出租']],
  ['housing',{intent:'出售',price:'500k_1m'},['出售']],
  ['used',{price:'100_500',condition:'几乎全新'},['区间闲置']],
  ['service',{supply:'requests',price:'100_500'},['服务需求']]
 ];
 for (const [channel,refinements,titles] of cases) {
  const expected = titles.map(title => ids[title]).sort();
  assert.deepEqual((await repo.listFeed({channel,refinements,limit:50})).map(row => row.id).sort(), expected);
  const pages = [];
  for (let offset=0;offset<expected.length+1;offset++) pages.push(...await repo.listFeed({channel,refinements,limit:1,offset}));
  assert.deepEqual(pages.map(row => row.id).sort(), expected);
 }
 return {owner,ids};
}

test('memory business filtering happens before pagination and tolerates older missing fields', async () => {
 await checkFeed(require('../src/memory-repository').createMemoryRepository());
});

test('feed and map API reject invalid refinements and pass normalized conditions into repositories', async t => {
 const repo = require('../src/memory-repository').createMemoryRepository();
 let feedQuery, mapQuery;
 repo.listFeed = async value => {feedQuery=value;return [];};
 repo.listPublicLocations = async value => {mapQuery=value;return [];};
 const server = require('../src/server').createApp({repo,areas:['隔离筛选验收地区']});
 await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
 t.after(() => new Promise(resolve => server.close(resolve)));
 const base = 'http://127.0.0.1:' + server.address().port;
 const url = feedUrl({type:'all',channel:'job',refinements:{employment:'全职',salary:'5000_8000'}});
 assert.equal((await fetch(base+url)).status, 200);
 assert.deepEqual(feedQuery.refinements, {employment:'全职',salary:'5000_8000'});
 assert.equal((await fetch(base+url.replace('channel=job','channel=used'))).status, 400);
 const map = browse.mapUrl({type:'service',cityCode:'310100',bounds:{west:120,east:122,south:30,north:32},refinements:{price:'100_500',supply:'bookable'}});
 assert.equal((await fetch(base+map)).status, 200);
 assert.deepEqual(mapQuery.refinements, {price:'100_500',supply:'bookable'});
 assert.equal((await fetch(base+map.replace('type=service','type=merchant'))).status, 400);
});

test('PostgreSQL filters typed activity times, sources and ranges before pagination', {skip:!process.env.PG_TEST_DATABASE_URL && 'PG_TEST_DATABASE_URL not configured'}, async () => {
 const dsn = process.env.PG_TEST_DATABASE_URL;
 require('../src/test-database-guard').assertIsolatedDatabase(dsn);
 const {Pool} = require('pg');
 const control = new Pool({connectionString:dsn});
 const schema = 'discovery_refinements_' + crypto.randomBytes(6).toString('hex');
 let pool,repo;
 try {
  await control.query('CREATE SCHEMA "'+schema+'"');
  const options = '-c search_path='+schema;
  pool = new Pool({connectionString:dsn,options});
  await require('../src/schema-migrations').applyMigrations(pool);
  repo = require('../src/pg-repository').createPgRepository(dsn,{options});
  const {owner,ids} = await checkFeed(repo);
  for (const [title,projectId,policy] of [['失物招领','C08G01S01','COMMUNITY'],['审核资讯','C08G02S01','CURATED_INFO'],['官方指引','C26G01S01','OFFICIAL_DIRECTORY']]) {
   await pool.query("INSERT INTO industry_entries(id,user_id,project_id,policy,channel,payload,status,client_key,request_hash,source_verified) VALUES($1,$2,$3,$4,'public','{}','published',$5,'isolated-read-fixture',true)", [ids[title],owner,projectId,policy,crypto.randomUUID()]);
  }
  for (const [infoSource,title] of [['practical','失物招领'],['curated','审核资讯'],['directory','官方指引']]) {
   assert.deepEqual((await repo.listFeed({channel:'public',refinements:{infoSource}})).map(row => row.id), [ids[title]],infoSource);
  }
  const activity = await repo.createPublication(owner,{type:'service',title:'隔离活动读取夹具',description:'仅验证日期条件。',district:'隔离筛选验收地区',price:'',attributes:{categoryId:'C06G01S04',industryProjectId:'C06G01S04',industryFields:{startsAt:'invalid legacy string',endsAt:'invalid legacy string'}}});
  await repo.reviewPublication(activity.id,'published','隔离读取验收');
  await pool.query("INSERT INTO industry_credentials(user_id,project_id,subject,evidence_reference,status,valid_until) VALUES($1,'C06G01S04','隔离测试主体','隔离读取夹具','verified',now()+interval '1 day')",[owner]);
  await pool.query("INSERT INTO industry_entries(id,user_id,project_id,policy,channel,payload,status,client_key,request_hash,starts_at,ends_at) VALUES($1,$2,'C06G01S04','EVENT_BIZ','event','{}','published','event-read-fixture','isolated',now()+interval '1 hour',now()+interval '2 hours')",[activity.id,owner]);
  assert.deepEqual((await repo.listFeed({channel:'event',refinements:{eventState:'upcoming'}})).map(row => row.id), [activity.id]);
  assert.deepEqual(await repo.listFeed({channel:'event',refinements:{eventState:'ongoing'}}), []);
  await pool.query("UPDATE industry_entries SET starts_at=now()-interval '1 hour' WHERE id=$1",[activity.id]);
  assert.deepEqual((await repo.listFeed({channel:'event',refinements:{eventState:'ongoing'}})).map(row => row.id), [activity.id]);
  const serviceIds=[];
  for (const price of ['99','150','500']) {
   const service=(await pool.query("INSERT INTO service_catalog(title,description,district,price,status) VALUES('隔离地图筛选服务','仅用于隔离读取验收','隔离筛选验收地区',$1,'published') RETURNING id",[price])).rows[0].id;
   serviceIds.push(service);
   await repo.setPublicLocation(service,{kind:'service',cityCode:'310100',districtCode:'',latitude:31.2,longitude:121.4,precision:'approximate',approved:true,categoryId:'C03',verificationNote:'隔离读取夹具坐标'});
  }
  for (const sort of ['recommended','latest']) {
   const found=await repo.listPublicLocations({cityCode:'310100',west:120,east:122,south:30,north:32,type:'service',sort,refinements:{supply:'bookable',price:'100_500'},limit:1});
   assert.deepEqual(found.map(row=>row.id),[serviceIds[1]]);
   assert.deepEqual(await repo.listPublicLocations({cityCode:'310100',west:120,east:122,south:30,north:32,type:'service',sort,refinements:{supply:'requests'}}),[]);
  }
 } finally {
  if (repo) await repo.close();
  if (pool) await pool.end();
  await control.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
  await control.end();
 }
});
