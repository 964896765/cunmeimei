'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('merchant application keeps an explicit local-demo indicator when offline', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/merchant/index.wxml'), 'utf8');
  assert.match(markup, /<status-badge wx:if="\{\{!online\}\}" label="本地演示"\/>/);
});

test('every native page swiper supports the saved reduce-motion preference', () => {
  const pages = path.resolve(__dirname, '../../miniprogram/pages');
  let checked = 0;
  for (const name of fs.readdirSync(pages)) {
    const markup = fs.readFileSync(path.join(pages, name, 'index.wxml'), 'utf8');
    for (const tag of markup.match(/<swiper\s(?:[^">]|"[^"]*")*>/g) || []) {
      assert.match(tag, /duration="\{\{displayPreferences\.reduceMotion\?0:/, name);
      checked++;
    }
  }
  assert.equal(checked, 5);
});

test('disabled shared search cannot clear or submit a query', () => {
  let definition;
  const events = [];
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/components/search-bar/index.js'), 'utf8'), {
    Component: value => { definition = value; }
  });
  const component = {properties:{disabled:true}, triggerEvent:(...args) => events.push(args)};
  for (const [name, method] of Object.entries(definition.methods)) component[name] = method.bind(component);
  component.clear();
  component.search();
  assert.equal(events.length, 0);
  component.properties.disabled = false;
  component.clear();
  component.search();
  assert.deepEqual(events.map(event => event[0]), ['input', 'clear', 'search']);
});
