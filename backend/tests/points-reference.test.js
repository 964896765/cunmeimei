'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {ledgerSource} = require('../src/points-repository');

test('internal ledger UUIDs remain usable when their random digits resemble a phone number', () => {
  const id = '00000000-0000-4000-8000-138001380000';
  for (const prefix of ['ad-campaign','reward-event','benefit-order','points-hold']) {
    const reference = prefix + ':' + id;
    assert.equal(ledgerSource(reference, 'spend'), reference);
    assert.throws(() => ledgerSource(reference, 'adjustment'), {code:'INVALID_REFERENCE'});
  }
  for (const reference of ['ticket:13800138000','external:00000000-0000-4000-8000-138001380000','ad-campaign:13800138000']) {
    assert.throws(() => ledgerSource(reference, 'earn'), {code:'INVALID_REFERENCE'});
  }
});
