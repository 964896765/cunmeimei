'use strict';

const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { isIP } = require('node:net');
const { Pool } = require('../backend/node_modules/pg');
const { residentFields } = require('../backend/tests/helpers/resident-fields');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = process.env.UI_AUDIT_OUTPUT ? path.resolve(process.env.UI_AUDIT_OUTPUT) : path.resolve(__dirname, '../docs/remediation/stage-2/visual');

async function main() {
  const dsn = process.env.PG_TEST_DATABASE_URL;
  require('../backend/src/test-database-guard').assertIsolatedDatabase(dsn);
  const schema = 'prism_ui_' + crypto.randomBytes(8).toString('hex'),
    control = new Pool({ connectionString: dsn });
  let pool, repo, server, mobileServer, mini, session, environment;
  async function connectMini() {
    const connected = await require('./devtools_connection')();
    try {
      const info = await connected.systemInfo();
      if (process.env.UI_AUDIT_EXPECT_PLATFORM)
        assert.equal(info.platform, process.env.UI_AUDIT_EXPECT_PLATFORM, 'Expected audit platform');
      if (environment) {
        assert.equal(info.platform, environment.platform, 'Audit platform remains unchanged');
        assert.equal(info.model, environment.model, 'Audit device remains unchanged');
      } else {
        environment = Object.fromEntries(
          ['platform', 'brand', 'model', 'system', 'version', 'SDKVersion', 'screenWidth', 'screenHeight', 'windowWidth', 'windowHeight', 'statusBarHeight', 'safeArea']
            .map(key => [key, info[key]])
        );
      }
      return connected;
    } catch (error) {
      await connected.disconnect();
      throw error;
    }
  }
  const screenshots = [],
    checks = [],
    layoutChecks = [],
    backgroundSamples = [],
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
    environment = previous.environment;
    checks.push(...previous.routes);
    screenshots.push(...previous.screenshots);
    layoutChecks.push(...(previous.layoutChecks || []));
    backgroundSamples.push(...(previous.backgroundSamples || []));
  }
  function saveProgress() {
    fs.writeFileSync(checkpoint, JSON.stringify({ sourceHash, environment, routes: checks, screenshots, layoutChecks, backgroundSamples }, null, 2) + '\n');
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
    const appOptions = {
      repo,
      areas: ['中心街道'],
      allowDevLogin: true,
      superAdminPassword: password,
      legalConfig: { operatorName: '隔离界面验收主体', contactEmail: 'privacy@example.test' }
    };
    server = require('../backend/src/server').createApp(appOptions);
    const bindHost = process.env.UI_AUDIT_HOST || '127.0.0.1';
    const [first, second] = bindHost.split('.').map(Number);
    const privateAddress = first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
    assert.ok(isIP(bindHost) === 4 && (bindHost === '127.0.0.1' || privateAddress), 'UI audit server uses loopback or a private LAN address');
    await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    let clientOrigin = origin;
    if (bindHost !== '127.0.0.1') {
      assert.ok(process.env.UI_AUDIT_TLS_KEY && process.env.UI_AUDIT_TLS_CERT, 'LAN device audit requires a TLS key and certificate');
      mobileServer = require('node:https').createServer({
        key:fs.readFileSync(process.env.UI_AUDIT_TLS_KEY),
        cert:fs.readFileSync(process.env.UI_AUDIT_TLS_CERT)
      }, server.listeners('request')[0]);
      await new Promise((resolve, reject) => mobileServer.once('error', reject).listen(0, bindHost, resolve));
      clientOrigin = 'https://' + bindHost + ':' + mobileServer.address().port;
    }
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
      process.env.UI_AUDIT_IMAGE?fs.readFileSync(process.env.UI_AUDIT_IMAGE):await require('../backend/node_modules/sharp')({
        create:{width:400,height:300,channels:3,background:'#E9E6E2'}
      }).png().toBuffer()
    );
    const payload = {
      ...residentFields('used', [image.id]),
      type: 'used',
      title:process.env.UI_AUDIT_IMAGE?'[界面验收] 家居信息图片展示':'[界面验收] 闲置实木书桌',
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
    if (process.env.UI_AUDIT_SCOPE === 'discover') {
      for (const [kind,title] of [['housing','[界面验收] 房屋信息与无图排版'],['community','[界面验收] 失物招领实用信息'],['used','[界面验收] 长标题与图片列表滚动检查']]) {
        const extra=(await request('/api/v1/publications','POST',{
          ...residentFields(kind,[image.id]),type:kind,title,
          detail:'明确标记的隔离验收内容，用于检查分类、发布时间、缺图和滚动布局。',
          price:kind==='community'?'':'100',district:'中心街道'
        },owner)).publication;
        await request('/admin/api/review','POST',{target:'publication',id:extra.id,status:'published',expectedRevision:1,textReviewed:true,imagesReviewed:true},admin);
      }
    }
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
    mini = await connectMini();
    mini.on('exception', (event) => errors.push(event));
    session = await require('./devtools_storage_recovery')(() => mini, async () => {
      await mini.disconnect().catch(() => {});
      mini = await connectMini();
    });
    await mini.evaluate(value => { require('utils/runtime.js').apiBaseUrl = value; return true; }, clientOrigin);
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
          if(attempt>0) await mini.reLaunch(url);
          else await mini.evaluate(({url, tab, refresh}) => {
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
        mini = await connectMini();
        mini.on('exception', (event) => errors.push(event));
      }
      throw last || Error('Route did not open ' + url.split('?')[0]);
    }
    async function capture(name, route, variant = 'normal', scrollTop = 0) {
      const file = name + '-' + variant + '.png';
      await mini.screenshot({ path: path.join(output, file) });
      screenshots.push({ route, variant, file, scrollTop });
    }
    async function checkLayout(route, variant = 'normal') {
      if (process.env.UI_AUDIT_GEOMETRY !== '1') return;
      const bounds = await mini.evaluate(() => new Promise(resolve => {
        const current = getCurrentPages().slice(-1)[0];
        const header = current.selectComponent('#navigation-header');
        const window = wx.getWindowInfo();
        const capsule = wx.getMenuButtonBoundingClientRect();
        header.createSelectorQuery().select('.nav-title').boundingClientRect()
          .select('.nav-action').boundingClientRect().select('.nav-back').boundingClientRect()
          .exec(rectangles => {
            const result = {title:rectangles[0], action:rectangles[1], back:rectangles[2], capsule, statusHeight:window.statusBarHeight};
            const bar = current.getTabBar?.();
            if (!bar) { resolve(result); return; }
            bar.createSelectorQuery().select('.curved-tabs').boundingClientRect()
              .select('.tab-publish .tab-icon').boundingClientRect()
              .exec(values => resolve({...result, navigation:values[0], publish:values[1]}));
          });
      }));
      assert.ok(bounds.title, 'Header title geometry ' + route);
      for (const item of [bounds.title, bounds.action, bounds.back].filter(Boolean)) {
        assert.ok(item.top >= bounds.statusHeight - 1, 'Control clears status bar ' + route);
        if (bounds.capsule.width > 0) assert.ok(item.right <= bounds.capsule.left - 6, 'Control clears native capsule ' + route);
      }
      if (bounds.action) assert.ok(bounds.title.right <= bounds.action.left + 1, 'Header title clears its action ' + route);
      if (bounds.navigation && bounds.publish) {
        assert.ok(bounds.publish.top >= bounds.navigation.top, 'Publish icon stays inside navigation ' + route);
        assert.ok(bounds.publish.bottom <= bounds.navigation.top + 57, 'Publish icon clears bottom safe area ' + route);
      }
      const existing = layoutChecks.findIndex(item => item.route === route && item.variant === variant);
      const record = {route, variant, passed:true, bounds};
      if (existing < 0) layoutChecks.push(record);
      else layoutChecks[existing] = record;
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
    const homePublishScope = process.env.UI_AUDIT_SCOPE === 'home-publish';
    const discoveryScope = process.env.UI_AUDIT_SCOPE === 'discover';
    const brightnessScope = process.env.UI_AUDIT_SCOPE === 'brightness';
    const routes = discoveryScope ? ['pages/discover/index'] : homePublishScope ? ['pages/home/index','pages/publish/index'] : brightnessScope || process.env.UI_AUDIT_SCOPE === 'main' ? app.tabBar.list.map(item => item.pagePath) : app.pages;
    for (const route of routes) {
      if (checks.some(check => check.route === route)) continue;
      const name = route.split('/')[1];
      for (let attempt=0;attempt<3;attempt++) {
        const previousShots=screenshots.length;
        try {
          const page=await routeTo('/'+route+(queries[name]||''));
          assert.ok(await page.$('.theme-root'),'Rendered theme root '+route);
          const data=await page.data();
          if (name === 'home') {
            if (!data.news.some(item => item.id === news.id)) console.log('Home fixture diagnostics '+JSON.stringify({loading:data.loading,error:data.error,region:data.region,newsCount:data.news.length,origin:await mini.evaluate(()=>require('utils/runtime.js').apiBaseUrl)}));
            assert.ok(data.news.some(item => item.id === news.id), 'Real API home news loaded');
            if (data.feed) assert.ok(data.featured.some(item => item.id === publication.id), 'Real API public information loaded');
          }
          if(name==='map'){for(let wait=0;wait<50&&(await page.data()).loading;wait++)await pause(200);}
          if (name === 'publish-form') assert.equal(data.showForm, true, 'Resident publication form opened');
          if (name === 'industry') {
            assert.equal(data.mode, 'form', 'Industry form opened');
            assert.equal(data.districtLabel, '黄浦区', 'District uses its readable name');
          }
          assert.ok(data.themeClass.includes('material-'),'Material assigned '+route);
          assert.ok(await page.$('#navigation-header'),'Shared header '+route);
          await checkLayout(route);
          await capturePositions(page,name,route);
          if(brightnessScope) {
            const background=require('../miniprogram/utils/palettes').palettes.prism.background;
            const expectedRgb=background.slice(1).match(/../g).map(value=>parseInt(value,16));
            assert.ok(data.themeStyle.includes('--background:'+background),'Shared canvas '+name);
            const {data:pixels,info}=await require('../backend/node_modules/sharp')(path.join(output,name+'-normal.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
            const x=Math.round(8*info.width/environment.windowWidth),y=Math.round(100*info.height/environment.windowHeight);
            const offset=(y*info.width+x)*4,rgb=Array.from(pixels.subarray(offset,offset+3));
            assert.deepEqual(rgb,expectedRgb,'Rendered page canvas '+name);
            backgroundSamples.push({page:name,rgb,x,y});
            if(name==='me') {
              assert.equal((await page.$$('.workspace-item')).length,4);
              assert.equal((await page.$$('.personal-functions')).length,1);
            }
          }
          checks.push({route,material:data.themeClass.match(/material-\w+/)?.[0],header:true});
          saveProgress();
          console.log('PASS '+environment.platform+' '+route);
          break;
        } catch (error) {
          screenshots.splice(previousShots);
          if(attempt===2)throw error;
          console.log('RETRY '+environment.platform+' '+route+' '+error.message);
        } finally {
          await mini.disconnect().catch(()=>{});
          mini=await connectMini();
          mini.on('exception',event=>errors.push(event));
        }
      }
    }
    // Re-capture variants on resume using this run's fresh API fixtures.
    const normalShots = screenshots.filter(shot => ['normal', 'middle', 'bottom'].includes(shot.variant));
    screenshots.splice(0, screenshots.length, ...normalShots);
    if (homePublishScope) {
      let page = await routeTo('/pages/home/index');
      for (let attempt=0;attempt<50;attempt++) {
        if ((await page.data()).featured.some(item=>item.id===publication.id&&item.favoriteKnown)) break;
        await pause(100);
      }
      const initialSaved = (await page.data()).featured.find(item=>item.id===publication.id).isSaved;
      await mini.evaluate(async id => { await getCurrentPages().slice(-1)[0].toggleSaved({detail:{id}}); return true; },publication.id);
      assert.equal((await page.data()).featured.find(item=>item.id===publication.id).isSaved,!initialSaved,'Home favorite updates its real API state');
      const savedState = await request('/api/v1/me/saved-state?ids='+publication.id,'GET',undefined,owner);
      assert.equal(savedState.savedIds.includes(publication.id),!initialSaved,'Home favorite persisted');
      await mini.evaluate(async id => { await getCurrentPages().slice(-1)[0].toggleSaved({detail:{id}}); return true; },publication.id);
      await mini.evaluate(() => new Promise(resolve => wx.pageScrollTo({scrollTop:999999,duration:0,complete:resolve})));
      await pause(1800);
      await capture('home',page.path,'feed');
      const newsEntry=await page.$('.news-headline');
      assert.ok(newsEntry,'Real sourced news appears in compact strip');
      await newsEntry.tap();
      for(let attempt=0;attempt<30&&(await mini.currentPage()).path==='pages/home/index';attempt++)await pause(100);
      assert.equal((await mini.currentPage()).path,'pages/information/index','News strip opens its article');
      await mini.navigateBack();
      await pause(500);
      page=await routeTo('/pages/publish/index');
      assert.equal((await page.$$('.industry-choice')).length,27,'Default directory exposes all industries');
      assert.equal((await page.$$('.project-row')).length,4,'Default digital group renders four project cards');
      assert.equal((await page.data()).draftCount,await mini.evaluate(async()=>require('utils/draft-summary.js').read()),'Draft badge derives from actual draft summary');
      const geometry=await mini.evaluate(()=>new Promise(resolve=>{
        wx.createSelectorQuery().select('.project-browser').boundingClientRect().selectAll('.project-row').boundingClientRect().exec(resolve);
      }));
      assert.ok(geometry[0].height>=140,'Directory retains usable scrolling space');
      assert.ok(geometry[1][1].left>geometry[1][0].left,'Project cards use two columns');
      await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].toggleProjectSearch();getCurrentPages().slice(-1)[0].searchProjects({detail:{value:'空调维修'}});return true;});
      assert.equal((await page.data()).projects[0].id,'C03G02S01','Search resolves a project across industries');
      await pause(300);await capture('publish',page.path,'search');
      await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].closeProjectSearch();return true;});
      assert.equal((await page.data()).selectedCategory,'C04','Search cancel restores selected industry');
      await mini.callWxMethod('setStorageSync','city_life_preferences_'+owner.userId,{theme:'prism',largeText:true,reduceMotion:true});
      for(const name of ['home','publish']) {
        page=await routeTo('/pages/'+name+'/index');
        await checkLayout(page.path,'accessible');
        await capture(name,page.path,'accessible');
      }
      await mini.callWxMethod('setStorageSync','city_life_preferences_'+owner.userId,{theme:'prism',largeText:false,reduceMotion:true});
      page=await routeTo('/pages/home/index');
      await page.setData({featured:[],feed:[],loading:false,error:''});await pause(150);
      await capture('home',page.path,'empty');
      await page.setData({loading:true});await pause(150);await capture('home',page.path,'loading');
      await page.setData({loading:false,error:'界面验收状态，网络暂时不可用。'});await pause(150);await capture('home',page.path,'error');
    }
    if (discoveryScope) {
      async function returnToDiscovery() {
        try { await mini.navigateBack(); }
        catch(error) { if(!/timeout/i.test(error.message)||(await mini.currentPage()).path!=='pages/discover/index')throw error; }
        await pause(500);
        await mini.disconnect();
        mini=await connectMini();
        mini.on('exception',event=>errors.push(event));
      }
      let page=await routeTo('/pages/discover/index');
      await mini.evaluate(()=>new Promise(resolve=>wx.pageScrollTo({scrollTop:0,duration:0,complete:resolve})));
      await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].restoreNavigation();return true;});
      const bounds=await mini.evaluate(()=>new Promise(resolve=>{
        const current=getCurrentPages().slice(-1)[0];
        current.createSelectorQuery().selectAll('.float-action').boundingClientRect().exec(rows=>{
          current.getTabBar().createSelectorQuery().select('.curved-tabs').boundingClientRect().exec(tabs=>resolve({actions:rows[0],navigation:tabs[0],width:wx.getWindowInfo().windowWidth}));
        });
      }));
      assert.equal(bounds.actions.length,2,'Search and map keep their two floating controls');
      assert.ok(bounds.actions.every(action=>action.left>bounds.width/2&&action.bottom<bounds.navigation.top),'Both floating controls clear the lower-right navigation safe area');
      assert.ok(bounds.actions[0].bottom<bounds.actions[1].top,'Search stays above map');
      assert.ok((await page.data()).filtered.some(item=>item.id===publication.id),'Real API content is rendered');
      const channels=await page.$('#business-channels');
      assert.equal((await channels.$$('.channel-tab')).length,7,'All seven channels remain visible');
      await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].openSort();return true;});
      await pause(200);await capture('discover',page.path,'sort');
      await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].closeSort();getCurrentPages().slice(-1)[0].openFilters();return true;});
      await pause(200);await capture('discover',page.path,'filters');
      await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].closeFilters();return true;});
      await pause(500);
      console.log('CHECK lower-right search');
      try { await (await page.$$('.float-action'))[0].tap(); }
      catch(error) { if(!/timeout/i.test(error.message)||(await mini.currentPage()).path!=='pages/search/index')throw error; }
      for(let attempt=0;attempt<30&&(await mini.currentPage()).path==='pages/discover/index';attempt++)await pause(100);
      assert.equal((await mini.currentPage()).path,'pages/search/index','Lower-right search opens the current query');
      console.log('PASS lower-right search');
      await returnToDiscovery();
      page=await mini.currentPage();
      console.log('CHECK lower-right map');
      // The simulator can retain stale native element handles after returning from search.
      // Invoke the existing bound handler and verify the real navigation result.
      await mini.evaluate(()=>{setTimeout(()=>getCurrentPages().slice(-1)[0].openMap(),100);return true;});
      for(let attempt=0;attempt<30&&(await mini.currentPage()).path==='pages/discover/index';attempt++)await pause(100);
      assert.equal((await mini.currentPage()).path,'pages/map/index','Lower-right map opens map browsing');
      console.log('PASS lower-right map');
      await returnToDiscovery();
      page=await routeTo('/pages/discover/index');
      await mini.evaluate(()=>getCurrentPages().slice(-1)[0].changeType({detail:{type:'used'}}));
      await pause(500);await capture('discover',page.path,'selected-channel');
      const selected=await (await page.$('#business-channels')).$('#channel-used');
      assert.ok((await selected.attribute('class')).includes('is-selected'),'Real selected channel is highlighted');
      await mini.callWxMethod('setStorageSync','city_life_preferences_'+owner.userId,{theme:'prism',largeText:true,reduceMotion:true});
      page=await routeTo('/pages/discover/index');
      await checkLayout(page.path,'accessible');await capture('discover',page.path,'accessible');
      await mini.callWxMethod('setStorageSync','city_life_preferences_'+owner.userId,{theme:'prism',largeText:false,reduceMotion:true});
      page=await routeTo('/pages/discover/index');
      await page.setData({filtered:[],loading:false,error:'',hasMore:false});await pause(100);await capture('discover',page.path,'empty');
      await page.setData({loading:true});await pause(100);await capture('discover',page.path,'loading');
      await page.setData({loading:false,error:'界面验收状态，网络连接暂时中断。'});await pause(100);await capture('discover',page.path,'error');
    }
    if(brightnessScope) {
      let page=await routeTo('/pages/me/index');
      for(const [method,mode,variant] of [['openProfile','profile','profile'],['openAccount','account','account'],['openServiceCenter','service','service'],['openHelp','help','help'],['openNotifications','privacy','notifications'],['openPrivacy','privacy','privacy']]) {
        await mini.evaluate(async name=>{await getCurrentPages().slice(-1)[0][name]();return true;},method);
        for(let attempt=0;attempt<30;attempt++) {
          const data=await page.data();
          if(data.mode===mode&&!data.summaryLoading&&!data.settingsBusy)break;
          await pause(100);
        }
        assert.equal((await page.data()).mode,mode,method+' opens its existing destination');
        if(mode==='profile') {
          assert.equal((await page.$$('.profile-field')).length,3,'Profile has three text fields');
          assert.equal((await page.$$('.avatar-editor')).length,1,'Profile has one avatar editor');
        }
        await pause(200);await capture('me',page.path,variant);
        await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].back();return true;});
        await pause(200);
      }
      await mini.callWxMethod('setStorageSync','city_life_preferences_'+owner.userId,{theme:'prism',largeText:true,reduceMotion:true});
      for(const name of ['home','me']) {
        page=await routeTo('/pages/'+name+'/index');
        await checkLayout(page.path,'accessible');await capture(name,page.path,'accessible');
      }
      await mini.callWxMethod('removeStorageSync','city_life_v2_auth_token');
      await mini.callWxMethod('removeStorageSync','city_life_user_id');
      page=await routeTo('/pages/me/index');
      assert.equal((await page.data()).hasSession,false);
      await capture('me',page.path,'guest');
    }
    if (!homePublishScope && !discoveryScope && !brightnessScope && process.env.UI_AUDIT_STATES !== '0') {
      let page = await routeTo('/pages/discover/index');
      await mini.evaluate(() => { getCurrentPages().slice(-1)[0].openSort(); return true; });
      await pause(200);
      assert.equal((await page.data()).sortOpen, true);
      await capture('discover', page.path, 'sort');
      await mini.evaluate(() => { getCurrentPages().slice(-1)[0].closeSort(); return true; });
      page=await routeTo('/pages/publish/index');
      await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].toggleProjectSearch();return true;});
      await pause(200);await capture('publish',page.path,'search');
      await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].closeProjectSearch();return true;});
      page=await routeTo('/pages/discover/index');
      await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].openFilters();return true;});
      await pause(200);await capture('discover',page.path,'filters');
      await mini.evaluate(()=>{getCurrentPages().slice(-1)[0].closeFilters();return true;});
      page = await routeTo('/pages/map/index');
      await mini.evaluate(() => { getCurrentPages().slice(-1)[0].openFilters(); return true; });
      await pause(200);
      assert.equal((await page.data()).filterOpen, true);
      await capture('map', page.path, 'filters');
      const mapSheet = await page.$('#map-filter-sheet');
      const mapSheetContent = await mapSheet.$('.sheet-content');
      await mapSheetContent.scrollTo(0, 999999);
      await pause(350);
      const mapApplyBounds = await mini.evaluate(() => new Promise(resolve => {
        const current = getCurrentPages().slice(-1)[0];
        current.createSelectorQuery().select('.filter-apply').boundingClientRect().exec(values =>
          resolve({button:values[0], window:wx.getWindowInfo()})
        );
      }));
      assert.ok(mapApplyBounds.button?.height > 0, 'Map apply action rendered');
      assert.ok(mapApplyBounds.button.top >= 0, 'Map apply action scrolls into view');
      assert.ok(mapApplyBounds.button.bottom <= mapApplyBounds.window.windowHeight, 'Map apply action clears viewport bottom');
      await capture('map', page.path, 'filters-bottom');
      await (await page.$('.filter-apply')).tap();
      await pause(200);
      assert.equal((await page.data()).filterOpen, false, 'Map filter apply closes sheet');
      page = await routeTo('/pages/search/index?q=' + encodeURIComponent('书桌'));
      await mini.evaluate(() => { getCurrentPages().slice(-1)[0].toggleAdvanced(); return true; });
      await pause(200);
      assert.equal((await page.data()).advancedOpen, true);
      await capture('search', page.path, 'filters');
      await mini.evaluate(() => { getCurrentPages().slice(-1)[0].closeAdvanced(); return true; });
      page = await routeTo('/pages/regions/index');
      await mini.evaluate(() => {
        getCurrentPages().slice(-1)[0].expandDistrict({currentTarget:{dataset:{code:'310100'}}});
        return true;
      });
      await pause(200);
      assert.equal((await page.data()).districtCity?.code, '310100');
      await capture('regions', page.path, 'districts');
      await mini.evaluate(() => { getCurrentPages().slice(-1)[0].closeDistricts(); return true; });
      page = await routeTo('/pages/discover/index');
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
        await checkLayout(page.path, 'accessible');
        await capture(name, page.path, 'accessible');
      }
    }
    assert.equal(errors.length, 0, 'Simulator runtime exceptions');
    const restored = await session.restore();
    session = null;
    await mini.evaluate(() => { setTimeout(() => wx.reLaunch({url:'/pages/home/index'}), 100); return true; });
    await pause(1500);
    await mini.screenshot({path:path.join(output,'home-local-data.png')});
    screenshots.push({route:'pages/home/index',variant:'local-data',file:'home-local-data.png',scrollTop:0});
    fs.writeFileSync(
      path.join(output, 'RESULTS.json'),
      JSON.stringify(
        {
          date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),
          ok: true,
          sourceHash,
          simulator: environment.platform === 'devtools',
          physicalDevice: ['android', 'ios'].includes(environment.platform),
          environment,
          database: 'isolated PostgreSQL with labeled fixtures',
          stateScreenshots: 'loading/error/empty use explicit rendered-state injection; permission and guest use real authorization state',
          routes: checks,
          screenshots,
          layoutChecks,
          backgroundSamples,
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
        for (const active of [server, mobileServer].filter(Boolean)) {
          active.closeAllConnections();
          await new Promise(resolve => active.close(resolve));
        }
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
