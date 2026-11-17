"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const catalog = require("../miniprogram/utils/classification-contract");
const channels = require("../miniprogram/utils/discovery-channels").definitions;
const definitions = require("../miniprogram/utils/discovery-refinements");
const output = path.resolve(__dirname, "../docs/design/experience-refinement-2026-11-18");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function poll(read, accept, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await read();
    if (accept(result)) return result;
    await pause(150);
  }
  throw Error("Timed out " + label);
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const favoritesOnly=process.env.EXPERIENCE_QA_FAVORITES_ONLY==='1';
  const reportName=favoritesOnly?'favorites-pagination.json':'ui-result.json';
  const dsn = process.env.PG_TEST_DATABASE_URL;
  require("../backend/src/test-database-guard").assertIsolatedDatabase(dsn);
  const { Pool } = require("../backend/node_modules/pg");
  const pool = new Pool({ connectionString: dsn });
  let repo;
  try {
  await require("../backend/src/schema-migrations").applyMigrations(pool);
  repo = require("../backend/src/pg-repository").createPgRepository(dsn);
  await repo.seedRegions(["隔离验收地区"]);
  const uid = await repo.upsertIdentity("dev_local", "experience-refinement-2026-11-18");
  const token = "LOCAL_MEMORY_ONLY_FIXTURE_TOKEN_01234567890123456789";
  await repo.newSession(uid, crypto.createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3600000).toISOString());
  const ids = [];
  for (let index = 0; index < 28; index++) {
    const item = await repo.createPublication(uid, {
      publicationConsent: require("../backend/tests/helpers/publication-confirmation").acceptedConsent(),
      type: "used",
      title: "隔离验收 · 闲置信息 " + (index + 1),
      description: "仅用于本地功能与布局验收的隔离数据。",
      district: "隔离验收地区",
      price: index === 0 ? "150" : "99",
      attributes: { categoryId: "C04G01S01", condition: index === 0 ? "几乎全新" : "正常使用" },
    });
    await repo.reviewPublication(item.id, "published", "隔离功能验收");
    ids.push(item.id);
  }
  for(const id of ids.slice(0,favoritesOnly?25:1))await repo.saveItem(uid,id,true,false);
  const server = require("../backend/src/server").createApp({ repo, areas: ["隔离验收地区"], allowDevLogin: true });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let mini, session, cleanup, complete = false;
  const checks = [], exceptions = [], metrics = {};
  const check = (condition, label) => { assert.ok(condition, label); checks.push(label); console.log("PASS " + label); };
  try {
    mini = await require("./devtools_connection")(process.env.EXPERIENCE_QA_WS || "ws://127.0.0.1:9421");
    await mini.reLaunch("/pages/me/index");
    await pause(1000);
    mini.on("exception", error => exceptions.push(String(error.message || error)));
    session = await require("./devtools_fixture_session")(mini, {
      origin: "http://127.0.0.1:" + server.address().port,
      uid,
      globalKey: "__experienceAudit",
      bindRuntimeOrigin: true,
    });
    await mini.evaluate(() => {wx.removeStorageSync('city_life_browse_city');wx.removeStorageSync('city_life_v06_selected_area');return true;});
    metrics.system = await mini.systemInfo();
    const go = async name => {
      await mini.reLaunch("/pages/" + name + "/index");
      const page = await poll(() => mini.currentPage(), current => current?.path === "pages/" + name + "/index", name + " route");
      await poll(() => page.data(), data => !data.loading && !data.summaryLoading && !data.configLoading, name + " loading");
      await pause(150);
      return page;
    };
    const shot = async name => { await pause(200); await mini.screenshot({ path: path.join(output, name + ".png") }); };
    const call = (method, event) => mini.evaluate((method, event) => {
      setTimeout(() => getCurrentPages().slice(-1)[0][method](event), 0);
      return true;
    }, method, event);
    const rects = selectors => mini.evaluate(selectors => new Promise(resolve => {
      const query = wx.createSelectorQuery();
      selectors.forEach(selector => query.select(selector).boundingClientRect());
      query.exec(rows => resolve(Object.fromEntries(selectors.map((selector, index) => [selector, rows[index]]))));
    }), selectors);
    const settle = page => poll(() => page.data(), data => !data.loading && !data.quickBusy, "filter result");
    const backRoute = async (name = "me") => {
      await mini.evaluate(()=>{setTimeout(()=>wx.navigateBack({delta:1}),0);return true;});
      const current=await poll(()=>mini.currentPage(),page=>page?.path==='pages/'+name+'/index','return '+name);
      await poll(()=>current.data(),data=>!data.loading&&!data.summaryLoading&&!data.pointsBusy,'return loading');
      await pause(150);
      return current;
    };
    let page;
    if(favoritesOnly){
      page=await go('me');
      check((await page.data()).favCount===25,'personal summary reads all 25 saved fixtures');
      await (await page.$('.saved-entry')).tap();await pause(120);
      await poll(()=>page.data(),data=>data.items.length===20&&!data.loading,'first favorite page');
      check((await page.data()).hasMore,'the first favorite page exposes continuation');
      const removed=(await page.data()).items[0].id;
      const card=await page.$('#saved-content-'+removed);
      await (await card.$('.save-button')).tap();await pause(120);
      await poll(()=>page.data(),data=>!data.loading&&!data.savedRecheck&&data.items.length===20&&!data.items.some(item=>item.id===removed),'favorite page repair');
      check(!(await repo.isSaved(uid,removed)),'favorite removal persists and replenishes the visible page');
      await mini.pageScrollTo(99999);
      await (await page.$('#saved-more')).tap();await pause(120);
      await poll(()=>page.data(),data=>!data.loading&&data.items.length===24,'favorite continuation');
      const first=await repo.savedItems(uid,0,false),second=await repo.savedItems(uid,20,false);
      assert.deepEqual((await page.data()).items.map(item=>item.id).sort(),[...first.items,...second.items].map(item=>item.id).sort());
      check(true,'continuing after removal returns all 24 remaining favorites without omissions');
      await poll(()=>page.data(),data=>data.favCount===24,'favorite summary refreshed');
      check(true,'personal favorite count refreshes to the actual remaining total');
      page=await go('publish');
      for(const categoryId of ['C12','C21']){
        const sidebar=await page.$('.industry-sidebar'),choice=await page.$('.industry-choice[data-id="'+categoryId+'"]');
        const top=(await choice.offset()).top-(await sidebar.offset()).top+Number(await sidebar.property('scrollTop'))-100;
        await sidebar.scrollTo(0,Math.max(0,top));await pause(120);
        await choice.tap();await pause(120);
        await poll(()=>page.data(),data=>data.selectedCategory===categoryId,'visible selected industry');
        check(true,categoryId+' can be selected through its visible sidebar control');
        for(const group of catalog.categories.find(item=>item.id===categoryId).groups){
          if((await page.data()).expandedGroupId!==group.id){
            const header=await poll(()=>page.$('.project-group[data-id="'+group.id+'"]'),Boolean,'visible group control');
            await header.trigger('tap');
          }
          await poll(()=>page.data(),data=>data.expandedGroupId===group.id,'visible group');
          await (await page.$('.project-content')).scrollTo(0,0);
          await shot('publish-'+group.id);
        }
      }
      await mini.evaluate(uid=>{
        const key='city_life_preferences_'+uid;
        wx.setStorageSync(key,{...wx.getStorageSync(key),theme:'prism',largeText:true});return true;
      },uid);
      page=await go('me');
      const pointsAction=await (await page.$('.points-action')).size();
      check(pointsAction.width>pointsAction.height*1.5,'large-text points navigation retains a readable horizontal action');
      await shot('me-large-text');
      check(exceptions.length===0,'no runtime exceptions during favorite pagination');
      complete=true;
      return;
    }
    page = await go("discover");
    check((await page.data()).type === "job", "discovery still opens the recruitment channel");
    const channelTabs = await page.$("#business-channels");
    for (const channel of channels) {
      await (await channelTabs.$('[data-type="' + channel.id + '"]')).tap(); await pause(120);
      await poll(() => page.data(), data => data.type === channel.id && !data.loading, "channel " + channel.id);
      await (await page.$(".refine-trigger")).tap(); await pause(120);
      await poll(() => page.data(), data => data.filterOpen, "filter panel");
      assert.deepEqual((await page.data()).panelFilters.map(field => field.key), definitions.panel(channel.id).map(field => field.key));
      const bounds = await rects([".filter-panel-heading", ".filter-panel-footer"]);
      check(bounds[".filter-panel-heading"].bottom <= bounds[".filter-panel-footer"].top && bounds[".filter-panel-footer"].bottom <= metrics.system.windowHeight, channel.id + " has matching filter fields and a visible fixed footer");
      await (await page.$(".panel-close")).tap(); await pause(120);
    }
    await (await channelTabs.$('[data-type="used"]')).tap(); await pause(120);
    await poll(() => page.data(), data => data.type === "used" && !data.loading, "used feed");
    check(!(await page.data()).error, "discovery reads approved records from the isolated backend");
    await shot("discover-normal");
    await mini.pageScrollTo(800);
    await poll(() => page.data(), data => data.pageCompact, "compact discovery");
    metrics.sticky = await rects([".discover-sticky", ".discover-controls", ".discover-floats"]);
    check(metrics.sticky[".discover-sticky"].top >= (await page.data()).headerHeight - 2, "sticky discovery clears the native header");
    await shot("discover-sticky");
    await (await page.$(".refine-trigger")).tap(); await pause(120);
    await (await page.$('.refinement-option[data-key="price"][data-value="100_500"]')).tap(); await pause(120);
    await poll(() => page.data(), data => data.refinements.price === "100_500" && !data.loading, "price filter applied");
    check((await page.data()).filtered.length === 1 && (await page.data()).filtered[0].id === ids[0], "selecting a price band filters server results before pagination");
    check((await page.data()).selectedConditions.some(row => row.key === "refinement:price"), "selected conditions remain addressable through the panel and badge");
    await shot("discover-filter-panel");
    await (await page.$(".filter-apply")).tap(); await pause(120);
    await mini.pageScrollTo(0);
    await shot("discover-selected");
    await (await page.$('.condition-tag[data-key="refinement:price"]')).tap(); await pause(120);
    await poll(() => page.data(), data => !data.refinements.price && !data.loading, "remove active filter");
    check((await page.data()).selectedConditions.length === 0, "removing a condition clears both the request and its badge");
    await (await page.$(".compact-sort")).tap(); await pause(120);
    check((await page.data()).sortOptions.every(option => option.enabled), "sorting exposes only choices supported by the current channel");
    await (await page.$('.sort-option[data-code="price_high"]')).tap(); await pause(120);
    await poll(()=>page.data(),data=>data.sortCode==='price_high'&&!data.loading&&data.filtered[0]?.id===ids[0],'price order');
    check(true, "price sorting uses the backend order");
    await (await page.$(".refine-trigger")).tap(); await pause(120);
    await (await page.$(".filter-reset")).tap(); await pause(120);
    await settle(page);
    check((await page.data()).sortCode === "latest", "reset restores the default latest ordering");
    await mini.evaluate(()=>{
      const state=getApp().globalData.__experienceAudit;
      state.filterRequest=wx.request;
      wx.request=options=>options.url.includes('/api/v1/feed?')
        ? (setTimeout(()=>options.fail({errMsg:'request:fail isolated filter verification'}),0),{abort(){}})
        : state.filterRequest(options);
      return true;
    });
    await call('filter');
    await poll(()=>page.data(),data=>!!data.error&&!data.loading,'filter failure');
    check(await (await page.$('.filter-apply')).property('disabled'),'a failed filter request keeps confirmation disabled and exposes retry');
    await shot('discover-filter-error');
    await mini.evaluate(()=>{wx.request=getApp().globalData.__experienceAudit.filterRequest;return true;});
    await (await page.$('.filter-status button')).tap(); await pause(120);
    await poll(()=>page.data(),data=>!data.error&&!data.loading,'filter recovery');
    check(true,'filter retry recovers against the real isolated backend');
    await (await page.$(".panel-close")).tap(); await pause(120);
    for (const [selector, target] of [[".float-search", "search"], [".float-globe", "map"]]) {
      await (await page.$(selector)).tap(); await pause(120);
      await poll(() => mini.currentPage(), current => current?.path === "pages/" + target + "/index", target + " route");
      check(true, "lower-right " + target + " opens its existing page");
      page = await backRoute("discover");
      await settle(page);
    }

    page = await go("me");
    check((await page.data()).postCount === 28 && (await page.data()).favCount === 1, "personal center displays real publication and favorite counts");
    await shot("me-main");
    for (const [selector, mode] of [[".profile-entry", "profile"], [".account-entry", "account"], [".help-entry", "help"], [".privacy-entry", "privacy"], [".data-entry", "privacy"]]) {
      await (await page.$(selector)).tap(); await pause(120);
      await poll(() => page.data(), data => data.mode === mode && !data.settingsBusy && !data.summaryLoading, "personal " + selector);
      const header = await page.$("#navigation-header");
      check((await header.data()).back === true, selector + " opens a titled page with header back navigation");
      await (await header.$(".nav-back")).tap(); await pause(120);
      await poll(() => page.data(), data => data.mode === "main", "personal back");
    }
    await (await page.$('.profile-entry')).tap(); await pause(120);
    await poll(()=>page.data(),data=>data.mode==='profile'&&!data.summaryLoading,'profile editing');
    await (await page.$('.profile-field[data-field="displayName"]')).tap(); await pause(120);
    await poll(()=>mini.evaluate(()=>getApp().globalData.__experienceAudit.pendingModal?.title),title=>title==='修改昵称','profile edit dialog');
    await mini.evaluate(()=>{getApp().globalData.__experienceAudit.pendingModal.success({confirm:true,content:'隔离验收用户'});return true;});
    await poll(()=>page.data(),data=>data.displayName==='隔离验收用户'&&!data.profileBusy,'profile persistence');
    check(true,'profile editing saves through the existing profile API');
    await call('back');
    await poll(()=>page.data(),data=>data.mode==='main','profile back');
    await (await page.$('.notification-settings-entry')).tap(); await pause(120);
    await poll(()=>page.data(),data=>data.settingsSection==='notifications'&&!data.settingsBusy,'notification settings');
    await (await page.$('switch[data-field="notificationPreview"]')).trigger('change',{value:false});
    await (await page.$('.btn')).tap(); await pause(120);
    await poll(()=>page.data(),data=>!data.settingsBusy,'notification saved');
    const preferences=await poll(async()=> (await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/me/preferences',{headers:{Authorization:'Bearer '+token}})).json(),value=>value.notificationPreview===false,'persisted notification preference');
    check(preferences.notificationPreview===false,'notification settings persist against the isolated account');
    await shot('me-notifications');
    await call('back');
    await poll(()=>page.data(),data=>data.mode==='main','notifications back');
    for(const selector of ['.cache-entry','.about-entry']){
      const before=await mini.evaluate(()=>getApp().globalData.__experienceAudit.modalCount);
      await (await page.$(selector)).tap(); await pause(120);
      await poll(()=>mini.evaluate(()=>getApp().globalData.__experienceAudit.modalCount),count=>count>before,selector+' dialog');
      check(true,selector+' opens its actionable dialog');
    }
    await (await page.$('.personal-message-entry')).tap(); await pause(120);
    await poll(()=>mini.currentPage(),current=>current?.path==='pages/messages/index','message entry');
    check(true,'personal message entry opens the message workspace');
    page=await go('me');
    await (await page.$(".account-entry")).tap(); await pause(120);
    await (await page.$("#account-closure")).tap(); await pause(120);
    await poll(() => page.data(), data => data.settingsSection === "data" && !data.settingsBusy, "closure form");
    check((await page.data()).requestKindIndex === 3, "account closure opens the closure request type directly");
    await call("back");
    await poll(() => page.data(), data => data.mode === "account", "nested account return");
    check(true, "returning from account data restores the account panel");
    await call("back");
    await poll(() => page.data(), data => data.mode === "main", "main center");
    await (await page.$(".saved-entry")).tap(); await pause(120);
    await poll(() => page.data(), data => data.mode === "saved" && !data.loading, "favorites");
    check((await page.data()).items[0].id === ids[0], "favorites load the current account's saved records");
    await shot("me-favorites");
    const card = await poll(()=>page.$("#saved-content-"+ids[0]),Boolean,"saved content card");
    await (await card.$(".save-button")).tap(); await pause(120);
    await poll(() => page.data(), data => data.items.length === 0, "favorite removed");
    check(!(await repo.isSaved(uid, ids[0])), "favorite removal persists through the existing service");
    await call("back");
    await poll(() => page.data(), data => data.mode === "main", "favorites back");
    await mini.evaluate(({uid,ids}) => wx.setStorageSync("city_life_recent_" + uid, ids.slice(0,2)), {uid,ids});
    await (await page.$(".history-entry")).tap(); await pause(120);
    await poll(() => page.data(), data => data.mode === "history" && !data.loading, "history");
    check((await page.data()).items.length === 2, "history revalidates local records against visible publications");
    await call("back");
    await poll(() => page.data(), data => data.mode === "main", "history back");
    for (const [selector, route] of [[".posts-entry", "my-posts"], [".draft-entry", "drafts"], [".bookings-entry", "my-bookings"]]) {
      await (await page.$(selector)).tap(); await pause(120);
      const target = await poll(() => mini.currentPage(), current => current?.path === "pages/" + route + "/index", route);
      await poll(() => target.data(), data => !data.loading, route + " data");
      check(!(await target.data()).error, selector + " loads its actual management destination");
      page = await backRoute();
    }
    await (await page.$("#service-center-entry")).tap(); await pause(120);
    await poll(() => page.data(), data => data.mode === "service", "service center");
    await shot("me-service");
    for (const [section, route] of [["merchant","merchant"], ["credentials","industry"], ["verification","verification"], ["cases","business"], ["mine","industry"], ["sent","industry"], ["received","industry"], ["reports","industry"]]) {
      await (await page.$('[data-section="' + section + '"]')).tap(); await pause(120);
      const target = await poll(() => mini.currentPage(), current => current?.path === "pages/" + route + "/index", "service " + section);
      await poll(() => target.data(), data => !data.loading, section + " data");
      check(!(await target.data()).error, "service " + section + " reaches its authorized backend-backed view");
      page = await backRoute();
    }
    await call("back");
    await poll(() => page.data(), data => data.mode === "main", "service back");
    await (await page.$("#points-center-entry")).tap(); await pause(120);
    await poll(() => page.data(), data => data.mode === "points" && !data.pointsBusy, "points center");
    check(!(await page.data()).pointsError, "points center reads account, rules and records");
    for (const [selector, tab] of [["#points-redeem","offers"], ["#points-orders","orders"], ["#points-promotion","promotion"]]) {
      await (await page.$(selector)).tap(); await pause(120);
      const target = await poll(() => mini.currentPage(), current => current?.path === "pages/commerce/index", "points " + tab);
      await poll(() => target.data(), data => data.tab === tab && !data.loading, tab + " data");
      check(!(await target.data()).error, "points " + tab + " reaches the non-cash benefits workflow");
      page = await backRoute();
      await poll(() => page.data(), data => !data.pointsBusy, "points restore");
    }
    page=await go('publish');
    const rendered=new Set();
    for(const category of (await page.data()).categories){
      if((await page.data()).selectedCategory!==category.id){
        const choice=await poll(()=>page.$('.industry-choice[data-id="'+category.id+'"]'),Boolean,'industry control '+category.id);
        await choice.trigger('tap');
      }
      await poll(()=>page.data(),data=>data.selectedCategory===category.id,'industry '+category.id);
      for(const group of catalog.categories.find(item=>item.id===category.id).groups){
        if((await page.data()).expandedGroupId!==group.id){
          const control=await poll(()=>page.$('.project-group[data-id="'+group.id+'"]'),Boolean,'group control '+group.id);
          await control.trigger('tap');
        }
        await poll(()=>page.data(),data=>data.expandedGroupId===group.id,'group '+group.id);
        const scroller=await page.$('.project-content');
        await scroller.scrollTo(0,0);await pause(100);await scroller.scrollTo(0,99999);
        const images=await poll(async()=>{
          const elements=[...await page.$$('.project-asset'),...await page.$$('.project-art')];
          return Promise.all(elements.map(element=>element.data()));
        },items=>items.length===group.items.length&&items.every(item=>item.imageReady),'illustrations '+group.id);
        images.forEach(item=>rendered.add(item.assetId));
        if(['C12','C21'].includes(category.id)){
          check(images.every(item=>item.stage==='rendered3d'&&item.frame==='transparent'),'all '+group.id+' illustrations use their transparent 3D scenes');
          await scroller.scrollTo(0,0);await shot('publish-'+group.id);
        }
      }
    }
    metrics.categoryImagesLoaded=rendered.size;
    check(rendered.size===418,'all 418 category illustrations load through the actual publication directory');
    await mini.evaluate(uid=>{
      const key='city_life_preferences_'+uid;
      wx.setStorageSync(key,{...wx.getStorageSync(key),largeText:true});return true;
    },uid);
    page=await go('discover');
    await (await page.$('.refine-trigger')).tap(); await pause(120);
    const largeFilter=await rects(['.filter-panel-heading','.filter-panel-footer']);
    check(largeFilter['.filter-panel-heading'].bottom<largeFilter['.filter-panel-footer'].top&&largeFilter['.filter-panel-footer'].bottom<=metrics.system.windowHeight,'large-text filtering retains a visible title, scroll area and footer');
    await shot('discover-large-text');
    page=await go('me');
    check((await page.data()).themeClass.includes('large-text'),'personal center applies the account large-text preference');
    await shot('me-large-text');
    await mini.evaluate(uid=>{
      const key='city_life_preferences_'+uid;
      wx.setStorageSync(key,{...wx.getStorageSync(key),theme:'dark',largeText:false});return true;
    },uid);
    page=await go('publish');
    await (await page.$('.industry-choice[data-id="C21"]')).trigger('tap');
    await poll(()=>page.data(),data=>data.selectedCategory==='C21','dark pet industry');
    await poll(async()=>(await page.$('.project-asset'))?.data(),data=>data?.imageReady,'dark pet image');
    check((await page.data()).themeClass.includes('theme-dark'),'pet illustrations remain usable with the chosen dark theme');
    await shot('publish-pets-dark');
    check(exceptions.length === 0, "no captured mini-program runtime exceptions");
    complete = true;
  } finally {
    try { if (session) cleanup = await session.restore(); }
    finally {
      if (mini) { await mini.reLaunch("/pages/me/index"); await mini.disconnect(); }
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      fs.writeFileSync(path.join(output,reportName), JSON.stringify({status:complete?"pass":"incomplete",passed:checks.length,checks,exceptions,cleanup,metrics,physicalDevice:false,backend:"isolated disposable PostgreSQL",checkedAt:new Date().toISOString()},null,2)+"\n");
    }
  }
  } finally {if(repo)await repo.close();await pool.end();}
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
