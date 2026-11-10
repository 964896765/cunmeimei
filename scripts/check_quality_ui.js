'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const connect = require('./devtools_connection');
const base = 'http://127.0.0.1:3100';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(read, accept, label) {
 for (let n = 0; n < 60; n++) { const value = await read(); if (accept(value)) return value; await pause(200); }
 throw Error('Timed out: ' + label);
}

(async () => {
 const mini = await connect(), checks = [], exceptions = [], metrics = {};
 const keys = ['city_life_v2_auth_token', 'city_life_user_id', 'city_life_acceptance_mode', 'city_life_v06_selected_area'];
 const original = [];
 let preferenceKey, originalPreferences;
 const check = (value, label) => { assert.ok(value, label); checks.push(label); console.log('PASS ' + label); };
 const call = (name, ...args) => mini.evaluate((name, args) => {
  const page = getCurrentPages().slice(-1)[0];
  setTimeout(() => Promise.resolve(page[name](...args)).catch(e => console.error(e.message)), 0);
  return true;
 }, name, args);
 const requests = () => mini.evaluate(() => getApp().globalData.qualityProbe.requests);
 const fault = kind => mini.evaluate(kind => { getApp().globalData.qualityProbe.abortKind = kind; }, kind);
 const shot = async name => { await pause(350); await mini.screenshot({path: path.join(__dirname, '../docs/quality-' + name + '.png')}); };
 mini.on('exception', error => exceptions.push(error));
 try {
  for (const key of keys) original.push(await mini.callWxMethod('getStorageSync', key));
  const response = await fetch(base + '/api/v1/dev/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({devUser: 'quality-ui-reader'})});
  assert.equal(response.status, 200); const reader = await response.json();
  await mini.callWxMethod('setStorageSync', keys[0], reader.token);
  await mini.callWxMethod('setStorageSync', keys[1], reader.userId);
  await mini.callWxMethod('setStorageSync', keys[2], true);
  await mini.callWxMethod('setStorageSync', keys[3], '全部地区');
  preferenceKey = 'city_life_preferences_' + reader.userId;
  originalPreferences = await mini.callWxMethod('getStorageSync', preferenceKey);
  await mini.reLaunch('/pages/home/index'); await pause(3000);
  await mini.evaluate(() => {
   const probe = {original: wx.request, requests: [], abortKind: ''};
   getApp().globalData.qualityProbe = probe;
   wx.request = function (options) {
    const pathname = options.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const kind = /\/items\/[^/]+$/.test(pathname) ? 'detail' : pathname.endsWith('/saved') ? 'saved' : pathname.endsWith('/feed') ? 'feed' : pathname.endsWith('/config') ? 'config' : 'other';
    const entry = {kind, path: pathname, query: options.url.split('?')[1] || '', startedAt: Date.now()};
    probe.requests.push(entry);
    const task = probe.original.call(wx, {...options, complete(result) {
     entry.durationMs = Date.now() - entry.startedAt; entry.status = result.statusCode || 'network-failure';
     options.complete?.(result);
    }});
    // Deliberate network abort only. Successful responses always come from the real API.
    if (probe.abortKind === kind) { probe.abortKind = ''; entry.injectedAbort = true; task.abort(); }
    return task;
   };
  });

  let page = await mini.reLaunch('/pages/discover/index');
  await poll(() => page.data(), d => !d.loading && d.filtered.length > 0, 'discover first page');
  await call('changeType', {currentTarget: {dataset: {type: 'used'}}});
  await poll(() => page.data(), d => !d.loading && d.type === 'used' && d.hasMore, 'used discovery');
  await call('loadMore');
  const secondPage = await poll(() => page.data(), d => !d.loading && d.page === 2, 'second page');
  const ids = secondPage.filtered.map(item => item.id);
  await mini.callWxMethod('pageScrollTo', {scrollTop: 600, duration: 0}); await pause(400);
  const scrollBefore = Number(await page.scrollTop());
  const before = await requests();
  await mini.navigateTo('/pages/detail/index?id=' + ids[0]); await pause(3000); page = await mini.currentPage();
  await poll(() => page.data(), d => !d.loading && d.item && !d.favoriteLoading, 'detail');
  const detailRequests = (await requests()).filter(r => r.kind === 'detail');
  check(detailRequests.length === 1, 'first detail entry issues exactly one real public-detail request');
  metrics.detailEntryRequests = detailRequests.length;
  await mini.navigateBack(); await pause(3000); page = await mini.currentPage();
  const returned = await page.data(), after = await requests();
  check(returned.page === 2 && JSON.stringify(returned.filtered.map(item => item.id)) === JSON.stringify(ids), 'back navigation preserves both loaded pages and their order');
  const returnRequests = after.filter(r => ['feed', 'config'].includes(r.kind)).length - before.filter(r => ['feed', 'config'].includes(r.kind)).length;
  check(returnRequests === 0, 'back navigation adds zero feed/config requests');
  const scrollAfter = Number(await page.scrollTop());
  check(scrollBefore > 0 && Math.abs(scrollBefore - scrollAfter) < 3, 'native scroll position is retained after detail navigation');
  Object.assign(metrics, {discoveryReturnRequests: returnRequests, scrollBefore, scrollAfter, retainedRows: ids.length});

  await fault('saved');
  await mini.navigateTo('/pages/detail/index?id=' + ids[0]); await pause(3000); page = await mini.currentPage();
  const failedFavorite = await poll(() => page.data(), d => !!d.favoriteError && !d.favoriteLoading, 'aborted favorite request');
  check(!!failedFavorite.item && !failedFavorite.error && !failedFavorite.favoriteReady, 'aborted favorite request keeps real detail visible and prevents an ambiguous action');
  await mini.callWxMethod('pageScrollTo', {scrollTop: 10000, duration: 0}); await shot('favorite-retry');
  await (await page.$('.inline-feedback button')).tap();
  await poll(() => page.data(), d => d.favoriteReady && !d.favoriteError, 'favorite recovery');
  check(true, 'favorite-state retry recovers against the real API');

  await mini.navigateBack(); await pause(3000); page = await mini.currentPage();
  await fault('feed'); await call('confirmSearch');
  const failedRefresh = await poll(() => page.data(), d => !d.loading && !!d.error, 'aborted feed refresh');
  check(failedRefresh.filtered.length === ids.length && failedRefresh.page === 2 && failedRefresh.error === '网络连接失败，请稍后重试。', 'failed refresh preserves the current loaded list and uses the current user-facing error copy');
  await mini.callWxMethod('pageScrollTo', {scrollTop: 100000, duration: 0}); await shot('list-retry');
  await (await page.$('.state-panel button')).tap();
  await poll(() => page.data(), d => !d.loading && !d.error && d.page === 1, 'first-page retry');
  check(true, 'refresh retry reloads page one instead of accidentally appending a later page');

  await mini.callWxMethod('pageScrollTo', {scrollTop: 0, duration: 0});
  await (await page.$('input')).input('质量验收无匹配-' + Date.now());
  await poll(() => page.data(), d => !d.loading && !!d.q && !d.filtered.length, 'empty search');
  await (await page.$('.state-panel button')).tap();
  await poll(() => page.data(), d => !d.loading && !d.q && d.type === 'all' && d.filtered.length > 0, 'clear empty query');
  check(true, 'empty search offers a working clear-filters action');

  await mini.callWxMethod('setStorageSync', preferenceKey, {theme: 'dark', largeText: true, reduceMotion: true, notificationPreview: true, allowContacts: true, revision: 0});
  await call('changeType', {currentTarget: {dataset: {type: 'used'}}});
  await poll(() => page.data(), d => !d.loading && d.type === 'used', 'large-text category');
  await call('onShow'); await pause(1000);
  const themed = await page.data();
  check(themed.themeClass.includes('theme-dark') && themed.themeClass.includes('large-text'), 'dark theme and large text apply to the retained discovery list');
  await mini.callWxMethod('pageScrollTo', {scrollTop: 0, duration: 0}); await shot('large-discover');
  const grid = await page.$('.result-grid');
  const gridWidth = Number((await grid.size()).width);
  const columns = await grid.style('grid-template-columns');
  check(/^\d+(\.\d+)?px$/.test(columns.trim()) && parseFloat(columns) > gridWidth * 0.9, 'large-text goods cards use a readable single column');
  Object.assign(metrics, {largeTextGridWidth: gridWidth, largeTextGridColumns: columns});

  const captured = await requests();
  metrics.requests = captured;
  check(exceptions.length === 0, 'quality workflow has no captured simulator runtime exceptions');
  fs.writeFileSync(path.join(__dirname, '../docs/quality-ui-result.json'), JSON.stringify({passed: checks.length, failed: 0, skipped: 0, checks, metrics, testData: true, faultInjection: 'two targeted RequestTask.abort calls; no API/SQL responses mocked', physicalDevice: false, checkedAt: new Date().toISOString()}, null, 2));
 } finally {
  try {
   await mini.evaluate(() => { const probe = getApp().globalData.qualityProbe; if (probe) { wx.request = probe.original; delete getApp().globalData.qualityProbe; } });
   if (preferenceKey) await mini.callWxMethod('setStorageSync', preferenceKey, originalPreferences || '');
   for (let i = 0; i < keys.length; i++) await mini.callWxMethod('setStorageSync', keys[i], original[i] || '');
   await mini.reLaunch('/pages/home/index');
  } finally { await mini.disconnect(); }
 }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
