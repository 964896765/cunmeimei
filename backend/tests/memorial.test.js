"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const policy = require("../src/memorial-policy");

test("memorial module preserves the existing catalogs and gives only its own pages a neutral palette", () => {
  const catalog = require("../../miniprogram/utils/classification-contract");
  assert.equal(catalog.categories.length, 27);
  assert.equal(catalog.projects.length, 418);
  const app = require("../../miniprogram/app.json");
  assert.equal(app.pages.length, 28);
  assert.equal(app.pages.at(-1), "pages/memorial/index");
  assert.equal(
    require("../../miniprogram/pages/memorial/index.json").usingComponents[
      "page-header"
    ],
    "/components/page-header/index",
  );
  const oldRoutes = JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        "../../docs/remediation/reference-system-2026-11-13/inventory/routes.json",
      ),
      "utf8",
    ),
  ).routes;
  for (const route of oldRoutes)
    assert.ok(app.pages.includes(route.route || route.path || route));
  const regular = require("../../miniprogram/utils/palettes").resolvePalette(
    "prism",
    "pages/publish/index",
  );
  const neutral = require("../../miniprogram/utils/memorial-theme").palette(
    "prism",
  );
  assert.notEqual(regular.action, neutral.action);
  assert.equal(neutral.background, "#F5F5F3");
  assert.equal(
    require("../../miniprogram/utils/palettes").resolvePalette(
      "prism",
      "pages/publish/index",
    ).action,
    regular.action,
  );
});

test("memorial payloads and consent reject unsafe public information and preserve draft support", () => {
  assert.doesNotThrow(() => policy.payload({}, true));
  for (const input of [
    {
      name: "隔离资料",
      biography: "只用于格式测试的完整生平说明",
      birthDate: "2026-02-30",
    },
    {
      name: "隔离资料",
      biography: "只用于格式测试的完整生平说明",
      birthDate: "2000-01-01",
      deathDate: "1999-01-01",
    },
    { name: "隔离资料", biography: "公开号码13800000001不应进入公开生平" },
  ])
    assert.throws(() => policy.payload(input));
  assert.throws(() =>
    policy.consent({
      accepted: false,
      version: policy.noticeVersion,
      publicRequested: true,
    }),
  );
  assert.throws(() =>
    policy.consent({ accepted: true, version: "old", publicRequested: true }),
  );
  assert.equal(policy.blessings.length, 3);
});

test(
  "PostgreSQL memorial lifecycle, private evidence, public gates, tributes and reports",
  {
    skip:
      !process.env.PG_TEST_DATABASE_URL &&
      "PG_TEST_DATABASE_URL not configured",
  },
  async (t) => {
    const dsn = process.env.PG_TEST_DATABASE_URL;
    require("../src/test-database-guard").assertIsolatedDatabase(dsn);
    const { Pool } = require("pg"),
      control = new Pool({ connectionString: dsn });
    const schema = "memorial_it_" + crypto.randomBytes(6).toString("hex");
    const privateRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "citylife-memorial-proof-"),
    );
    let pool, repo, openServer, closedServer;
    try {
      await control.query('CREATE SCHEMA "' + schema + '"');
      const options = "-c search_path=" + schema;
      pool = new Pool({ connectionString: dsn, options });
      await require("../src/schema-migrations").applyMigrations(pool);
      repo = require("../src/pg-repository").createPgRepository(dsn, {
        options,
      });
      await repo.seedRegions(["中心街道"]);
      const config = {
        repo,
        areas: ["中心街道"],
        allowDevLogin: true,
        privateUploadDir: privateRoot,
        adminPassword: "isolated-memorial-operator",
        verificationAdminPassword: "isolated-memorial-verifier",
      };
      openServer = require("../src/server").createApp({
        ...config,
        memorialPublicEnabled: true,
      });
      closedServer = require("../src/server").createApp(config);
      for (const server of [openServer, closedServer])
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      async function request(
        route,
        method = "GET",
        body,
        auth = {},
        closed = false,
      ) {
        const origin =
          "http://127.0.0.1:" +
          (closed ? closedServer : openServer).address().port;
        const binary = Buffer.isBuffer(body);
        const response = await fetch(origin + route, {
          method,
          headers: {
            "Content-Type": binary ? "image/jpeg" : "application/json",
            ...(auth.token ? { Authorization: "Bearer " + auth.token } : {}),
            ...(auth.cookie
              ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrf }
              : {}),
          },
          body:
            body === undefined
              ? undefined
              : binary
                ? body
                : JSON.stringify(body),
        });
        return {
          status: response.status,
          data: response.headers
            .get("content-type")
            ?.includes("application/json")
            ? await response.json()
            : Buffer.from(await response.arrayBuffer()),
          cache: response.headers.get("cache-control"),
          cookie: response.headers.get("set-cookie")?.split(";")[0],
        };
      }
      const owner = (
          await request("/api/v1/dev/login", "POST", {
            devUser: "memorial-fixture-owner",
          })
        ).data,
        visitor = (
          await request("/api/v1/dev/login", "POST", {
            devUser: "memorial-fixture-visitor",
          })
        ).data;
      const login = async (role, password) => {
        const result = await request("/admin/api/login", "POST", {
          role,
          password,
        });
        return { cookie: result.cookie, csrf: result.data.csrf };
      };
      const operator = await login("operator", "isolated-memorial-operator"),
        verifier = await login("verifier", "isolated-memorial-verifier");
      const bytes = await require("sharp")({
        create: { width: 40, height: 40, channels: 3, background: "#ddddda" },
      })
        .jpeg()
        .toBuffer();
      const portrait = await repo.uploadContentImage(owner.userId, bytes);
      const payload = {
        name: "隔离回归纪念馆",
        birthDate: "1950-01-01",
        deathDate: "2020-01-01",
        biography:
          "本条仅用于隔离纪念馆回归验收，所有资料均为明确标记的测试夹具。",
        memories: "仅验证保存与审核，不代表真实逝者资料。",
        portraitImageId: portrait.id,
      };
      const key = "memorial_fixture_" + crypto.randomBytes(12).toString("hex");
      let hall, authorization, proof;
      const readOwn = async () => {
        const result = await request(
          "/api/v1/memorial/me/halls/" + hall.id,
          "GET",
          undefined,
          owner,
        );
        assert.equal(result.status, 200);
        hall = result.data.hall;
        return hall;
      };
      const publicRoute = () => "/api/v1/memorial/halls/" + hall.id;
      const review = async () => {
        await readOwn();
        const result = await request(
          "/admin/api/memorial/halls/" + hall.id,
          "POST",
          {
            status: "published",
            revision: hall.revision,
            response: "隔离实际核查内容与授权范围",
            textReviewed: true,
            portraitReviewed: true,
            rightsReviewed: true,
          },
          operator,
        );
        assert.equal(result.status, 200, JSON.stringify(result.data));
        await readOwn();
      };
      await t.test(
        "default public entry, search, portraits and interactions remain closed",
        async () => {
          assert.equal(
            (await request("/api/v1/config", "GET", undefined, {}, true)).data
              .features.memorialPublic,
            false,
          );
          assert.equal(
            (
              await request(
                "/api/v1/memorial/halls",
                "GET",
                undefined,
                {},
                true,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request("/api/v1/memorial/halls", "POST", {
                clientKey: key,
                payload,
              })
            ).status,
            401,
          );
        },
      );
      await t.test(
        "draft creation is idempotent, owner-scoped and independent of ordinary publications",
        async () => {
          const results = await Promise.all(
            [1, 2].map(() =>
              request(
                "/api/v1/memorial/halls",
                "POST",
                { clientKey: key, payload },
                owner,
              ),
            ),
          );
          assert.ok(
            results.every((result) => result.status === 201),
            JSON.stringify(results),
          );
          hall = results[0].data.hall;
          assert.equal(results[1].data.hall.id, hall.id);
          assert.equal(
            (
              await request(
                "/api/v1/memorial/me/halls/" + hall.id,
                "GET",
                undefined,
                visitor,
              )
            ).status,
            404,
          );
          assert.equal((await request(publicRoute())).status, 404);
          assert.equal((await request("/api/v1/items/" + hall.id)).status, 404);
          assert.equal(
            (await pool.query("SELECT count(*)::int n FROM publications"))
              .rows[0].n,
            0,
          );
          assert.equal(
            (
              await request(
                "/api/v1/memorial/halls",
                "POST",
                {
                  clientKey: key,
                  payload: { ...payload, name: "不同的隔离资料" },
                },
                owner,
              )
            ).status,
            409,
          );
        },
      );
      await t.test(
        "portrait reservation protects raw media and cross-publishing before and after approval",
        async () => {
          assert.equal(
            (await request("/api/v1/media/" + portrait.id)).status,
            404,
          );
          assert.equal(
            (
              await request(
                "/api/v1/media/" + portrait.id,
                "GET",
                undefined,
                owner,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await request(
                "/api/v1/media/" + portrait.id,
                "GET",
                undefined,
                visitor,
              )
            ).status,
            404,
          );
          await assert.rejects(
            pool.query(
              "INSERT INTO publications(user_id,type,title,description,district,image_ids) VALUES($1,'used','隔离混用照片测试','纪念照片不应由普通信息公开','中心街道',$2)",
              [owner.userId, [portrait.id]],
            ),
            (error) => error.message === "MEMORIAL_PORTRAIT_RESERVED",
          );
          assert.equal(
            await repo.deleteContentImage(owner.userId, portrait.id),
            false,
          );
        },
      );
      await t.test(
        "evidence uses private storage with independent owner and verifier access",
        async () => {
          assert.equal(
            (await request(publicRoute() + "/proofs", "POST", bytes, visitor))
              .status,
            404,
          );
          const upload = await request(
            publicRoute() + "/proofs",
            "POST",
            bytes,
            owner,
          );
          assert.equal(upload.status, 201);
          proof = upload.data;
          assert.equal(
            (await request("/api/v1/memorial/me/proofs/" + proof.id)).status,
            401,
          );
          assert.equal(
            (
              await request(
                "/api/v1/memorial/me/proofs/" + proof.id,
                "GET",
                undefined,
                visitor,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request(
                "/api/v1/memorial/me/proofs/" + proof.id,
                "GET",
                undefined,
                owner,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await request(
                "/admin/api/memorial/proofs/" + proof.id,
                "GET",
                undefined,
                operator,
              )
            ).status,
            403,
          );
          const privateRead = await request(
            "/admin/api/memorial/proofs/" + proof.id,
            "GET",
            undefined,
            verifier,
          );
          assert.equal(privateRead.status, 200);
          assert.ok(privateRead.cache.includes("no-store"));
          assert.equal(
            (await request("/api/v1/media/" + proof.id)).status,
            404,
          );
          const response = await request(
            publicRoute() + "/authorization",
            "POST",
            {
              revision: hall.revision,
              relationship: "隔离家属关系夹具",
              statement:
                "PRIVATE_AUTHORIZATION_ONLY 此说明仅用于独立授权核验测试",
              proofId: proof.id,
            },
            owner,
          );
          assert.equal(response.status, 200);
          authorization = response.data;
          await readOwn();
        },
      );
      await t.test(
        "publishing requires consent, independent authorization and fresh content checks",
        async () => {
          const submit = {
            revision: hall.revision,
            consent: {
              accepted: true,
              version: policy.noticeVersion,
              publicRequested: true,
            },
          };
          assert.equal(
            (
              await request(
                publicRoute() + "/submit",
                "POST",
                { ...submit, consent: { ...submit.consent, accepted: false } },
                owner,
              )
            ).status,
            400,
          );
          assert.equal(
            (await request(publicRoute() + "/submit", "POST", submit, owner))
              .status,
            200,
          );
          await readOwn();
          const approval = {
            status: "published",
            revision: hall.revision,
            response: "隔离审核确认当前内容与公开范围",
            textReviewed: true,
            portraitReviewed: true,
            rightsReviewed: true,
          };
          assert.equal(
            (
              await request(
                "/admin/api/memorial/halls/" + hall.id,
                "POST",
                approval,
                operator,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request(
                "/admin/api/memorial/authorizations/" + authorization.id,
                "POST",
                {
                  status: "verified",
                  revision: 1,
                  response: "隔离授权范围已实际核查",
                  manuallyVerified: true,
                },
                operator,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request(
                "/admin/api/memorial/authorizations/" + authorization.id,
                "POST",
                {
                  status: "verified",
                  revision: 1,
                  response: "隔离授权范围已实际核查",
                  manuallyVerified: true,
                },
                { cookie: verifier.cookie, csrf: "wrong" },
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request(
                "/admin/api/memorial/authorizations/" + authorization.id,
                "POST",
                {
                  status: "verified",
                  revision: 1,
                  response: "隔离授权范围已实际核查",
                  manuallyVerified: true,
                },
                verifier,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await request(
                "/admin/api/memorial/halls/" + hall.id,
                "POST",
                { ...approval, rightsReviewed: false },
                operator,
              )
            ).status,
            400,
          );
          await review();
        },
      );
      await t.test(
        "public projections and unified search expose only approved and permitted content",
        async () => {
          const visible = await request(publicRoute());
          assert.equal(visible.status, 200);
          const rendered = JSON.stringify(visible.data);
          for (const secret of [
            "PRIVATE_AUTHORIZATION_ONLY",
            owner.userId,
            proof.id,
            "owner_id",
            "authorization",
          ])
            assert.ok(!rendered.includes(secret));
          const feed = await request(
            "/api/v1/feed?q=" + encodeURIComponent("隔离回归纪念馆"),
          );
          assert.ok(feed.data.memorials.some((item) => item.id === hall.id));
          assert.equal(feed.data.items.length, 0);
          assert.equal(
            (
              await request(
                "/api/v1/feed?categoryId=C23&q=" +
                  encodeURIComponent("隔离回归纪念馆"),
              )
            ).data.memorials,
            undefined,
          );
          assert.equal(
            (
              await request(
                "/api/v1/feed?channel=service&q=" +
                  encodeURIComponent("隔离回归纪念馆"),
              )
            ).data.memorials,
            undefined,
          );
          assert.equal(
            (await request(publicRoute(), "GET", undefined, {}, true)).status,
            404,
          );
          assert.equal(
            (
              await request(
                publicRoute() + "/portrait",
                "GET",
                undefined,
                {},
                true,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request(
                "/api/v1/feed?q=" + encodeURIComponent("隔离回归纪念馆"),
                "GET",
                undefined,
                {},
                true,
              )
            ).data.memorials,
            undefined,
          );
          assert.equal(
            (await request(publicRoute() + "/portrait")).status,
            200,
          );
          assert.equal(
            (await request("/api/v1/media/" + portrait.id)).status,
            404,
          );
        },
      );
      await t.test(
        "free tributes are authenticated and idempotent, with fixed blessings and closed social/payment routes",
        async () => {
          assert.equal(
            (
              await request(publicRoute() + "/tributes", "POST", {
                kind: "flower",
              })
            ).status,
            401,
          );
          const results = await Promise.all(
            [1, 2, 3].map(() =>
              request(
                publicRoute() + "/tributes",
                "POST",
                { kind: "flower" },
                visitor,
              ),
            ),
          );
          assert.ok(results.every((result) => result.status === 200));
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int n FROM memorial_tributes WHERE hall_id=$1 AND kind='flower'",
                [hall.id],
              )
            ).rows[0].n,
            1,
          );
          assert.equal(
            (
              await request(
                publicRoute() + "/tributes",
                "POST",
                { kind: "candle" },
                visitor,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await request(
                publicRoute() + "/tributes",
                "POST",
                { kind: "blessing", blessingCode: "remember" },
                visitor,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await request(
                publicRoute() + "/tributes",
                "POST",
                { kind: "blessing", blessingCode: "free_comment" },
                visitor,
              )
            ).status,
            400,
          );
          for (const route of [
            "comments",
            "messages",
            "payments",
            "tips",
            "rankings",
          ])
            assert.equal(
              (
                await request(
                  publicRoute() + "/" + route,
                  "POST",
                  { body: "关闭功能验证" },
                  visitor,
                )
              ).status,
              404,
            );
        },
      );
      await t.test(
        "hiding revokes search, portrait and public detail access immediately",
        async () => {
          const result = await request(
            publicRoute() + "/action",
            "POST",
            { action: "hide", revision: hall.revision },
            owner,
          );
          assert.equal(result.status, 200);
          hall = result.data.hall;
          for (const suffix of ["", "/portrait"])
            assert.equal((await request(publicRoute() + suffix)).status, 404);
          assert.equal(
            (
              await request(
                "/api/v1/feed?q=" + encodeURIComponent("隔离回归纪念馆"),
              )
            ).data.memorials.length,
            0,
          );
          assert.equal(
            (
              await request(
                publicRoute() + "/tributes",
                "POST",
                { kind: "flower" },
                visitor,
              )
            ).status,
            404,
          );
        },
      );
      await t.test(
        "identity edits invalidate prior authorization, while ordinary edits return to draft and preserve ownership",
        async () => {
          assert.equal(
            (
              await request(
                publicRoute(),
                "PUT",
                {
                  clientKey: key,
                  revision: hall.revision,
                  payload: { ...payload, name: "隔离资料变更纪念馆" },
                },
                visitor,
              )
            ).status,
            404,
          );
          const changed = await request(
            publicRoute(),
            "PUT",
            {
              clientKey: key,
              revision: hall.revision,
              payload: { ...payload, name: "隔离资料变更纪念馆" },
            },
            owner,
          );
          assert.equal(changed.status, 200);
          hall = changed.data.hall;
          assert.equal(
            (
              await request(
                publicRoute() + "/submit",
                "POST",
                {
                  revision: hall.revision,
                  consent: {
                    accepted: true,
                    version: policy.noticeVersion,
                    publicRequested: true,
                  },
                },
                owner,
              )
            ).data.error,
            "MEMORIAL_AUTHORIZATION_REQUIRED",
          );
          const restore = await request(
            publicRoute(),
            "PUT",
            { clientKey: key, revision: hall.revision, payload },
            owner,
          );
          assert.equal(restore.status, 200);
          hall = restore.data.hall;
          assert.equal(
            (
              await request(
                publicRoute() + "/submit",
                "POST",
                {
                  revision: hall.revision,
                  consent: {
                    accepted: true,
                    version: policy.noticeVersion,
                    publicRequested: true,
                  },
                },
                owner,
              )
            ).status,
            200,
          );
          await review();
        },
      );
      await t.test(
        "private scope, authorization revocation and stale revisions prevent public access",
        async () => {
          const consent = {
            accepted: true,
            version: policy.noticeVersion,
            publicRequested: false,
          };
          const stale = hall.revision;
          assert.equal(
            (
              await request(
                publicRoute() + "/submit",
                "POST",
                { revision: hall.revision, consent },
                owner,
              )
            ).status,
            200,
          );
          await review();
          assert.equal((await request(publicRoute())).status, 404);
          assert.equal(
            (await request(publicRoute() + "/portrait")).status,
            404,
          );
          assert.equal(
            (
              await request(
                "/api/v1/feed?q=" + encodeURIComponent(payload.name),
              )
            ).data.memorials.length,
            0,
          );
          assert.equal(
            (
              await request(
                publicRoute(),
                "PUT",
                {
                  clientKey: key,
                  revision: stale,
                  payload: {
                    ...payload,
                    memories: "隔离旧版本不能覆盖新版本的内容",
                  },
                },
                owner,
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await request(
                publicRoute() + "/submit",
                "POST",
                {
                  revision: hall.revision,
                  consent: { ...consent, publicRequested: true },
                },
                owner,
              )
            ).status,
            200,
          );
          await review();
          const queue = await request(
            "/admin/api/memorial/queue?scope=authorization",
            "GET",
            undefined,
            verifier,
          );
          assert.ok(
            queue.data.authorizations.some(
              (row) => row.id === authorization.id && row.status === "verified",
            ),
          );
          const route =
            "/admin/api/memorial/authorizations/" + authorization.id;
          assert.equal(
            (
              await request(
                route,
                "POST",
                {
                  revision: 2,
                  status: "revoked",
                  response: "隔离测试核验授权撤回，必须停止公开",
                },
                verifier,
              )
            ).status,
            200,
          );
          assert.equal((await request(publicRoute())).status, 404);
          assert.equal(
            (await request(publicRoute() + "/portrait")).status,
            404,
          );
          await readOwn();
          assert.equal(
            (
              await request(
                publicRoute() + "/submit",
                "POST",
                { revision: hall.revision, consent },
                owner,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await request(
                route,
                "POST",
                {
                  revision: 3,
                  status: "verified",
                  manuallyVerified: true,
                  response: "隔离再次核实有效授权后重新提交审核",
                },
                verifier,
              )
            ).status,
            200,
          );
          assert.equal((await request(publicRoute())).status, 404);
          assert.equal(
            (
              await request(
                publicRoute() + "/submit",
                "POST",
                {
                  revision: hall.revision,
                  consent: { ...consent, publicRequested: true },
                },
                owner,
              )
            ).status,
            200,
          );
          await review();
          const exported = await repo.exportOwnData(
            owner.userId,
            "memorial_halls",
          );
          assert.ok(exported.items.some((row) => row.id === hall.id));
          assert.equal(
            (await repo.exportOwnData(visitor.userId, "memorial_halls")).items
              .length,
            0,
          );
        },
      );
      await t.test(
        "reports, owner deletion and private handling records complete without public evidence exposure",
        async () => {
          const report = await request(
            publicRoute() + "/reports",
            "POST",
            { kind: "rights", reason: "隔离近亲属权利核查请求，仅用于回归" },
            visitor,
          );
          assert.equal(report.status, 200);
          const privateReports = await request(
            "/api/v1/memorial/me/reports",
            "GET",
            undefined,
            visitor,
          );
          assert.equal(privateReports.data.items.length, 1);
          assert.equal(
            (
              await request(
                "/api/v1/memorial/me/reports",
                "GET",
                undefined,
                owner,
              )
            ).data.items.length,
            0,
          );
          const resolution = await request(
            "/admin/api/memorial/reports/" + report.data.id,
            "POST",
            {
              revision: 1,
              status: "resolved",
              response: "隔离核查完成，公开资料已隐藏",
              hide: true,
            },
            operator,
          );
          assert.equal(resolution.status, 200);
          await readOwn();
          assert.equal((await request(publicRoute())).status, 404);
          assert.equal(
            (
              await request(
                "/api/v1/memorial/me/reports",
                "GET",
                undefined,
                visitor,
              )
            ).data.items[0].status,
            "resolved",
          );
          await request(
            publicRoute() + "/submit",
            "POST",
            {
              revision: hall.revision,
              consent: {
                accepted: true,
                version: policy.noticeVersion,
                publicRequested: true,
              },
            },
            owner,
          );
          await review();
          const pendingReport = await request(
            publicRoute() + "/reports",
            "POST",
            {
              kind: "privacy",
              reason: "隔离测试删除后仍应处理已提交的隐私请求",
            },
            visitor,
          );
          const deleted = await request(
            publicRoute() + "/action",
            "POST",
            { revision: hall.revision, action: "delete" },
            owner,
          );
          assert.equal(deleted.status, 200);
          hall = deleted.data.hall;
          assert.equal(hall.status, "deleted");
          assert.deepEqual(hall.payload, {});
          assert.equal(
            (
              await request(
                "/admin/api/memorial/reports/" + pendingReport.data.id,
                "POST",
                {
                  revision: 1,
                  status: "resolved",
                  response: "资料已由创建人删除，核查处理记录仍留存",
                  hide: true,
                },
                operator,
              )
            ).status,
            200,
          );
          await readOwn();
          assert.equal(hall.status, "deleted");
          assert.equal((await request(publicRoute())).status, 404);
          assert.equal(
            (
              await request(
                publicRoute(),
                "PUT",
                { clientKey: key, revision: hall.revision, payload },
                owner,
              )
            ).status,
            404,
          );
          assert.ok(
            (
              await pool.query(
                "SELECT count(*)::int n FROM memorial_audit WHERE hall_id=$1",
                [hall.id],
              )
            ).rows[0].n >= 8,
          );
        },
      );
      await t.test(
        "account closure revokes an approved hall and its portrait with the existing closure workflow",
        async () => {
          const closurePortrait = await repo.uploadContentImage(
            owner.userId,
            bytes,
          );
          hall = await repo.memorialSave(owner.userId, null, {
            clientKey: "closure_" + crypto.randomBytes(12).toString("hex"),
            payload: { ...payload, portraitImageId: closurePortrait.id },
          });
          const uploaded = await request(
            publicRoute() + "/proofs",
            "POST",
            bytes,
            owner,
          );
          const authorization = await repo.memorialAuthorize(
            owner.userId,
            hall.id,
            {
              revision: hall.revision,
              relationship: "隔离关系夹具",
              statement: "仅用于验证注销后纪念馆自动停止公开",
              proofId: uploaded.data.id,
            },
          );
          await repo.memorialReviewAuthorization(
            authorization.id,
            {
              revision: 1,
              status: "verified",
              manuallyVerified: true,
              response: "隔离验证授权核验及注销访问控制",
            },
            "verifier",
          );
          await readOwn();
          await repo.memorialSubmit(owner.userId, hall.id, {
            revision: hall.revision,
            consent: {
              accepted: true,
              version: policy.noticeVersion,
              publicRequested: true,
            },
          });
          await review();
          assert.equal((await request(publicRoute())).status, 200);
          assert.equal(
            (await request(publicRoute() + "/portrait")).status,
            200,
          );
          const closure = await repo.createPrivacyRequest(
            owner.userId,
            "closure",
            "本人申请注销隔离账号并确认必要记录保留",
            require("../src/account-lifecycle").CLOSURE_CONSENT,
          );
          await repo.executeAccountClosure(
            closure.id,
            {
              revision: 1,
              confirmed: true,
              reason: "隔离测试已核对本人注销意愿及处理范围",
            },
            "operator",
          );
          assert.equal((await request(publicRoute())).status, 404);
          assert.equal(
            (
              await request(
                "/api/v1/feed?q=" + encodeURIComponent(payload.name),
              )
            ).data.memorials.length,
            0,
          );
          assert.equal(
            (
              await request(
                "/api/v1/memorial/me/halls",
                "GET",
                undefined,
                owner,
              )
            ).status,
            401,
          );
          assert.equal(
            (await request(publicRoute() + "/portrait")).status,
            404,
          );
        },
      );
    } finally {
      for (const server of [openServer, closedServer])
        if (server) {
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        }
      if (repo) await repo.close();
      if (pool) await pool.end();
      await control.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      await control.end();
      const resolved = path.resolve(privateRoot);
      assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
      assert.match(path.basename(resolved), /^citylife-memorial-proof-/);
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  },
);
