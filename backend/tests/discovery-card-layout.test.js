'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function card() {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/components/content-card/index.js'), 'utf8'), {
    Component: value => { definition = value; },
    require: name => require('../../miniprogram/utils/' + name.split('/').pop())
  });
  const component = {data:{}, setData(value) { Object.assign(this.data, value); }};
  return item => {
    definition.observers['item, iconPalette'].call(component, item, 'prism');
    return component.data;
  };
}

test('discovery card derives categories, tags and time from actual publication fields', () => {
  const render = card();
  const data = render({category:'二手闲置',createdAt:new Date(Date.now()-5*60000).toISOString(),attributes:{categoryId:'C04G01S01',condition:'正常使用',brand:'实际品牌'}});
  assert.equal(data.listingCategory,'二手闲置');
  assert.deepEqual(Array.from(data.listingTags),['正常使用','实际品牌']);
  assert.equal(data.publicationTime,'5分钟前');
  assert.equal(data.distanceText,'');
  const empty = render({});
  assert.equal(empty.publicationTime,'');
  assert.equal(empty.listingCategory,'');
  assert.equal(empty.listingTags.length,0);
});

test('discovery footer preserves absolute dates and only uses supplied numeric distances', () => {
  const render = card();
  const old = render({createdAt:'2020-01-02T00:00:00Z',dateText:'1月2日',distanceKm:2.75});
  assert.equal(old.publicationTime,'1月2日');
  assert.equal(old.distanceText,'距您 2.8km');
  assert.equal(render({createdAt:'invalid'}).publicationTime,'');
  assert.equal(render({createdAt:new Date(Date.now()+3600000).toISOString(),dateText:'11月13日'}).publicationTime,'11月13日');
});
