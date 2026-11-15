"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const output = path.resolve(__dirname, "../docs/design/main-scroll-2026-11-15");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function poll(read, accept, label) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const value = await read();
    if (accept(value)) return value;
    await pause(120);
  }
  throw Error("Timed out " + label);
}

async function bounds(mini) {
  return mini.evaluate(() => new Promise((resolve) => {
    const selectors = [".publish-root", ".publish-page", ".publish-hero", ".publish-toolbar", ".publish-search-row", ".project-browser", ".industry-sidebar", ".project-content", ".project-results-scroll"];
    const query = wx.createSelectorQuery();
    selectors.forEach((selector) => query.select(selector).boundingClientRect());
    query.exec((rects) => {
      const result = Object.fromEntries(selectors.map((selector, index) => [selector, rects[index]]));
      const bar = getCurrentPages().slice(-1)[0].getTabBar();
      bar.createSelectorQuery().select(".curved-tabs").boundingClientRect((rect) => resolve({ ...result, tabs: rect })).exec();
    });
  }));
}

async function main() {
  const repo = require("../backend/src/memory-repository").createMemoryRepository();
  repo.trustStatus = async () => ({ localTestOnly: true, phoneVerified: false });
  await repo.seedRegions(["中心街道"]);
  const uid = await repo.upsertIdentity("dev_local", "isolated-publish-layout");
  const token = "LOCAL_MEMORY_ONLY_FIXTURE_TOKEN_01234567890123456789";
  await repo.newSession(uid, crypto.createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 3600000).toISOString());
  const server = require("../backend/src/server").createApp({ repo, areas: ["中心街道"], allowDevLogin: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  fs.mkdirSync(output, { recursive: true });
  let mini, session, cleanup;
  const checks = [], exceptions = [], metrics = {};
  const check = (condition, label) => {
    assert.ok(condition, label);
    checks.push(label);
    console.log("PASS " + label);
  };
  let complete = false;
  try {
    mini = await require("./devtools_connection")(process.env.SCROLL_QA_WS);
    await mini.reLaunch("/pages/publish/index");
    await pause(1200);
    mini.on("exception", (error) => exceptions.push(String(error.message || error)));
    session = await require("./devtools_fixture_session")(mini, {
      origin: "http://127.0.0.1:" + server.address().port,
      uid,
      globalKey: "__publishLayoutAudit",
      bindRuntimeOrigin: true,
    });
    await mini.reLaunch("/pages/publish/index");
    let page = await poll(() => mini.currentPage(), (value) => value?.path === "pages/publish/index", "publish route");
    await poll(() => page.data(), (data) => data.configReady && !data.configLoading, "publication configuration");
    await poll(async () => (await page.$(".project-asset"))?.data(), (data) => data?.imageReady, "category illustration");
    await pause(200);
    if (process.argv.includes("--baseline")) {
      const baseline = { commit: "3c5d8c5", system: await mini.systemInfo(), pages: {}, physicalDevice: false };
      for (const name of ["home", "discover", "publish", "messages", "me"]) {
        await mini.reLaunch("/pages/" + name + "/index");
        const current = await mini.currentPage();
        await poll(() => current.data(), (data) => !data.loading && !data.configLoading && !data.summaryLoading, "baseline " + name);
        await pause(500);
        await mini.screenshot({path:path.join(output,"before-"+name+".png")});
        baseline.pages[name] = name === "publish" ? await bounds(mini) : { route: current.path };
      }
      baseline.checkedAt = new Date().toISOString();
      fs.writeFileSync(path.join(output,"before-metrics.json"),JSON.stringify(baseline,null,2)+"\n");
      console.log("Captured five original page screenshots");
      complete = true;
      return;
    }
    const go = async (name, query = "") => {
      await mini.reLaunch("/pages/" + name + "/index" + query);
      const current = await poll(() => mini.currentPage(), (value) => value?.path === "pages/" + name + "/index", name + " route");
      await poll(() => current.data(), (data) => !data.loading && !data.configLoading && !data.summaryLoading, name + " loading");
      await pause(250);
      return current;
    };
    const shot = async (name) => {
      await pause(200);
      await mini.screenshot({ path: path.join(output, name + ".png") });
    };
    const rectangles = (selectors) => mini.evaluate((selectors) => new Promise((resolve) => {
      const query = wx.createSelectorQuery();
      selectors.forEach((selector) => query.select(selector).boundingClientRect());
      query.exec((rects) => resolve(Object.fromEntries(selectors.map((selector, index) => [selector, rects[index]]))));
    }), selectors);
    const swipe = async (selector, up) => {
      const element = await page.$(selector);
      const point = (y) => ({ identifier: 1, pageX: 200, clientX: 200, pageY: y, clientY: y });
      await element.touchstart({ touches: [point(400)] });
      await element.touchmove({ touches: [point(up ? 340 : 460)] });
      await element.touchend({ touches: [], changedTouches: [point(up ? 340 : 460)] });
    };
    for (const name of ["home", "discover", "publish", "messages", "me"]) {
      page = await go(name);
      await shot("after-" + name);
      check((await page.data()).layoutStyle.includes("--page-viewport:"), name + " uses measured viewport and safe areas");
    }

    page = await go("publish");
    check((await page.data()).heroCollapsed === false, "first entry shows the publication hero");
    check(!(await page.$(".selected-industry")), "the repeated right-column industry heading is removed");
    metrics.publishExpanded = await bounds(mini);
    await swipe(".project-column", true);
    await poll(() => page.data(), (data) => data.heroCollapsed, "hero collapse");
    await pause(200);
    metrics.publishCollapsed = await bounds(mini);
    check(metrics.publishCollapsed[".project-browser"].height > metrics.publishExpanded[".project-browser"].height + 70, "collapsing the hero releases more than 70px to both columns");
    check(metrics.publishCollapsed[".project-browser"].bottom <= metrics.publishCollapsed.tabs.top, "publication content clears the fixed bottom tabs");
    check(metrics.publishCollapsed[".publish-search-row"].top >= metrics.publishCollapsed[".publish-page"].top, "the pinned search row clears the native header");
    await shot("publish-collapsed");
    const sidebar = await page.$(".industry-sidebar");
    const right = await page.$(".project-content");
    await sidebar.scrollTo(0, 180);
    await pause(150);
    check(Number(await right.property("scrollTop")) < 2, "left-column scrolling preserves the right-column position");
    const leftTop = Number(await sidebar.property("scrollTop"));
    await right.scrollTo(0, 160);
    await pause(150);
    check(Math.abs(Number(await sidebar.property("scrollTop")) - leftTop) < 2, "right-column scrolling preserves the left-column position");
    await right.scrollTo(0, 0);
    await swipe(".project-column", false);
    await poll(() => page.data(), (data) => !data.heroCollapsed, "hero restoration");
    await shot("publish-restored");
    check(!((await page.data()).heroCollapsed), "downward swiping at the active column top restores the hero");
    const beforeMenu = await bounds(mini);
    await (await page.$(".publish-tools-toggle")).trigger("tap");
    const menu = await poll(() => page.$(".publish-tools"), Boolean, "tool dropdown");
    const actions = await menu.$$(".drafts-button");
    const positions = await Promise.all(actions.map((action) => action.offset()));
    check(actions.length === 4 && positions.every((position, index) => !index || position.top > positions[index - 1].top), "all four shortcuts are arranged vertically in the dropdown");
    check(Math.abs((await bounds(mini))[".project-browser"].height - beforeMenu[".project-browser"].height) < 1, "the dropdown consumes no category viewport height");
    await shot("publish-dropdown");
    await (await page.$(".publish-tools-backdrop")).trigger("tap");
    await poll(() => page.data(), (data) => !data.toolsOpen, "outside menu dismissal");
    check(!(await page.data()).toolsOpen, "tapping outside dismisses the dropdown");
    await (await page.$(".publish-search-entry")).trigger("tap");
    const input = await poll(() => page.$(".project-search-input"), Boolean, "category search input");
    await input.input("二手手机");
    await poll(() => page.data(), (data) => data.projects[0]?.id === "C04G01S01" && data.searchHasQuery, "category search result");
    check(!!(await page.$(".publish-tools-toggle")), "the shortcut button remains available beside expanded search");
    await mini.evaluate(() => { wx.hideKeyboard({}); return true; });
    await shot("publish-search");
    await (await page.$(".project-search-cancel")).trigger("tap");
    await poll(() => page.data(), (data) => !data.projectSearchOpen, "search cancellation");
    check(!(await page.data()).heroCollapsed, "canceling search restores the prior hero state");
    await swipe(".project-column", true);

    const catalog = require("../miniprogram/utils/classification-contract");
    const rendered = new Set();
    for (const category of (await page.data()).categories) {
      if ((await page.data()).selectedCategory !== category.id)
        await (await page.$('.industry-choice[data-id="' + category.id + '"]')).trigger("tap");
      await poll(() => page.data(), (data) => data.selectedCategory === category.id, "industry selection");
      for (const group of catalog.categories.find((item) => item.id === category.id).groups) {
        if ((await page.data()).expandedGroupId !== group.id)
          await (await page.$('.project-group[data-id="' + group.id + '"]')).trigger("tap");
        await poll(() => page.data(), (data) => data.expandedGroupId === group.id, "group expansion");
        const scroller = await page.$(".project-content");
        await scroller.scrollTo(0, 0);
        await pause(100);
        await scroller.scrollTo(0, 99999);
        await pause(100);
        const items = await poll(async () => {
          const images = [...await page.$$(".project-asset"), ...await page.$$(".project-art")];
          return Promise.all(images.map((image) => image.data()));
        }, (items) => items.length === group.items.length && items.every((item) => item.imageReady && group.items.some((project) => project.id === item.assetId)), "visible category illustrations");
        items.forEach((item) => rendered.add(item.assetId));
      }
      check(catalog.categories.find((item) => item.id === category.id).groups.every((group) => group.items.every((item) => rendered.has(item.id))), "browse all groups in " + category.id);
    }
    metrics.categoryCallbacks = rendered.size;
    check(rendered.size === 418, "all 418 classification illustrations remain reachable and load successfully");
    const cards = Array.from({ length: 10 }, (_, index) => ({ id: "layout-fixture-" + index, kind: "listing", type: "used", category: "仅布局验收", title: "仅布局验收 · 本地信息 " + (index + 1), description: "隔离运行时布局记录，未写入业务数据库。", images: [], district: "布局验收区域", favoriteKnown: true }));
    page = await go("home");
    await page.setData({ featured: cards, feed: cards, error: "", loading: false });
    await mini.pageScrollTo(4);
    await shot("home-scroll-before-pin");
    await mini.pageScrollTo(20);
    await poll(() => page.data(), (data) => data.pageCompact, "home header handover");
    await shot("home-scroll-header-handover");
    await mini.pageScrollTo(1000);
    await poll(() => page.data(), (data) => data.pageCompact, "compact home search");
    await pause(200);
    metrics.homePinned = await rectangles([".home-search-row", ".feed-tabs"]);
    const header = await page.$("#navigation-header");
    const headerData = await header.data();
    check(metrics.homePinned[".home-search-row"].bottom <= metrics.homePinned[".feed-tabs"].top + 2, "the two home sticky rows do not overlap");
    check(Math.abs(metrics.homePinned[".feed-tabs"].top - headerData.headerHeight) < 2, "home feed tabs pin directly below the compact city search row");
    const capsule = await mini.evaluate(() => wx.getMenuButtonBoundingClientRect());
    check(metrics.homePinned[".home-search-row"].right <= capsule.left, "compact city search clears the native capsule horizontally");
    await shot("fixture-home-sticky");
    await (await page.$('.feed-tab[data-id="latest"]')).trigger("tap");
    await poll(() => page.data(), (data) => data.feedTab === "latest" && !data.loading, "home feed switching");
    check((await page.data()).pageCompact, "switching to an empty feed retains the compact browsing state");
    await mini.pageScrollTo(0);
    await poll(() => page.data(), (data) => !data.pageCompact, "home brand restoration");
    check(!(await page.data()).pageCompact, "home restores its brand and full search at the top");

    page = await go("discover");
    await page.setData({ filtered: cards, loading: false, error: "", hasMore: false });
    await mini.pageScrollTo(800);
    await poll(() => page.data(), (data) => data.pageCompact, "compact discovery toolbar");
    await pause(200);
    metrics.discoverPinned = await rectangles([".discover-sticky", ".discover-controls", ".discover-floats"]);
    check(metrics.discoverPinned[".discover-sticky"].top >= (await page.data()).headerHeight - 2, "discovery channels clear the fixed title");
    check((await page.data()).immersed === false, "discovery scrolling keeps bottom navigation and floating actions available");
    await shot("fixture-discover-sticky");
    const channel = await page.$("#business-channels");
    for (const item of (await channel.data()).channels) {
      console.log("Checking discovery channel " + item.id);
      await (await channel.$('.channel-tab[data-type="' + item.id + '"]')).tap();
      await poll(() => page.data(), (data) => data.type === item.id && !data.loading, "discovery channel " + item.id);
    }
    await (await page.$(".refine-trigger")).trigger("tap");
    await poll(() => page.data(), (data) => data.filterOpen, "full discovery filters");
    check((await page.data()).panelFilters.length > 0 && (await page.data()).quickFilters.length > 0, "the full filter panel retains channel-specific controls");
    await shot("discover-filters");
    await (await (await page.$("#channel-filter-sheet")).$(".sheet-scrim")).trigger("tap");
    await poll(() => page.data(), (data) => !data.filterOpen, "filter panel dismissal");

    page = await go("messages");
    const contacts = Array.from({ length: 24 }, (_, index) => ({ id: "layout-contact-" + index, title: "仅布局验收 · 会话 " + (index + 1), message: "隔离运行时会话记录", avatarInitial: "验", dateText: "布局验收", statusText: "已结束", status: "accepted", endedAt: "2026-11-15" }));
    await page.setData({ contacts, visibleContacts: contacts, visibleNotices: contacts.map((item) => ({ id:item.id, title:item.title, body:item.message, dateText:item.dateText, readAt:"2026-11-15" })), hasSession: true, loading: false, error: "" });
    const toolbarBefore = await rectangles([".message-toolbar"]);
    await (await page.$(".message-list-scroll")).scrollTo(0, 500);
    await pause(150);
    check(Math.abs((await rectangles([".message-toolbar"]))[".message-toolbar"].top - toolbarBefore[".message-toolbar"].top) < 1, "message tabs and search stay fixed while conversations scroll");
    await shot("fixture-messages-scroll");
    await (await page.$('.message-tab[data-tab="notices"]')).tap();
    await poll(() => page.data(), (data) => data.tab === "notices", "notification tab");
    await pause(200);
    check(Number(await (await page.$(".message-list-scroll")).property("scrollTop")) < 2, "notifications start at their independent scroll position");
    await (await page.$('.message-tab[data-tab="contacts"]')).tap();
    await poll(() => page.data(), (data) => data.tab === "contacts", "conversation tab");
    await pause(200);
    check(Number(await (await page.$(".message-list-scroll")).property("scrollTop")) > 400, "returning to conversations restores their scroll position");
    page = await go("me");
    await mini.pageScrollTo(300);
    await shot("me-scrolled");
    check((await page.data()).pageCompact, "the personal profile supports compact scrolling");

    page = await go("chat", "?id=layout-fixture");
    await page.setData({ error: "", chat: { title: "仅布局验收 · 会话对象", canSend: true, publicationStatus: "published" }, messages: Array.from({ length: 25 }, (_, index) => ({ id: "layout-message-" + index, body: "仅布局验收消息 " + index, mine: index % 2 === 0 })) });
    const chatBefore = await rectangles([".chat-context", ".chat-compose"]);
    await (await page.$(".chat-history-scroll")).scrollTo(0, 800);
    const chatAfter = await rectangles([".chat-context", ".chat-compose"]);
    check(Math.abs(chatBefore[".chat-context"].top - chatAfter[".chat-context"].top) < 1 && Math.abs(chatBefore[".chat-compose"].top - chatAfter[".chat-compose"].top) < 1, "chat fixes the conversation context and composer around independently scrolling history");
    await shot("fixture-chat-scroll");
    const chatLayoutStyle = await page.data("layoutStyle");
    await page.setData({ layoutStyle: chatLayoutStyle.replace(/--page-viewport:[0-9.]+px/, "--page-viewport:544px").replace(/--page-safe-bottom:[0-9.]+px/, "--page-safe-bottom:0px") });
    await pause(150);
    check((await rectangles([".chat-compose"]))[".chat-compose"].bottom <= 544, "the keyboard-size fixture keeps the chat composer above the keyboard");
    await shot("fixture-chat-keyboard");
    await page.setData({ layoutStyle: chatLayoutStyle });
    metrics.keyboardSimulation = true;
    for (const [index, destination] of ["legal", "drafts", "me", "modal"].entries()) {
      page = await go("publish");
      await (await page.$(".publish-tools-toggle")).trigger("tap");
      const shortcutMenu = await poll(() => page.$(".publish-tools"), Boolean, "shortcut menu");
      const shortcutItems = await poll(() => shortcutMenu.$$(".drafts-button"), (items) => items?.length === 4, "four shortcut entries");
      await pause(200);
      console.log("Checking shortcut " + destination);
      await shortcutItems[index].tap();
      if (destination === "modal") {
        await poll(() => mini.evaluate(() => getApp().globalData.__publishLayoutAudit.modalCount), (count) => count > 0, "publication help modal");
      } else {
        const target = await poll(() => mini.currentPage(), (current) => current?.path === "pages/" + destination + "/index", "shortcut " + destination);
        await poll(() => target.data(), (data) => !data.loading && !data.summaryLoading, "shortcut content " + destination);
        await pause(200);
        const targetHeader = await target.$("#navigation-header");
        await (await targetHeader.$(".nav-back")).tap();
        if (destination === "me") await mini.callWxMethod("switchTab", {url:"/pages/publish/index"});
        await poll(() => mini.currentPage(), (current) => current?.path === "pages/publish/index", "shortcut return");
      }
      check(true, "shortcut opens " + destination);
    }
    for (const name of ["home", "discover", "publish", "messages", "me"]) {
      const route = "pages/" + name + "/index";
      await mini.callWxMethod("switchTab", { url: "/" + route });
      await poll(() => mini.currentPage(), (current) => current?.path === route, "bottom tab " + name);
      check(true, "fixed bottom tab opens " + name);
    }
    await mini.evaluate((uid) => wx.setStorageSync("city_life_preferences_" + uid, { theme: "prism", largeText: true, reduceMotion: true, notificationPreview: true, allowContacts: true, revision: 1 }), uid);
    page = await go("publish");
    await swipe(".project-column", true);
    await poll(() => page.data(), (data) => data.heroCollapsed, "large-text hero collapse");
    await shot("publish-large-text");
    const large = await bounds(mini);
    check(large[".project-browser"].height > 400 && large[".project-browser"].bottom <= large.tabs.top, "large-text publishing retains a usable independent scrolling region");
    page = await go("discover");
    await mini.pageScrollTo(1000);
    await shot("discover-large-text");
    page = await go("home");
    await page.setData({ featured: cards, feed: cards, loading: false, error: "" });
    for (let attempt = 0; attempt < 3; attempt++) {
      await mini.pageScrollTo(1000);
      await poll(() => page.data(), (data) => data.pageCompact, "large-text compact home");
      await mini.pageScrollTo(0);
      await poll(() => page.data(), (data) => !data.pageCompact, "large-text restored home");
    }
    await mini.pageScrollTo(1000);
    await poll(() => page.data(), (data) => data.pageCompact, "large-text sticky home");
    const homeLarge = await rectangles([".home-search-row", ".feed-tabs"]);
    check(homeLarge[".home-search-row"].bottom <= homeLarge[".feed-tabs"].top + 2, "large-text home preserves two sticky layers through repeated reverse scrolling");
    await shot("fixture-home-large-text");
    check(exceptions.length === 0, "no captured mini-program runtime exceptions");
    complete = true;
  } catch (error) {
    console.error(error.stack);
    throw error;
  } finally {
    try {
      if (session) cleanup = await session.restore();
      if (mini) await mini.reLaunch("/pages/publish/index");
    } finally {
      if (mini) await mini.disconnect();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (!process.argv.includes("--baseline"))
      fs.writeFileSync(path.join(output, "ui-result.json"), JSON.stringify({ status: complete ? "pass" : "incomplete", checks, passed: checks.length, metrics, exceptions, cleanup, backend: "isolated in-memory fixture", physicalDevice: false, checkedAt: new Date().toISOString() }, null, 2) + "\n");
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
