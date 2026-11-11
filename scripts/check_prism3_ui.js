'use strict';

const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Pool } = require('../backend/node_modules/pg');
const { residentFields } = require('../backend/tests/helpers/resident-fields');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = process.env.UI_AUDIT_OUTPUT ? path.resolve(process.env.UI_AUDIT_OUTPUT) : path.resolve(__dirname, '../docs/remediation/stage-2/visual');

async function main() {
  const dsn = process.env.PG_TEST_DATABASE_URL;
  require('../backend/src/test-database-guard').assertIsolatedDatabase(dsn);
  const schema = 'prism_ui_' + crypto.randomBytes(8).toString('hex'),
    control = new Pool({ connectionString: dsn });
  let pool, repo, server, mini, session;
  const screenshots = [],
    checks = [],
    errors = [];
  const fingerprint = crypto.createHash('sha256');
  function hashSources(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      if (fs.statSync(file).isDirectory()) hashSources(file);
      else fingerprint.update(path.relative(__dirname, file)).update(fs.readFileSync(file));
    }
  }
  hashSources(path.resolve(__dirname, '../miniprogram'));
  const sourceHash = fingerprint.digest('hex');
  const checkpoint = path.join(output, 'PROGRESS.json');
  if (process.env.PRISM_RESUME === '1' && fs.existsSync(checkpoint)) {
    const previous = JSON.parse(fs.readFileSync(checkpoint, 'utf8'));
    assert.equal(previous.sourceHash, sourceHash, 'Resume requires unchanged miniapp sources');
    checks.push(...previous.routes);
    screenshots.push(...previous.screenshots);
  }
  function saveProgress() {
    fs.writeFileSync(checkpoint, JSON.stringify({ sourceHash, routes: checks, screenshots }, null, 2) + '\n');
  }
  fs.mkdirSync(output, { recursive: true });
  fs.rmSync(path.join(output, 'RESULTS.json'), { force: true });
  try {
    await control.query('CREATE SCHEMA "' + schema + '"');
    const options = '-c search_path=' + schema;
    pool = new Pool({ connectionString: dsn, options });
    await require('../backend/src/schema-migrations').applyMigrations(pool);
    repo = require('../backend/src/pg-repository').createPgRepository(dsn, { options });
    await repo.seedRegions(['中心街道']);
    const password = crypto.randomBytes(24).toString('base64url');
    server = require('../backend/src/server').createApp({
      repo,
      areas: ['中心街道'],
      allowDevLogin: true,
      superAdminPassword: password,
      legalConfig: { operatorName: '隔离界面验收主体', contactEmail: 'privacy@example.test' }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    async function request(url, method = 'GET', value, auth = {}) {
      const response = await fetch(origin + url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(auth.token ? { Authorization: 'Bearer ' + auth.token } : {}),
          ...(auth.cookie ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {})
        },
        body: value === undefined ? undefined : JSON.stringify(value)
      });
      const data = await response.json();
      assert.ok(response.ok, url + ' ' + response.status + ' ' + (data.error || ''));
      return { ...data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    }
    const owner = await request('/api/v1/dev/login', 'POST', { devUser: 'prism-ui-owner' });
    const reader = await request('/api/v1/dev/login', 'POST', { devUser: 'prism-ui-reader' });
    const login = await request('/admin/api/login', 'POST', { role: 'superadmin', password }),
      admin = { cookie: login.cookie, csrf: login.csrf };
    await request(
      '/api/v1/me/profile',
      'PUT',
      { displayName: '界面验收街坊', bio: '隔离测试账号，用于检查页面展示。' },
      owner
    );
    const image = await repo.uploadContentImage(
      owner.userId,
      await require('../backend/node_modules/sharp')({
        create: { width: 400, height: 300, channels: 3, background: '#E9E6E2' }
      })
        .png()
        .toBuffer()
    );
    const payload = {
      ...residentFields('used', [image.id]),
      type: 'used',
      title: '[界面验收] 闲置实木书桌',
      detail: '隔离环境页面测试内容，用于检查文字、图片、地区和联系流程。',
      price: '80',
      district: '中心街道'
    };
    const publication = (await request('/api/v1/publications', 'POST', payload, owner)).publication;
    await request(
      '/admin/api/review',
      'POST',
      {
        target: 'publication',
        id: publication.id,
        status: 'published',
        expectedRevision: 1,
        textReviewed: true,
        imagesReviewed: true
      },
      admin
    );
    const application = (
      await request(
        '/api/v1/merchant-applications',
        'POST',
        { name: '[界面验收] 生活服务站', category: '维修', district: '中心街道' },
        owner
      )
    ).application;
    await request(
      '/api/v1/merchant-applications/' + application.id + '/evidence',
      'POST',
      {
        registrationCode: 'TEST-PRISM-00000001',
        licenseHolder: '隔离测试主体',
        evidenceReference: 'fixture:PRISM-001'
      },
      owner
    );
    await request(
      '/admin/api/review',
      'POST',
      { target: 'merchant', id: application.id, status: 'in_review' },
      admin
    );
    const merchant = (
      await request(
        '/admin/api/approve-merchant',
        'POST',
        {
          id: application.id,
          manuallyVerified: true,
          note: '隔离界面测试核验夹具，仅用于界面验收'
        },
        admin
      )
    ).merchant;
    const service = (
      await request(
        '/api/v1/merchants/' + merchant.id + '/services',
        'POST',
        {
          title: '[界面验收] 上门检修',
          description: '隔离环境测试服务，用于检查预约与商家管理界面。',
          price: '100'
        },
        owner
      )
    ).service;
    await request(
      '/admin/api/review-service',
      'POST',
      { id: service.id, status: 'published' },
      admin
    );
    const contact = (
      await request(
        '/api/v1/items/' + publication.id + '/contact',
        'POST',
        { message: '隔离测试联系申请，请核对界面。' },
        reader
      )
    ).request;
    await request(
      '/api/v1/me/contacts/' + contact.id,
      'POST',
      { action: 'accept', response: '隔离测试回复，已同意站内沟通。' },
      owner
    );
    await request(
      '/api/v1/me/chats/' + contact.id + '/messages',
      'POST',
      { body: '你好，这是一条界面验收消息。', clientKey: 'prism_ui_message_000001' },
      reader
    );
    const business = await repo.createBusinessCase(reader.userId, {
      sourceKind: 'contact',
      sourceId: contact.id,
      agreed: true,
      clientKey: 'prism_ui_business_00001'
    });
    await request(
      '/api/v1/me/draft',
      'PUT',
      {
        expectedRevision: 0,
        payload: {
          ...payload,
          kind: 'used',
          title: '[界面验收] 尚未提交的草稿',
          clientKey: 'prism_ui_draft_000001'
        }
      },
      owner
    );
    const news = await repo.saveHomeContent(
      null,
      {
        kind: 'news',
        cityCode: '310100',
        title: '[界面验收] 街坊生活资讯',
        summary: '隔离环境展示内容，用于检查资讯卡片层级。',
        body: '这是明确标记的隔离界面验收内容。',
        sourceName: '界面验收夹具',
        sourceUrl: 'https://example.org/isolated-prism-fixture',
        startsAt: new Date(Date.now() - 60000).toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
        priority: 1
      },
      'superadmin'
    );
    await repo.reviewHomeContent(
      news.id,
      {
        revision: 1,
        status: 'published',
        textReviewed: true,
        sourceReviewed: true,
        reason: '隔离测试内容，核对界面显示及来源标签'
      },
      'superadmin'
    );

    console.log('Fixtures ready');
    mini = await require('./devtools_connection')();
    mini.on('exception', (event) => errors.push(event));
    session = await require('./devtools_storage_recovery')(() => mini, async () => {
      await mini.disconnect().catch(() => {});
      mini = await require('./devtools_connection')();
    });
    await mini.evaluate(value => { require('utils/runtime.js').apiBaseUrl = value; return true; }, origin);
    await mini.callWxMethod('setStorageSync', 'city_life_user_id', owner.userId);
    await mini.callWxMethod('setStorageSync', 'city_life_v2_auth_token', owner.token);
    await mini.callWxMethod('setStorageSync', 'city_life_session_expires_at', Date.now() + 3600000);
    await mini.callWxMethod('setStorageSync', 'city_life_acceptance_mode', false);
    await mini.callWxMethod('setStorageSync', 'city_life_browse_city', {
      cityCode: '310100',
      districtCode: '310101',
      source: 'manual'
    });
    await mini.callWxMethod('setStorageSync', 'city_life_preferences_' + owner.userId, {
      theme: 'prism',
      largeText: false,
      reduceMotion: true
    });
    async function routeTo(url) {
      console.log('OPEN ' + url.split('?')[0]);
      let last;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const tab = app.tabBar.list.some(item => '/' + item.pagePath === url.split('?')[0]);
          const refresh = tab && (await mini.currentPage())?.path === url.split('?')[0].slice(1);
          await mini.evaluate(({url, tab, refresh}) => {
            setTimeout(() => {
              if (refresh) getCurrentPages().slice(-1)[0].onShow();
              else wx[tab ? 'switchTab' : 'reLaunch']({ url });
            }, 120);
            return true;
          }, {url, tab, refresh});
          await pause(3000);
          const page = await mini.currentPage();
          if (page?.path === url.split('?')[0].slice(1) && (await page.$('.theme-root')))
            return page;
          last = Error('View not ready');
        } catch (error) {
          last = error;
        }
        await mini.disconnect().catch(() => {});
        mini = await require('./devtools_connection')();
        mini.on('exception', (event) => errors.push(event));
      }
      throw last || Error('Route did not open ' + url.split('?')[0]);
    }
    async function capture(name, route, variant = 'normal', scrollTop = 0) {
      const file = name + '-' + variant + '.png';
      await mini.screenshot({ path: path.join(output, file) });
      screenshots.push({ route, variant, file, scrollTop });
    }
    async function capturePositions(page, name, route) {
      const selector = {publish:'.industry-sidebar',regions:'.city-scroll',search:'.search-content',map:'.map-results'}[name];
      const inner = selector ? await page.$(selector) : null;
      async function scrollTo(top) {
        if (inner) await inner.scrollTo(0, top);
        else await mini.evaluate(value => new Promise(resolve => {
          wx.pageScrollTo({scrollTop:value,duration:0,complete:resolve});
        }), top);
        await pause(350);
        const offset = inner ? await inner.property('scrollTop') : await mini.evaluate(() =>
          new Promise(resolve => wx.createSelectorQuery().selectViewport().scrollOffset(value => resolve(value.scrollTop)).exec())
        );
        return Number(offset) || 0;
      }
      await scrollTo(0);
      await capture(name, route);
      if (process.env.UI_AUDIT_POSITIONS === 'top') return;
      const target = inner ? 999999 : await mini.evaluate(() => new Promise(resolve => {
        wx.createSelectorQuery().selectViewport().scrollOffset(value =>
          resolve(Math.max(0, Math.ceil(value.scrollHeight - wx.getWindowInfo().windowHeight)))
        ).exec();
      }));
      const maximum = await scrollTo(target);
      if (!inner && target > 100 && maximum === 0)
        throw Error('Page did not scroll to capture lower content ' + name);
      const middle = await scrollTo(Math.floor(maximum / 2));
      await capture(name, route, 'middle', middle);
      const bottom = await scrollTo(maximum);
      await capture(name, route, 'bottom', bottom);
      await scrollTo(0);
    }
    const app = require('../miniprogram/app.json');
    const queries = {
      detail: '?id=' + publication.id,
      booking: '?id=' + service.id,
      chat: '?id=' + contact.id,
      information: '?id=' + news.id,
      'merchant-services': '?merchantId=' + merchant.id,
      'merchant-team': '?merchantId=' + merchant.id,
      'merchant-bookings': '?merchantId=' + merchant.id,
      business: '?id=' + business.id,
      'publish-form': '?categoryId=C04G01S01',
      industry: '?projectId=C22G01S01'
    };
    const routes = process.env.UI_AUDIT_SCOPE === 'main' ? app.tabBar.list.map(item => item.pagePath) : app.pages;
    for (const route of routes) {
      if (checks.some(check => check.route === route)) continue;
      const name = route.split('/')[1];
      for (let attempt=0;attempt<3;attempt++) {
        const previousShots=screenshots.length;
        try {
          const page=await routeTo('/'+route+(queries[name]||''));
          assert.ok(await page.$('.theme-root'),'Rendered theme root '+route);
          const data=await page.data();
          if (name === 'home') assert.ok(data.news.some(item => item.id === news.id), 'Real API home news loaded');
          if (name === 'publish-form') assert.equal(data.showForm, true, 'Resident publication form opened');
          if (name === 'industry') {
            assert.equal(data.mode, 'form', 'Industry form opened');
            assert.equal(data.districtLabel, '黄浦区', 'District uses its readable name');
          }
          assert.ok(data.themeClass.includes('material-'),'Material assigned '+route);
          assert.ok(await page.$('#navigation-header'),'Shared header '+route);
          await capturePositions(page,name,route);
          checks.push({route,material:data.themeClass.match(/material-\w+/)?.[0],header:true});
          saveProgress();
          console.log('PASS native simulator '+route);
          break;
        } catch (error) {
          screenshots.splice(previousShots);
          if(attempt===2)throw error;
          console.log('RETRY simulator '+route+' '+error.message);
        } finally {
          await mini.disconnect().catch(()=>{});
          mini=await require('./devtools_connection')();
          mini.on('exception',event=>errors.push(event));
        }
      }
    }
    // Re-capture variants on resume using this run's fresh API fixtures.
    const normalShots = screenshots.filter(shot => ['normal', 'middle', 'bottom'].includes(shot.variant));
    screenshots.splice(0, screenshots.length, ...normalShots);
    if (process.env.UI_AUDIT_STATES !== '0') {
      let page = await routeTo('/pages/discover/index');
      await page.setData({ error: '界面验收状态，网络连接暂时中断。', loading: false });
      await pause(100);
      await capture('discover', page.path, 'error');
      await page.setData({ error: '', loading: true, filtered: [] });
      await pause(100);
      await capture('discover', page.path, 'loading');
      await page.setData({ loading: false, filtered: [], hasMore: false });
      await pause(100);
      await capture('discover', page.path, 'empty');
      page = await routeTo('/pages/publish-form/index?categoryId=C04G01S01');
      assert.equal((await page.data()).showForm, true);
      await mini.evaluate(() => {
        const current = getCurrentPages().slice(-1)[0];
        current.setField({ currentTarget: { dataset: { field: 'title' } }, detail: { value: '界面验收退出确认' } });
        current.goBack();
        return true;
      });
      await pause(150);
      assert.equal((await page.data()).showExitDialog, true);
      await capture('publish-form', page.path, 'dialog');
      await mini.evaluate(() => {
        const current = getCurrentPages().slice(-1)[0];
        current.continueEditing();
        current.cancelPublish();
        return true;
      });
      await pause(300);
      await mini.callWxMethod('setStorageSync', 'city_life_user_id', reader.userId);
      await mini.callWxMethod('setStorageSync', 'city_life_v2_auth_token', reader.token);
      page = await routeTo('/pages/merchant-team/index?merchantId=' + merchant.id);
      assert.ok((await page.data()).error);
      assert.equal((await page.data()).canManage, false);
      await capture('merchant-team', page.path, 'permission');
      await mini.callWxMethod('removeStorageSync', 'city_life_v2_auth_token');
      await mini.callWxMethod('removeStorageSync', 'city_life_user_id');
      page = await routeTo('/pages/messages/index');
      assert.equal((await page.data()).hasSession, false);
      await capture('messages', page.path, 'guest');
      await mini.callWxMethod('setStorageSync', 'city_life_user_id', owner.userId);
      await mini.callWxMethod('setStorageSync', 'city_life_v2_auth_token', owner.token);
      await mini.callWxMethod('setStorageSync', 'city_life_preferences_' + owner.userId, {
        theme: 'clear',
        largeText: true,
        reduceMotion: true
      });
      for (const name of ['home', 'discover', 'publish', 'messages', 'me', 'publish-form']) {
        page = await routeTo('/pages/' + name + '/index' + (queries[name] || ''));
        assert.ok((await page.data()).themeClass.includes('large-text'));
        await capture(name, page.path, 'accessible');
      }
    }
    assert.equal(errors.length, 0, 'Simulator runtime exceptions');
    const restored = await session.restore();
    session = null;
    await mini.evaluate(() => { setTimeout(() => wx.reLaunch({url:'/pages/home/index'}), 100); return true; });
    await pause(1500);
    fs.writeFileSync(
      path.join(output, 'RESULTS.json'),
      JSON.stringify(
        {
          date: '2026-11-11',
          ok: true,
          sourceHash,
          simulator: true,
          physicalDevice: false,
          database: 'isolated PostgreSQL with labeled fixtures',
          stateScreenshots: 'loading/error/empty use explicit rendered-state injection; permission and guest use real authorization state',
          routes: checks,
          screenshots,
          exceptions: errors,
          restored
        },
        null,
        2
      ) + '\n'
    );
    console.log(
      'PASS ' +
        checks.length +
        ' routes, ' +
        screenshots.length +
        ' screenshots, verification baseline restored'
    );
    fs.rmSync(checkpoint, { force: true });
  } finally {
    const cleanupErrors = [];
    const cleanup = [
      async () => { if (session) await session.restore(); },
      async () => { if (mini) await mini.disconnect().catch(() => {}); },
      async () => {
        if (!server) return;
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      },
      async () => { if (repo) await repo.close(); },
      async () => { if (pool) await pool.end(); },
      () => control.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE'),
      () => control.end()
    ];
    for (const action of cleanup) {
      try { await action(); } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'UI verification cleanup failed; recovery file retained if storage restoration failed');
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
