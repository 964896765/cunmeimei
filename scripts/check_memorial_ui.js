"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { Pool } = require("../backend/node_modules/pg");
const output = path.resolve(
  __dirname,
  "../docs/remediation/memorial-2026-11-14",
);
const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function poll(read, accept, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await read();
    if (accept(value)) return value;
    await pause(150);
  }
  throw Error("Timed out " + label);
}

async function main() {
  const dsn = process.env.PG_TEST_DATABASE_URL;
  require("../backend/src/test-database-guard").assertIsolatedDatabase(dsn);
  const control = new Pool({ connectionString: dsn });
  const schema = "memorial_ui_" + crypto.randomBytes(6).toString("hex");
  const privateRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "citylife-memorial-ui-"),
  );
  const checks = [],
    exceptions = [];
  let pool,
    repo,
    server,
    closedServer,
    mini,
    session,
    browser,
    cleanup,
    complete = false;
  fs.mkdirSync(output, { recursive: true });
  const check = (condition, label) => {
    assert.ok(condition, label);
    checks.push(label);
    console.log("PASS " + label);
  };
  try {
    await control.query('CREATE SCHEMA "' + schema + '"');
    const options = "-c search_path=" + schema;
    pool = new Pool({ connectionString: dsn, options });
    await require("../backend/src/schema-migrations").applyMigrations(pool);
    repo = require("../backend/src/pg-repository").createPgRepository(dsn, {
      options,
    });
    await repo.seedRegions(["中心街道"]);
    const uid = await repo.upsertIdentity(
      "dev_local",
      "memorial-ui-isolated-owner",
    );
    const token = "LOCAL_MEMORY_ONLY_FIXTURE_TOKEN_01234567890123456789";
    await repo.newSession(
      uid,
      crypto.createHash("sha256").update(token).digest("hex"),
      new Date(Date.now() + 3600000).toISOString(),
    );
    const config = {
      repo,
      areas: ["中心街道"],
      allowDevLogin: true,
      privateUploadDir: privateRoot,
      adminPassword: "isolated-memorial-ui-operator",
      verificationAdminPassword: "isolated-memorial-ui-verifier",
    };
    server = require("../backend/src/server").createApp({
      ...config,
      memorialPublicEnabled: true,
    });
    closedServer = require("../backend/src/server").createApp(config);
    for (const instance of [server, closedServer])
      await new Promise((resolve) => instance.listen(0, "127.0.0.1", resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    const closedOrigin = "http://127.0.0.1:" + closedServer.address().port;
    mini = await require("./devtools_connection")();
    mini.on("exception", (error) =>
      exceptions.push(String(error.message || error.description || error)),
    );
    const bind = async (target) => {
      session = await require("./devtools_fixture_session")(mini, {
        origin: target,
        uid,
        globalKey: "__memorialAudit",
        bindRuntimeOrigin: true,
      });
    };
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
        "settled " + route,
      );
      await pause(500);
      return page;
    };
    const capture = async (filename) => {
      await pause(200);
      await mini.screenshot({ path: path.join(output, filename) });
    };
    await bind(closedOrigin);
    let page = await go("/pages/publish/index");
    check(
      (await page.data()).memorialPublic === false,
      "default-off configuration keeps public memorial browsing disabled",
    );
    check(
      (await page.$$(".memorial-access")).length === 0,
      "the memorial entry is absent outside funeral services",
    );
    await (await page.$('.industry-sidebar')).scrollTo(0, 99999);
    await (await page.$('#industry-C23')).trigger('tap');
    check(
      !!(await page.$('.project-content .memorial-access')),
      "funeral services show the memorial entry while public browsing is closed",
    );
    await capture("publish-default-off.png");
    await (await page.$(".memorial-access")).trigger("tap");
    page = await poll(() => mini.currentPage(), p => p?.path === "pages/memorial/index", "closed memorial portal");
    await poll(() => page.data(), data => !data.loading && !data.publicEnabled, "public memorial browsing stays closed");
    check(!!await page.$(".memorial-status"), "closed portal explains its availability");
    cleanup = await session.restore();
    session = null;
    check(
      cleanup.authStorageUnchanged,
      "default-off fixture restores the original login storage",
    );
    await bind(origin);
    page = await go("/pages/publish/index");
    const publishing = await page.data();
    check(
      publishing.categories.length === 27 && publishing.projectCount === 418,
      "all existing industries and projects remain intact",
    );
    check(
      publishing.categories.slice(-4).map(item=>item.id).join(',') === "C08,C09,C10,C23",
      "sidebar ends with local information, transport, cars and funeral services",
    );
    await (await page.$('.industry-sidebar')).scrollTo(0, 99999);
    await (await page.$('#industry-C23')).trigger('tap');
    await capture('publish-memorial-entry.png');
    await (await page.$(".memorial-access")).trigger("tap");
    page = await poll(
      () => mini.currentPage(),
      (page) => page?.path === "pages/memorial/index",
      "memorial portal",
    );
    await poll(
      () => page.data(),
      (data) => !data.loading && data.publicEnabled,
      "portal configuration",
    );
    check(
      (await page.$$(".memorial-entry")).length === 4,
      "portal has management, public search, memories and creation entrances",
    );
    check(
      (await page.data()).themeStyle.includes("#F5F5F3"),
      "memorial portal has its scoped gray-white palette",
    );
    const header = await page.$("#navigation-header");
    const headerData = await header.data();
    check(
      headerData.statusHeight > 0 &&
        headerData.headerHeight > headerData.statusHeight,
      "shared header reserves the status bar and native capsule area",
    );
    await capture("memorial-portal.png");
    await (await page.$(".memorial-create-entry")).trigger("tap");
    page = await poll(
      () => mini.currentPage(),
      (page) => page?.query?.mode === "create",
      "creation page",
    );
    await poll(
      () => page.data(),
      (data) => data.mode === "form" && !data.loading,
      "creation form",
    );
    check(
      !(await page.data()).agreed && !(await page.data()).publicRequested,
      "creation starts with unchecked consent and private visibility",
    );
    await capture("memorial-create.png");
    for (const [key, value] of Object.entries({
      name: "隔离验收纪念馆",
      biography:
        "本页仅用于微信开发者工具与隔离数据库验收。所有姓名及生平内容均为测试夹具。",
      memories: "仅验证追思文字保存与审核，未使用真实逝者资料。",
    })) {
      await (
        await page.$('[data-key="' + key + '"]')
      ).trigger("input", { value });
    }
    for (const [key, value] of Object.entries({
      birthDate: "1950-01-01",
      deathDate: "2020-01-01",
    })) {
      await (
        await page.$('[data-key="' + key + '"]')
      ).trigger("change", { value });
    }
    await (await page.$("#memorial-save")).trigger("tap");
    let data = await poll(
      () => page.data(),
      (data) => !!data.hall && !data.loading && !data.busy,
      "saved draft",
    );
    check(
      data.hall.payload.name === "隔离验收纪念馆",
      "actual form save persists the draft through the HTTP route",
    );
    check(
      data.hall.payload.birthDate === "1950-01-01",
      "historical birth date is preserved",
    );
    const id = data.hall.id;
    const proofBytes = await require("../backend/node_modules/sharp")({
      create: { width: 48, height: 48, channels: 3, background: "#ddddda" },
    })
      .jpeg()
      .toBuffer();
    const upload = await fetch(
      origin + "/api/v1/memorial/halls/" + id + "/proofs",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "image/jpeg",
        },
        body: proofBytes,
      },
    );
    assert.equal(upload.status, 201);
    const proof = await upload.json();
    // File selection is represented by a labeled fixture. The private upload endpoint is real.
    await page.setData({ proofId: proof.id, proofReady: true });
    for (const [key, value] of Object.entries({
      relationship: "隔离测试授权身份",
      statement: "本材料为隔离核验夹具，仅测试权限分离及审核操作。",
    })) {
      await (
        await page.$('[data-key="' + key + '"]')
      ).trigger("input", { value });
    }
    await (await page.$("#memorial-authorize")).trigger("tap");
    data = await poll(
      () => page.data(),
      (data) =>
        data.hall?.authorization?.status === "pending" &&
        !data.busy &&
        !data.loading,
      "authorization submitted",
    );
    check(
      data.hall.authorization.current === true,
      "authorization is bound to the saved subject",
    );
    await mini.callWxMethod("pageScrollTo", { scrollTop: 1400, duration: 0 });
    await capture("memorial-authorization.png");
    await (await page.$("switch")).trigger("change", { value: true });
    await (
      await page.$("checkbox-group")
    ).trigger("change", { value: ["agree"] });
    await (await page.$("#memorial-submit")).trigger("tap");
    data = await poll(
      () => page.data(),
      (data) =>
        data.hall?.status === "pending_review" && !data.busy && !data.loading,
      "submitted content",
    );
    check(
      data.hall.requested_public === true,
      "actual submit stores the selected public scope",
    );
    page = await go('/pages/legal/index?kind=memorial');
    check((await page.data()).themeStyle.includes('#F5F5F3'), 'memorial policy reader uses the scoped neutral theme');
    await capture('memorial-policy.png');

    browser = await require("./headless_browser")();
    const login = async (role, password) => {
      await browser.navigate(origin + "/admin");
      await poll(
        () => browser.evaluate('!!document.querySelector("#login-form") && typeof loadMemorialConsole === "function"'),
        Boolean,
        "admin form",
      );
      await browser.evaluate(
        'document.querySelector("#admin-role").value=' +
          JSON.stringify(role) +
          ';document.querySelector("#password").value=' +
          JSON.stringify(password) +
          ';document.querySelector("#login-form").requestSubmit();true',
      );
      await poll(
        () => browser.evaluate('!document.querySelector("#dashboard").hidden'),
        Boolean,
        "admin login",
      );
      await browser.evaluate(
        'document.querySelector("#memorial-console").open=true;loadMemorialConsole();true',
      );
    };
    await login("verifier", config.verificationAdminPassword);
    await poll(
      () =>
        browser.evaluate(
          'document.querySelector("#memorial-console-body").textContent.includes("隔离验收纪念馆")',
        ),
      Boolean,
      "verifier queue",
    );
    await browser.evaluate(
      'document.querySelector("#memorial-console-body button").click();true',
    );
    await poll(
      () =>
        browser.evaluate(
          '!!document.querySelector("#memorial-console-body textarea")',
        ),
      Boolean,
      "authorization detail",
    );
    await browser.evaluate(
      'document.querySelector("#memorial-console").scrollIntoView();true',
    );
    await browser.screenshot(path.join(output, "admin-authorization.png"));
    check(
      await browser.evaluate(
        '!!document.querySelector("#memorial-console-body a[href*=proofs]")',
      ),
      "verifier console has the protected evidence reader",
    );
    await browser.evaluate(
      'const panel=document.querySelector("#memorial-console-body");panel.querySelector("textarea").value="隔离实际核验夹具资料与对应授权范围";panel.querySelector("input[type=checkbox]").checked=true;Array.from(panel.querySelectorAll("button")).find(button=>button.textContent==="记录核验通过").click();true',
    );
    await poll(
      () => repo.memorialOwn(uid, id),
      (hall) => hall.authorization.status === "verified",
      "independent authorization approved",
    );
    await browser.evaluate('document.querySelector("#logout").click();true');
    await poll(
      () => browser.evaluate('!document.querySelector("#login").hidden'),
      Boolean,
      "logout",
    );
    await login("operator", config.adminPassword);
    await poll(
      () =>
        browser.evaluate(
          'document.querySelector("#memorial-console-body").textContent.includes("隔离验收纪念馆")',
        ),
      Boolean,
      "operator queue",
    );
    await browser.evaluate(
      'document.querySelector("#memorial-console-body button").click();true',
    );
    await poll(
      () =>
        browser.evaluate(
          '!!document.querySelector("#memorial-console-body textarea")',
        ),
      Boolean,
      "content review form",
    );
    check(
      await browser.evaluate(
        '!document.querySelector("#memorial-console-body a[href*=proofs]")',
      ),
      "operator content form excludes private authorization evidence",
    );
    await browser.evaluate(
      'document.querySelector("#memorial-console").scrollIntoView();true',
    );
    await browser.screenshot(path.join(output, "admin-content-review.png"));
    await browser.evaluate(
      'const panel=document.querySelector("#memorial-console-body");panel.querySelector("textarea").value="隔离文字资料与照片使用范围均已核对";for(const input of panel.querySelectorAll("input[type=checkbox]"))input.checked=true;Array.from(panel.querySelectorAll("button")).find(button=>button.textContent==="审核通过").click();true',
    );
    await poll(() => repo.memorialPublic(id), Boolean, "content approved");

    page = await go("/pages/memorial/index?id=" + id);
    check(
      (await page.data()).mode === "detail",
      "approved hall opens through the public detail route",
    );
    await capture("memorial-detail.png");
    await (await page.$('[data-kind="flower"]')).trigger("tap");
    await poll(
      () => page.data(),
      (data) => !!data.tributeFeedback && !data.busy,
      "flower receipt",
    );
    check(
      (
        await pool.query(
          "SELECT count(*)::int n FROM memorial_tributes WHERE hall_id=$1",
          [id],
        )
      ).rows[0].n === 1,
      "actual free flower action persists a tribute",
    );
    page = await go("/pages/memorial/index?mode=manage");
    check(
      (await page.data()).items.some(
        (item) => item.id === id && item.status === "published",
      ),
      "owner management shows the reviewed hall",
    );
    await capture("memorial-manage.png");
    page = await go(
      "/pages/search/index?q=" + encodeURIComponent("隔离验收纪念馆"),
    );
    await poll(
      () => page.data(),
      (data) => data.memorials?.some((item) => item.id === id),
      "unified search result",
    );
    await capture("memorial-search.png");
    page = await go("/pages/publish/index");
    check(
      !(await page.data()).themeStyle.includes("#F5F5F3"),
      "leaving the memorial restores the existing publishing palette",
    );
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
    if (browser) await browser.close();
    for (const instance of [server, closedServer])
      if (instance) {
        instance.closeAllConnections();
        await new Promise((resolve) => instance.close(resolve));
      }
    if (repo) await repo.close();
    if (pool) await pool.end();
    await control.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await control.end();
    assert.equal(path.dirname(privateRoot), path.resolve(os.tmpdir()));
    assert.match(path.basename(privateRoot), /^citylife-memorial-ui-/);
    fs.rmSync(privateRoot, { recursive: true, force: true });
    fs.writeFileSync(
      path.join(output, "ui-result.json"),
      JSON.stringify(
        {
          status: complete && !restoreError ? "pass" : "incomplete",
          checks,
          passed: checks.length,
          exceptions,
          cleanup,
          restoreError,
          physicalDevice: false,
          isolatedPostgres: true,
          evidence:
            "explicit synthetic fixture through actual private upload endpoint; native image selection not exercised",
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
