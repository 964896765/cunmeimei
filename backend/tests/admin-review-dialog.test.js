'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function client() {
  const created = [];
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.isConnected = true; }
    setAttribute(key, value) { this[key] = value; }
    append(...children) { this.children.push(...children); }
    addEventListener(name, callback) { this.events[name] = callback; }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close(value = '') { this.returnValue = value; this.open = false; this.events.close(); }
    remove() { this.isConnected = false; }
  }
  const focus = new Element('button');
  const document = {activeElement:focus, body:new Element('body'), createElement(tag) {
    const element = new Element(tag);
    created.push(element);
    return element;
  }};
  const context = {document, csrf:'first-session', module:{exports:{}}};
  const source = fs.readFileSync(path.join(__dirname, '../admin/review-dialog.js'), 'utf8');
  vm.runInNewContext(source + '\nmodule.exports={adminPrompt,adminConfirm};', context);
  return {context, focus, created, ...context.module.exports, dialog:() => created.findLast(element => element.tag === 'dialog')};
}

test('review form preserves plain text, initial values and the submitted multiline evidence record', async () => {
  const ui = client();
  const pending = ui.adminPrompt('<img src=x>审核依据', '已有记录');
  await Promise.resolve();
  const field = ui.created.find(element => element.tag === 'textarea');
  assert.equal(field.value, '已有记录');
  assert.equal(ui.created.find(element => element.tag === 'label').textContent, '<img src=x>审核依据');
  field.value = '核对文字和原图\n记录实际处理范围';
  ui.dialog().close('confirm');
  assert.equal(await pending, field.value);
  assert.equal(ui.focus.focused, true);
  assert.equal(ui.dialog().isConnected, false);
});

test('cancelled review confirmation returns false and pending dialogs stay serialized', async () => {
  const ui = client();
  const first = ui.adminConfirm('确认本次操作？');
  const second = ui.adminPrompt('后续处理说明');
  await Promise.resolve();
  assert.equal(ui.created.filter(element => element.tag === 'dialog').length, 1);
  ui.dialog().close('cancel');
  assert.equal(await first, false);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(ui.created.filter(element => element.tag === 'dialog').length, 2);
  ui.dialog().close('cancel');
  assert.equal(await second, null);
});

test('an administrator session change aborts the stale evidence form', async () => {
  const ui = client();
  const pending = ui.adminPrompt('填写本次处理说明');
  await Promise.resolve();
  ui.context.csrf = 'replacement-session';
  ui.dialog().close('confirm');
  await assert.rejects(pending, /登录状态已变化/);
});
