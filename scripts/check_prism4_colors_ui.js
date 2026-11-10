'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const connect = require('./devtools_connection');
const phase = process.argv.includes('--before') ? 'before' : 'after';
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const rgb = hex => 'rgb(' + hex.slice(1).match(/../g).map(x => parseInt(x, 16)).join(', ') + ')';
async function login(devUser) {
 const response = await fetch('http://127.0.0.1:3100/api/v1/dev/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({devUser})});
 assert.equal(response.status, 200, 'local development login'); return response.json();
}

(async () => {
 const fixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/local-business-result.json'), 'utf8'));
 const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
 const runtime = require('../miniprogram/utils/runtime');
 const reader = await login(runtime.devUser), owner = await login(fixture.ownerDevUser);
 const mini = await connect(), errors = [], pages = [], samples = [];
 const keys = ['city_life_v2_auth_token', 'city_life_user_id', 'city_life_acceptance_mode'];
 const original = [], preferenceCache = new Map();
 const palette = phase === 'after' ? require('../miniprogram/utils/palettes').palettes : null;
 const paletteSource = require('../miniprogram/utils/palettes');
 mini.on('exception', error => errors.push(error));
 const routeTo = async url => {
  // Wait for the native transition before asking the SDK for WebView metadata.
  await mini.evaluate(url => { setTimeout(() => wx.reLaunch({url}), 120); return true; }, url);
  await pause(2400);
  let last;
  for (let attempt = 0; attempt < 12; attempt++) {
   try { const page = await mini.currentPage(); if (page?.path === url.split('?')[0].slice(1)) return page; }
   catch (error) { last = error; }
   await pause(200);
  }
  throw last || Error('Page transition did not reach ' + url.split('?')[0]);
 };
 const preferences = async theme => {
  const userId = await mini.callWxMethod('getStorageSync', keys[1]);
  const key = 'city_life_preferences_' + userId;
  if (!preferenceCache.has(key)) preferenceCache.set(key, await mini.callWxMethod('getStorageSync', key));
  const originalValue = preferenceCache.get(key);
  await mini.callWxMethod('setStorageSync', key, {...(originalValue || {}), theme, largeText: false, reduceMotion: false});
 };
 const identity = async merchant => {
  const user = merchant ? owner : reader;
  await mini.callWxMethod('setStorageSync', keys[0], user.token);
  await mini.callWxMethod('setStorageSync', keys[1], user.userId);
 };
 const capture = async (route, theme, name, query = '') => {
  await preferences(theme);
  let page = await routeTo('/' + route + query);
  await pause(900);
  assert.equal(page.path, route);
  let container;
  for (let attempt = 0; attempt < 20; attempt++) {
   page = await mini.currentPage();
   if (page?.path === route) container = await page.$('.theme-root');
   if (container) break;
   await pause(200);
  }
  assert.ok(container, 'rendered theme root: ' + route);
  const data = await page.data(); assert.ok(data.themeClass.includes('theme-' + theme));
  const colors = {background: await container.style('background-color'), text: await container.style('color')};
  if (palette) {
   const expected = paletteSource.resolvePalette(theme,require('../miniprogram/utils/page-accent-route').accentRoute(route));
   assert.equal(colors.background, rgb(expected.background), route + ' current compiled background');
   assert.equal(colors.text, rgb(expected.text), route + ' current compiled text');
   for (const token of ['brand','action','link','wash-rose','wash-blue','wash-lilac']) assert.ok(data.themeStyle.includes('--'+token+':'+expected[token]), route + ' compiled token ' + token);
   if (theme === 'prism') assert.notEqual(await container.style('background-image'), 'none', 'compiled mixed-color background');
   if (route === 'pages/home/index') {
    for (const icon of await page.$$('.quick-icon image')) assert.ok((await icon.attribute('src')).endsWith('-' + data.iconPalette + '.png'), 'category icon follows ' + data.iconPalette);
   }
   if(app.tabBar.custom){
    if(app.tabBar.list.some(x=>x.pagePath===route)){
     const observed=await mini.evaluate(()=>getCurrentPages().slice(-1)[0].getTabBar().data);
     assert.equal(observed.route,route);assert.equal(observed.selectedColor,expected.link,'curved tab selection retains frozen page accent');
     assert.equal(observed.surface,expected.surface);assert.equal(observed.muted,expected.muted);colors.customTabSelectedColor=observed.selectedColor;
    }
   }else{
    const observed = await mini.evaluate(() => getApp().globalData.paletteProbe.styles.slice(-1)[0]);
    assert.equal(observed.selectedColor,expected.link,'native tab selection follows actual page accent');colors.nativeTabSelectedColor=observed.selectedColor;
   }
  }
  const screenshot = 'prism4-' + phase + '-' + name + '.png';
  await mini.evaluate(()=>{setTimeout(()=>wx.pageScrollTo({scrollTop:0,duration:0}),0);return true;});await pause(200);
  await mini.screenshot({path: path.join(root, 'docs', screenshot)});
  console.log('PASS ' + phase + ' ' + theme + ' ' + route);
  return {route, theme, screenshot, colors, iconPalette:data.iconPalette, testData: route !== 'pages/home/index'};
 };
 try {
  for (const key of keys) original.push(await mini.callWxMethod('getStorageSync', key));
  if (palette&&!app.tabBar.custom) {
   await mini.evaluate(() => {
    const probe={original:wx.setTabBarStyle,styles:[]};getApp().globalData.paletteProbe=probe;
    wx.setTabBarStyle=options=>{probe.styles.push({selectedColor:options.selectedColor});return probe.original.call(wx,options);};
    return true;
   });
   await identity(false);await preferences('dark');await routeTo('/pages/home/index');
  }
  for (const route of app.pages) {
   await identity(route.startsWith('pages/merchant-'));
   await mini.callWxMethod('setStorageSync', keys[2], route !== 'pages/home/index');
   const query = route === 'pages/detail/index' ? '?id=' + fixture.publicationId :
    route === 'pages/booking/index' ? '?id=' + fixture.serviceId :
    route.startsWith('pages/merchant-') ? '?merchantId=' + fixture.merchantId : '';
   pages.push(await capture(route, 'prism', route.split('/')[1], query));
  }
  if (palette) {
   await identity(false);
   for (const theme of ['dark', 'clear', 'quiet', 'warm', 'gentle']) {
    await mini.callWxMethod('setStorageSync', keys[2], false);
    samples.push(await capture('pages/home/index', theme, theme + '-home'));
   }
   await mini.callWxMethod('setStorageSync', keys[2], true);
   samples.push(await capture('pages/discover/index', 'dark', 'dark-discover'));
   samples.push(await capture('pages/detail/index', 'clear', 'clear-detail', '?id=' + fixture.publicationId));
   await preferences('clear');
   const key = 'city_life_preferences_' + reader.userId;
   const current = await mini.callWxMethod('getStorageSync', key);
   await mini.callWxMethod('setStorageSync', key, {...current, largeText: true, reduceMotion: true});
   const page = await routeTo('/pages/publish/index'); await pause(900);
   await mini.evaluate(() => { const page = getCurrentPages().slice(-1)[0]; setTimeout(() => page.choose({currentTarget: {dataset: {type: 'used'}}}), 0); return true; });
   for (let n = 0; n < 40 && !(await page.data('showForm')); n++) await pause(100);
   assert.equal(await page.data('showForm'), true);
   assert.ok((await page.data('themeClass')).includes('large-text'));
   await mini.screenshot({path: path.join(root, 'docs/prism4-after-clear-large-form.png')});
   samples.push({route: page.path, theme: 'clear', largeText: true, screenshot: 'prism4-after-clear-large-form.png'});
   await preferences('prism');
   await routeTo('/pages/home/index');
   const form = await routeTo('/pages/publish/index');
   const choice = await form.$('.project-row'); assert.ok(choice);
   await choice.tap();
   for (let n = 0; n < 40 && !(await form.data('showForm')); n++) await pause(100);
   assert.equal(await form.data('showForm'), true, 'visible publishing choice opens the real form');
   const surface = await form.$('.section-card'); assert.ok(surface);
   assert.equal(await surface.style('background-color'), rgb(palette.prism.surface), 'form retains a solid white surface');
   let action;
   for (const button of await form.$$('.action-row .btn')) if (await button.text() === '提交审核') action = button;
   assert.ok(action, 'rendered submit button');
   const buttonGradient = await action.style('background-image');
   assert.ok(buttonGradient.includes(rgb(paletteSource.resolvePalette('prism','pages/publish/index').action)), 'rendered button uses the publishing accent: ' + buttonGradient);
   await mini.evaluate(()=>{setTimeout(()=>wx.pageScrollTo({scrollTop:0,duration:0}),0);return true;}); await pause(500);
   await mini.screenshot({path: path.join(root, 'docs/prism4-after-prism-form.png')});
   samples.push({route: form.path, theme: 'prism', screenshot: 'prism4-after-prism-form.png', formSurface: 'white', choiceTapped: true});
   await mini.callWxMethod('removeStorageSync', keys[0]);
   await mini.callWxMethod('removeStorageSync', keys[1]);
   samples.push(await capture('pages/me/index', 'prism', 'guest-me'));
   const guest = await mini.currentPage(); assert.equal(await guest.data('hasSession'), false);
   let signin;
   for (const button of await guest.$$('.btn')) if (await button.text() === '登录并开始使用') signin = button;
   assert.ok(signin, 'guest login action remains visible');
  }
  assert.equal(errors.length, 0, 'no captured runtime exceptions');
  const sourceHashes = {};
  for (const file of ['miniprogram/utils/theme.js', 'miniprogram/utils/palettes.js', 'miniprogram/app.wxss', 'miniprogram/app.json', 'miniprogram/assets/icons/home-prism.png']) {
   if (fs.existsSync(path.join(root, file))) sourceHashes[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  }
  fs.writeFileSync(path.join(root, 'docs/prism4-' + phase + '-colors-result.json'), JSON.stringify({phase, pages, samples, errors, sourceHashes, checkedAt: new Date().toISOString(), physicalDevice: false, dataSource: 'actual local API/PostgreSQL, labeled test records except normal home; only local display preferences temporarily overridden'}, null, 2));
  console.log('PASS: ' + pages.length + ' pages and ' + samples.length + ' theme samples; no captured runtime exceptions');
 } finally {
  try {
   if(palette) await mini.evaluate(()=>{const probe=getApp().globalData.paletteProbe;if(probe){wx.setTabBarStyle=probe.original;delete getApp().globalData.paletteProbe;}return true;});
   for (const [key, value] of preferenceCache) {
    if (value) await mini.callWxMethod('setStorageSync', key, value);
    else await mini.callWxMethod('removeStorageSync', key);
   }
   for (let n = 0; n < original.length; n++) await mini.callWxMethod('setStorageSync', keys[n], original[n] || '');
   await routeTo('/pages/home/index');
  } finally { await mini.disconnect(); }
 }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
