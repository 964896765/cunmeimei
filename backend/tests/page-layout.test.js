"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  const info = { windowHeight: 844, screenHeight: 844, statusBarHeight: 47, safeArea: { bottom: 810 } };
  let keyboard, removed;
  const box = { module: { exports: {} }, wx: {
    getWindowInfo: () => info,
    onKeyboardHeightChange: (fn) => { keyboard = fn; },
    offKeyboardHeightChange: (fn) => { removed = fn; },
  } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../miniprogram/utils/page-layout.js"), "utf8"), box);
  const page = { data: { pageCompact: false, layoutStyle: "" }, updates: [], setData(value) { Object.assign(this.data, value); this.updates.push(value); } };
  return { layout: box.module.exports, page, info, keyboard: (height) => keyboard({ height }), removed: () => removed };
}

test("layout measures capsule header and actual footer with stable scroll thresholds", () => {
  const { layout, page } = fixture();
  page.getTabBar = () => ({ createSelectorQuery: () => ({ select() { return this; }, boundingClientRect(fn) { fn({ height: 90 }); return this; }, exec() {} }) });
  layout.show(page, { tabBar: true });
  layout.header(page, { detail: { height: 107, statusHeight: 47, rowHeight: 60, titleInset: 104 } });
  assert.match(page.data.layoutStyle, /--page-bottom:90px/);
  assert.match(page.data.layoutStyle, /--page-header:107px/);
  assert.match(page.data.layoutStyle, /--page-capsule:104px/);
  page.updates = [];
  for (let scrollTop = 0; scrollTop < 200; scrollTop++) layout.scroll(page, { scrollTop });
  assert.equal(page.updates.length, 1);
  layout.scroll(page, { scrollTop: 60 });
  assert.equal(page.data.pageCompact, true);
  layout.scroll(page, { scrollTop: 0 });
  assert.equal(page.data.pageCompact, false);
});

test("chat viewport supports overlay and resized keyboards and releases listeners", () => {
  const f = fixture();
  f.layout.show(f.page, { keyboard: true });
  f.keyboard(300);
  assert.match(f.page.data.layoutStyle, /--page-viewport:544px/);
  assert.match(f.page.data.layoutStyle, /--page-safe-bottom:0px/);
  f.info.windowHeight = 544;
  f.layout.measure(f.page);
  assert.match(f.page.data.layoutStyle, /--page-viewport:544px/);
  f.info.windowHeight = 844;
  f.keyboard(0);
  assert.match(f.page.data.layoutStyle, /--page-viewport:844px/);
  f.layout.hide(f.page);
  assert.equal(typeof f.removed(), "function");
  const updates = f.page.updates.length;
  f.layout.measure(f.page);
  assert.equal(f.page.updates.length, updates);
});

test("late measurements cannot overwrite a hidden or resized page", () => {
  const { layout, page, info } = fixture();
  const callbacks = [];
  page.getTabBar = () => ({ createSelectorQuery: () => ({ select() { return this; }, boundingClientRect(fn) { callbacks.push(fn); return this; }, exec() {} }) });
  layout.show(page, { tabBar: true });
  info.windowHeight = 700;
  layout.measure(page);
  callbacks[0]({ height: 120 });
  assert.match(page.data.layoutStyle, /--page-viewport:700px/);
  assert.doesNotMatch(page.data.layoutStyle, /--page-bottom:120px/);
  layout.hide(page);
  const previous = page.data.layoutStyle;
  callbacks[1]({ height: 60 });
  assert.equal(page.data.layoutStyle, previous);
});

test("a window without a bottom safe inset reserves only the actual tab row", () => {
  const { layout, page, info } = fixture();
  Object.assign(info, { windowHeight: 780, screenHeight: 820, statusBarHeight: 24, safeArea: { bottom: 820 } });
  layout.show(page, { tabBar: true });
  assert.match(page.data.layoutStyle, /--page-viewport:780px/);
  assert.match(page.data.layoutStyle, /--page-bottom:56px/);
  assert.match(page.data.layoutStyle, /--page-status:24px/);
});

test("home hands the header over after scroll intent and restores the brand at the top", () => {
  const { layout, page } = fixture();
  layout.show(page, { threshold: 8 });
  layout.scroll(page, { scrollTop: 4 });
  assert.equal(page.data.pageCompact, false);
  layout.scroll(page, { scrollTop: 8 });
  assert.equal(page.data.pageCompact, true);
  layout.scroll(page, { scrollTop: 1 });
  assert.equal(page.data.pageCompact, true);
  layout.scroll(page, { scrollTop: 0 });
  assert.equal(page.data.pageCompact, false);
});
