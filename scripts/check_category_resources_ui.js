"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const catalog = require("../miniprogram/utils/classification-contract");
const assets = require("../miniprogram/utils/category-art");
const output = path.resolve(
  __dirname,
  "../docs/design/category-resources-2026-11-15",
);
const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function poll(read, accept, label) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const value = await read();
    if (accept(value)) return value;
    await pause(120);
  }
  throw Error("Timed out " + label);
}

async function main() {
  const repo =
    require("../backend/src/memory-repository").createMemoryRepository();
  repo.trustStatus = async () => ({
    localTestOnly: true,
    phoneVerified: false,
  });
  await repo.seedRegions(["中心街道"]);
  const uid = await repo.upsertIdentity(
    "dev_local",
    "isolated-category-art-ui",
  );
  const token = "LOCAL_MEMORY_ONLY_FIXTURE_TOKEN_01234567890123456789";
  await repo.newSession(
    uid,
    crypto.createHash("sha256").update(token).digest("hex"),
    new Date(Date.now() + 3600000).toISOString(),
  );
  const server = require("../backend/src/server").createApp({
    repo,
    areas: ["中心街道"],
    allowDevLogin: true,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const checks = [],
    exceptions = [],
    rendered = new Map();
  let mini,
    session,
    cleanup,
    complete = false;
  fs.mkdirSync(output, { recursive: true });
  const check = (condition, label) => {
    assert.ok(condition, label);
    checks.push(label);
    console.log("PASS " + label);
  };
  try {
    mini = await require("./devtools_connection")();
    mini.on("exception", (error) =>
      exceptions.push(String(error.message || error.description || error)),
    );
    session = await require("./devtools_fixture_session")(mini, {
      origin: "http://127.0.0.1:" + server.address().port,
      uid,
      globalKey: "__categoryArtAudit",
      bindRuntimeOrigin: true,
    });
    const go = async (route) => {
      await mini.reLaunch(route);
      const page = await poll(
        () => mini.currentPage(),
        (page) => page?.path === route.split("?")[0].slice(1),
        route,
      );
      await poll(
        () => page.data(),
        (data) => !data.loading && !data.configLoading,
        "page content",
      );
      return page;
    };
    const screenshot = async (name) => {
      await pause(150);
      await mini.screenshot({ path: path.join(output, name) });
    };
    let page = await go("/pages/publish/index");
    const initial = await page.data();
    check(
      initial.categories.length === 27 && initial.projectCount === 418,
      "publishing keeps all 27 industries and 418 projects",
    );
    check(
      initial.memorialPublic === false,
      "the public memorial entrance stays closed",
    );
    const selectedScreens = new Set([
      "C01",
      "C02",
      "C03",
      "C04",
      "C05",
      "C15",
      "C23",
    ]);
    for (const category of initial.categories) {
      if ((await page.data()).selectedCategory !== category.id) {
        await (
          await page.$('.industry-choice[data-id="' + category.id + '"]')
        ).trigger("tap");
      }
      await poll(
        () => page.data(),
        (data) => data.selectedCategory === category.id,
        "industry " + category.id,
      );
      const definition = catalog.categories.find(
        (item) => item.id === category.id,
      );
      for (const [index, group] of definition.groups.entries()) {
        if ((await page.data()).expandedGroupId !== group.id) {
          await (
            await page.$('.project-group[data-id="' + group.id + '"]')
          ).trigger("tap");
        }
        await poll(
          () => page.data(),
          (data) => data.expandedGroupId === group.id,
          "group " + group.id,
        );
        const images = await poll(
          async () => [
            ...(await page.$$(".project-grid .project-asset")),
            ...(await page.$$(".project-grid .project-art")),
          ],
          (images) => images.length === group.items.length,
          "group artwork " + group.id,
        );
        await pause(250);
        const scroller = await page.$(".project-content");
        await scroller.scrollTo(0, 0);
        await pause(180);
        await scroller.scrollTo(0, 99999);
        await pause(180);
        const data = await poll(
          () => Promise.all(images.map((image) => image.data())),
          (data) =>
            data.every((item) => item.imageReady && item.stage !== "fallback"),
          "native image load " + group.id,
        ).catch(async (error) => {
          console.error(
            JSON.stringify(
              await Promise.all(images.map((image) => image.data())),
            ),
          );
          throw error;
        });
        for (const item of data) {
          assert.ok(group.items.some((project) => project.id === item.assetId));
          assert.equal(
            item.src,
            item.preferFallback
              ? item.fallbackSrc
              : assets.describe(item.assetId).path,
          );
          assert.equal(item.usingFallback, item.preferFallback);
          rendered.set(item.assetId, {
            id: item.assetId,
            path: item.src,
            stage: item.stage,
            nativeImageLoaded: item.imageReady,
          });
        }
        if (index === 0 && selectedScreens.has(category.id)) {
          await scroller.scrollTo(0, 0);
          await screenshot("publish-" + category.id + ".png");
        }
      }
      check(
        definition.groups.every((group) =>
          group.items.every((item) => rendered.has(item.id)),
        ),
        "native images rendered for " + category.id + " " + category.name,
      );
    }
    check(
      rendered.size === 418,
      "all 418 projects have actual native image-load callbacks",
    );
    const stages = [...rendered.values()].reduce((counts, item) => {
      counts[item.stage] = (counts[item.stage] || 0) + 1;
      return counts;
    }, {});
    check(
      stages.draft3d === 76 &&
        stages.placeholder === 337 &&
        stages.existing === 5,
      "display uses 76 drafts, 337 supplied placeholders and 5 existing housing illustrations",
    );

    await (await page.$(".publish-search-entry")).trigger("tap");
    const searchInput = await poll(
      () => page.$(".project-search-input"),
      Boolean,
      "search input",
    );
    await searchInput.input("二手手机");
    const result = await poll(
      () => page.$(".project-result-art"),
      Boolean,
      "search artwork",
    );
    await poll(
      () => result.data(),
      (data) => data.assetId === "C04G01S01" && data.imageReady,
      "search image",
    );
    check(
      (await page.data()).projects[0].id === "C04G01S01",
      "search result artwork follows its exact project ID",
    );
    await mini.callWxMethod("hideKeyboard");
    await screenshot("publish-search.png");
    const before = await result.data();
    await result.setData({
      src: "/category-art/missing-test-image.webp",
      usingFallback: false,
      imageReady: false,
    });
    await poll(
      () => result.data(),
      (data) =>
        data.usingFallback &&
        data.src === before.fallbackSrc &&
        data.imageReady,
      "missing-image fallback",
    );
    check(
      (await result.data()).src === before.fallbackSrc,
      "a real missing image falls back to the existing icon",
    );
    await screenshot("publish-image-fallback.png");
    await (await page.$(".project-result-row")).trigger("tap");
    const form = await poll(
      () => mini.currentPage(),
      (page) => page?.path === "pages/publish-form/index",
      "category form navigation",
    );
    await poll(
      () => form.data(),
      (data) => data.attributes?.categoryId === "C04G01S01",
      "selected publication category",
    );
    check(
      (await form.data()).attributes.categoryId === "C04G01S01",
      "illustrated search results still open the matching publishing form",
    );

    for (const [theme, largeText] of [
      ["prism", true],
      ["dark", false],
    ]) {
      await mini.evaluate(
        ({ uid, theme, largeText }) => {
          wx.setStorageSync("city_life_preferences_" + uid, {
            theme,
            largeText,
            reduceMotion: true,
            notificationPreview: true,
            allowContacts: true,
            revision: 1,
          });
        },
        { uid, theme, largeText },
      );
      page = await go("/pages/publish/index");
      const image = await poll(
        () => page.$(".project-asset"),
        Boolean,
        "themed image",
      );
      await poll(
        () => image.data(),
        (data) => data.imageReady && data.stage === "draft3d",
        "themed image load",
      );
      check(
        (await page.data()).displayPreferences.theme === theme,
        "artwork renders with " + theme + (largeText ? " large text" : ""),
      );
      await screenshot(
        largeText ? "publish-large-text.png" : "publish-dark.png",
      );
    }
    await mini.evaluate(
      (uid) =>
        wx.setStorageSync("city_life_preferences_" + uid, {
          theme: "prism",
          largeText: false,
          reduceMotion: true,
          revision: 1,
        }),
      uid,
    );
    page = await go("/pages/memorial/index");
    const memorialImages = await poll(
      () => page.$$(".memorial-entry-icon"),
      (images) => images.length === 3,
      "memorial images",
    );
    await poll(
      () => Promise.all(memorialImages.map((image) => image.data())),
      (data) =>
        data.every(
          (item) => item.imageReady && item.muted && !item.usingFallback,
        ),
      "gray memorial resources",
    );
    check(
      (await page.data()).themeStyle.includes("#F5F5F3"),
      "three memorial placeholders render within the scoped gray theme",
    );
    await screenshot("memorial-placeholders.png");
    check(
      exceptions.length === 0,
      "no captured mini-program runtime exceptions",
    );
    complete = true;
  } finally {
    let restoreError;
    try {
      if (session) cleanup = await session.restore();
      if (mini) await mini.reLaunch("/pages/publish/index");
    } catch (error) {
      restoreError = error.message;
    }
    if (mini) await mini.disconnect();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(
      path.join(output, "ui-result.json"),
      JSON.stringify(
        {
          status: complete && !restoreError ? "pass" : "incomplete",
          checks,
          passed: checks.length,
          rendered: [...rendered.values()],
          nativeImageCallbacks: rendered.size,
          exceptions,
          cleanup,
          restoreError,
          backend: "isolated in-memory fixture",
          physicalDevice: false,
          checkedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    if (restoreError) throw Error(restoreError);
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
