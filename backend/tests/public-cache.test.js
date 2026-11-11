'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cache = require('../../miniprogram/utils/public-cache');

function deviceStorage() {
  const values = new Map();
  return {
    values,
    getStorageSync: (key) => values.get(key),
    setStorageSync: (key, value) => values.set(key, structuredClone(value))
  };
}

test('public browse cache separates account, city and query scopes and expires old content', () => {
  const storage = deviceStorage();
  const key = 'feed:owner-a|city-a|used';
  cache.write(key, { items: [{ id: 'public-item' }] }, storage);
  assert.equal(cache.read(key, storage).items[0].id, 'public-item');
  for (const other of [
    'feed:owner-b|city-a|used',
    'feed:owner-a|city-b|used',
    'feed:owner-a|city-a|service'
  ]) {
    assert.equal(cache.read(other, storage), null);
  }
  const entries = [...storage.values.values()][0];
  entries[0].at = Date.now() - 11 * 60 * 1000;
  assert.equal(cache.read(key, storage), null);
});

test('public browse cache stays bounded and device storage failure does not interrupt browsing', () => {
  const storage = deviceStorage();
  for (let index = 0; index < 8; index++) cache.write('query-' + index, { items: [] }, storage);
  assert.equal([...storage.values.values()][0].length, 4);
  assert.equal(cache.read('query-0', storage), null);
  assert.ok(cache.read('query-7', storage));
  const unavailable = {
    getStorageSync() {
      throw Error('device storage unavailable');
    },
    setStorageSync() {
      throw Error('device quota exceeded');
    }
  };
  assert.equal(cache.read('query', unavailable), null);
  assert.doesNotThrow(() => cache.write('query', { items: [] }, unavailable));
});
