"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const sharp = require("../backend/node_modules/sharp");
const catalog = require("../miniprogram/utils/classification-contract");
const assets = require("../miniprogram/utils/category-art");
const output = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../docs/design/category-fusion-2026-11-15");
const assetsOnly = process.argv.includes("--assets-only");
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
      await mini.evaluate((url) => {
        setTimeout(() => wx.reLaunch({ url }), 100);
        return true;
      }, route);
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
    const system = await mini.systemInfo();
    const reviewPanels = new Map();
    const captureGroup = async (page, group) => {
      const scroller = await page.$(".project-content");
      await scroller.scrollTo(0, 0);
      await pause(100);
      const grid = await page.$(".project-grid");
      const offset = await scroller.offset();
      const size = await scroller.size();
      const gridOffset = await grid.offset();
      const gridSize = await grid.size();
      const start = Math.max(0, gridOffset.top - offset.top);
      const positions = [start];
      if (gridSize.height > size.height)
        positions.push(start + gridSize.height - size.height);
      for (const [index, position] of positions.entries()) {
        await scroller.scrollTo(0, position);
        await pause(120);
        const bytes = Buffer.from(await mini.screenshot(), "base64");
        const { width } = await sharp(bytes).metadata();
        const scale = width / system.windowWidth;
        const panel = await sharp(bytes)
          .extract({
            left: Math.ceil(offset.left * scale),
            top: Math.ceil(offset.top * scale),
            width: Math.floor(size.width * scale),
            height: Math.floor(size.height * scale),
          })
          .resize(300, 500, { fit: "contain", background: "#ffffff" })
          .png()
          .toBuffer();
        const industry = group.id.slice(0, 3);
        if (!reviewPanels.has(industry)) reviewPanels.set(industry, []);
        reviewPanels.get(industry).push({
          input: panel,
          label: group.id + (index ? " bottom" : " top"),
        });
      }
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
      const funeral = category.id === "C23";
      if (funeral) check((await page.$$(".project-group.is-expanded")).length === 3, "three funeral groups open on entry");
      const toggle = async (id) => (await page.$('.project-group[data-id="' + id + '"]')).trigger("tap");
      for (const [index, group] of definition.groups.entries()) {
        if (funeral) {
          const collapsed = (await page.data()).collapsedFuneralGroups;
          for (const { id } of definition.groups) {
            if (!!collapsed[id] === (id === group.id)) {
              await toggle(id);
              await poll(() => page.data(), (data) => !!data.collapsedFuneralGroups[id] === (id !== group.id), "toggle " + id);
            }
          }
        } else if ((await page.data()).expandedGroupId !== group.id) {
          await toggle(group.id);
        }
        await poll(
          () => page.data(),
          (data) => funeral ? !data.collapsedFuneralGroups[group.id] : data.expandedGroupId === group.id,
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
              : assets.describe(item.assetId).displayPath,
          );
          assert.equal(item.usingFallback, item.preferFallback);
          assert.equal(
            item.frame,
            item.preferFallback ? "plain" : (assets.describe(item.assetId).displayFrame || assets.describe(item.assetId).frame),
          );
          assert.equal(item.blendMatte, true);
          rendered.set(item.assetId, {
            id: item.assetId,
            path: item.src,
            stage: item.stage,
            frame: item.frame,
            nativeImageLoaded: item.imageReady,
          });
        }
        if (!assetsOnly) await captureGroup(page, group);
        if (!assetsOnly && index === 0) {
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
    for (const [industry, panels] of reviewPanels) {
      const rows = Math.ceil(panels.length / 3);
      const composites = [];
      for (const [index, panel] of panels.entries()) {
        const left = (index % 3) * 308;
        const top = Math.floor(index / 3) * 536;
        composites.push({ input: panel.input, left, top: top + 28 });
        composites.push({
          input: Buffer.from(
            '<svg width="300" height="28"><text x="8" y="20" font-size="18" font-family="sans-serif" fill="#242329">' +
              panel.label +
              "</text></svg>",
          ),
          left,
          top,
        });
      }
      await sharp({
        create: {
          width: 924,
          height: rows * 536,
          channels: 3,
          background: "#ffffff",
        },
      })
        .composite(composites)
        .jpeg({ quality: 88 })
        .toFile(path.join(output, "review-" + industry + ".jpg"));
    }
    if (!assetsOnly) {
      check(reviewPanels.size === 27, "captured complete group review sheets for all 27 industries");
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
      stages.supplied3d === 239 && stages.rendered3d === 179,
      "display uses all 239 supplied illustrations and 179 existing rendered scenes",
    );
    if (assetsOnly) {
      check(exceptions.length === 0, "no captured mini-program runtime exceptions");
      complete = true;
      return;
    }

    await (await page.$(".publish-search-entry")).trigger("tap");
    const typeQuery = async (query) => {
      const input = await poll(
        () => page.$(".project-search-input"),
        Boolean,
        "search input",
      );
      await input.input(query);
      await poll(
        () => page.data(),
        (data) => data.projectQuery === query,
        "search query " + query,
      );
      await pause(180);
    };
    for (const query of ["川湘菜", "日常保洁", "医院"]) {
      const frame = "transparent";
      await typeQuery(query);
      const image = await poll(
        () => page.$(".project-result-art"),
        Boolean,
        "search " + query,
      );
      await poll(
        () => image.data(),
        (data) => data.imageReady && data.frame === frame,
        "search frame " + query,
      );
      await mini.callWxMethod("hideKeyboard");
      await screenshot("search-" + query + ".png");
      check(
        (await image.data()).frame === frame,
        "search uses the matching " + frame + " framing",
      );
    }
    await typeQuery("二手手机");
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
        (data) => data.imageReady && data.stage === "supplied3d",
        "themed image load",
      );
      check(
        (await page.data()).displayPreferences.theme === theme,
        "artwork renders with " + theme + (largeText ? " large text" : ""),
      );
      await screenshot(
        largeText ? "publish-large-text.png" : "publish-dark.png",
      );
      for (const category of ["C01", "C03", "C15", "C23"]) {
        await (
          await page.$('.industry-choice[data-id="' + category + '"]')
        ).trigger("tap");
        await poll(
          () => page.data(),
          (data) => data.selectedCategory === category,
          "themed category " + category,
        );
        if (category === "C23") {
          await (await page.$(".funeral-banner")).trigger("tap");
          await (await page.$('.project-group[data-id="C23G01"]')).trigger("tap");
        }
        await pause(180);
        const images = await poll(
          () => page.$$(".project-asset"),
          (images) => images.length > 0,
          "themed category artwork",
        );
        const scroller = await page.$(".project-content");
        const viewport = await scroller.size();
        const scrollHeight = await scroller.scrollHeight();
        for (let top = 0; top < scrollHeight; top += viewport.height * 0.8) {
          await scroller.scrollTo(0, top);
          await pause(120);
        }
        const themedData = await poll(
          () => Promise.all(images.map((image) => image.data())),
          (data) => data.every((item) => item.imageReady && item.dark === (theme === "dark")),
          "themed source framing",
        );
        await scroller.scrollTo(0, 0);
        await screenshot(
          "publish-" + (largeText ? "large" : "dark") + "-" + category + ".png",
        );
        check(
          themedData.every((item) => item.imageReady && item.dark === (theme === "dark")),
          "source artwork renders in " + theme + " for " + category,
        );
      }
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
    await poll(
      () => page.$(".memorial-intro-art"),
      Boolean,
      "gray memorial banner",
    );
    check(
      (await page.data()).themeStyle.includes("#F5F5F3"),
      "memorial banner renders within the scoped gray theme",
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
      if (mini) await mini.evaluate(() => {
        setTimeout(() => wx.switchTab({ url: "/pages/publish/index" }), 100);
        return true;
      });
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
