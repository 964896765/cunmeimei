"use strict";
const path = require("node:path");
const crypto = require("node:crypto");
const policy = require("./memorial-policy");
const files = require("./private-license");

async function memorialRoutes({
  req,
  res,
  p,
  m,
  url,
  repo,
  user,
  admin,
  body,
  json,
  enabled,
  privateUploadDir,
}) {
  if (!p.startsWith("/api/v1/memorial") && !p.startsWith("/admin/api/memorial"))
    return false;
  if (!repo.memorialSave)
    policy.fail(
      "MEMORIAL_DATABASE_REQUIRED",
      "纪念馆模块需要持久化数据库",
      503,
    );
  const send = (status, data) => {
    json(res, status, data);
    return true;
  };
  const publicAccess = () => {
    if (!enabled) policy.fail("MEMORIAL_NOT_OPEN", "悼念专区尚在内部验收", 404);
  };
  const offset = () => {
    const value = Number(url.searchParams.get("page") || 1);
    if (!Number.isSafeInteger(value) || value < 1 || value > 500)
      policy.fail("MEMORIAL_PAGE_INVALID", "页码无效");
    return (value - 1) * 20;
  };
  let match;
  if (p === "/api/v1/memorial/policy" && m === "GET")
    return send(200, policy.document());
  if (p === "/api/v1/memorial/halls" && m === "GET") {
    publicAccess();
    const q = (url.searchParams.get("q") || "").trim();
    if (q.length > 80) policy.fail("MEMORIAL_QUERY_INVALID", "关键词过长");
    return send(200, await repo.memorialSearch(q, offset()));
  }
  if (p === "/api/v1/memorial/me/halls" && m === "GET") {
    const rows = await repo.memorialOwnList(await user(req), offset());
    return send(200, { items: rows.slice(0, 20), hasMore: rows.length > 20 });
  }
  if (p === "/api/v1/memorial/me/reports" && m === "GET")
    return send(200, { items: await repo.memorialOwnReports(await user(req)) });
  if (p === "/api/v1/memorial/halls" && m === "POST")
    return send(201, {
      hall: await repo.memorialSave(await user(req), null, await body(req)),
    });
  if (
    (match = /^\/api\/v1\/memorial\/me\/halls\/([0-9a-f-]{36})$/i.exec(p)) &&
    m === "GET"
  ) {
    const hall = await repo.memorialOwn(await user(req), match[1]);
    if (!hall) policy.fail("MEMORIAL_NOT_FOUND", "纪念馆不存在或无权管理", 404);
    return send(200, { hall });
  }
  if ((match = /^\/api\/v1\/memorial\/halls\/([0-9a-f-]{36})$/i.exec(p))) {
    if (m === "PUT")
      return send(200, {
        hall: await repo.memorialSave(
          await user(req),
          match[1],
          await body(req),
        ),
      });
    if (m === "GET") {
      publicAccess();
      const hall = await repo.memorialPublic(match[1]);
      if (!hall) policy.fail("MEMORIAL_NOT_FOUND", "该纪念馆暂未公开", 404);
      return send(200, { hall });
    }
  }
  if (
    (match =
      /^\/api\/v1\/memorial\/halls\/([0-9a-f-]{36})\/(authorization|submit|action|tributes|reports|proofs|portrait)$/i.exec(
        p,
      ))
  ) {
    const [full, id, action] = match;
    if (action === "portrait" && m === "GET") {
      publicAccess();
      const image = await repo.memorialPortrait(id);
      if (!image) policy.fail("MEMORIAL_NOT_FOUND", "纪念照片暂不可读取", 404);
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(image.data);
      return true;
    }
    if (m === "POST") {
      if (["tributes", "reports"].includes(action)) publicAccess();
      const uid = await user(req);
      if (action === "proofs") {
        if (!(await repo.memorialProofPermission(uid, id)))
          policy.fail("MEMORIAL_NOT_FOUND", "无权提交该纪念馆材料", 404);
        const upload = await files.readUpload(req),
          fileId = crypto.randomUUID(),
          base = path.join(privateUploadDir, "memorial");
        await files.writePrivate(base, fileId, upload.bytes);
        try {
          return send(
            201,
            await repo.memorialStoreProof(uid, id, {
              id: fileId,
              contentType: upload.contentType,
              hash: crypto
                .createHash("sha256")
                .update(upload.bytes)
                .digest("hex"),
              size: upload.bytes.length,
            }),
          );
        } catch (error) {
          await files.unlinkPrivate(base, fileId);
          throw error;
        }
      }
      const input = await body(req);
      const handlers = {
        authorization: () => repo.memorialAuthorize(uid, id, input),
        submit: async () => ({
          hall: await repo.memorialSubmit(uid, id, input),
        }),
        action: async () => ({
          hall: await repo.memorialOwnerAction(uid, id, input),
        }),
        tributes: () => repo.memorialTribute(uid, id, input),
        reports: () => repo.memorialReport(uid, id, input),
      };
      if (handlers[action]) return send(200, await handlers[action]());
    }
  }
  if (
    (match = /^\/api\/v1\/memorial\/me\/proofs\/([0-9a-f-]{36})$/i.exec(p)) &&
    m === "GET"
  ) {
    const file = await repo.memorialProof(match[1], await user(req));
    if (!file) policy.fail("MEMORIAL_NOT_FOUND", "材料不存在或无权读取", 404);
    const bytes = await files.readPrivate(
      path.join(privateUploadDir, "memorial"),
      file.id,
    );
    res.writeHead(200, {
      "Content-Type": file.content_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(bytes);
    return true;
  }
  if (p === "/admin/api/memorial/queue" && m === "GET") {
    const session = admin(req),
      qualification = url.searchParams.get("scope") === "authorization";
    require("./admin-permissions").requirePermission(
      session,
      qualification ? "qualification" : "operations",
    );
    return send(200, await repo.memorialAdminQueue(qualification, offset()));
  }
  if (
    (match =
      /^\/admin\/api\/memorial\/(halls|authorizations|proofs|reports)\/([0-9a-f-]{36})$/i.exec(
        p,
      ))
  ) {
    const [full, kind, id] = match,
      session = admin(req, m === "POST");
    if (kind === "proofs" && m === "GET") {
      const file = await repo.memorialProof(id);
      if (!file) policy.fail("MEMORIAL_NOT_FOUND", "核验材料不存在", 404);
      const bytes = await files.readPrivate(
        path.join(privateUploadDir, "memorial"),
        id,
      );
      res.writeHead(200, {
        "Content-Type": file.content_type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      });
      res.end(bytes);
      return true;
    }
    if (m === "GET" && ["halls", "authorizations"].includes(kind)) {
      const item = await (kind === "halls"
        ? repo.memorialAdminHall(id)
        : repo.memorialAdminAuthorization(id));
      if (!item) policy.fail("MEMORIAL_NOT_FOUND", "记录不存在", 404);
      return send(200, { item });
    }
    if (m === "POST") {
      const input = await body(req),
        handlers = {
          halls: () => repo.memorialReview(id, input, session.role),
          authorizations: () =>
            repo.memorialReviewAuthorization(id, input, session.role),
          reports: () => repo.memorialResolveReport(id, input, session.role),
        };
      if (handlers[kind]) return send(200, await handlers[kind]());
    }
  }
  policy.fail("MEMORIAL_ROUTE_UNAVAILABLE", "此纪念馆功能暂未开放", 404);
}
module.exports = { memorialRoutes };
