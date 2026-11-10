'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function pageFixture() {
  let definition;
  let owner = 'owner';
  const context = {
    Page(value) { definition = value; },
    require(name) {
      if (name.endsWith('/workflow-client')) return {owner: () => owner, date: value => value || ''};
      if (name.endsWith('/industry-workflows')) return require('../../miniprogram/utils/industry-workflows');
      return {};
    }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/business/index.js'), 'utf8'), context);
  const page = {data: structuredClone(definition.data), setData(values) { Object.assign(this.data, values); }};
  for (const [key, value] of Object.entries(definition)) {
    if (typeof value === 'function') page[key] = value.bind(page);
  }
  return {page, setOwner(value) { owner = value; }};
}

test('compact communication actions preserve cancellation, feedback and counterpart permissions', () => {
  const fixture = pageFixture();
  const page = fixture.page;
  page.data.item = page.present({status: 'open', source_kind: 'contact', kind: 'service', snapshot: {}, events: []});
  page.renderActions();
  assert.equal(page.data.primaryAction.id, 'propose_schedule');
  assert.equal(page.data.actionRows.length, page.data.secondaryActions.length + 1);
  assert.ok(page.data.secondaryActions.some(action => action.id === 'request_cancel'));
  assert.ok(page.data.secondaryActions.some(action => action.id === 'dispute'));

  page.data.item = {...page.data.item, status: 'completion_pending', requested_by: 'owner'};
  page.renderActions();
  assert.ok(!page.data.actionRows.some(action => action.id === 'confirm_completion'));
  fixture.setOwner('applicant');
  page.renderActions();
  assert.equal(page.data.primaryAction.id, 'confirm_completion');
  assert.ok(page.data.secondaryActions.some(action => action.id === 'reject_completion'));
});

test('recent history retains all events for expansion and completed feedback stays single-use', () => {
  const {page} = pageFixture();
  const events = Array.from({length: 6}, (_, index) => ({id: String(index), action: 'note', mine: true}));
  events.push({id: 'feedback', action: 'feedback', mine: true});
  page.data.item = page.present({status: 'completed', source_kind: 'contact', kind: 'service', snapshot: {}, events});
  page.renderActions();
  assert.equal(page.data.item.recentEvents.length, 3);
  assert.equal(page.data.item.events.length, 7);
  assert.equal(page.data.item.recentEvents[2].id, 'feedback');
  assert.ok(!page.data.actionRows.some(action => action.id === 'feedback'));
  page.toggleHistory();
  assert.equal(page.data.historyExpanded, true);
  assert.equal(page.data.item.events.length, 7);
});
