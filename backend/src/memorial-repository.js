"use strict";
const { transaction } = require("./points-repository");
const policy = require("./memorial-policy");
const { text, uuid } = require("./rules");
const { literalSearchPattern } = require("./search-pattern");

async function active(client, uid) {
  const user = (
    await client.query(
      "SELECT status FROM app_users WHERE id=$1 FOR NO KEY UPDATE",
      [uid],
    )
  ).rows[0];
  if (user?.status !== "active")
    policy.fail("ACCOUNT_INACTIVE", "请使用有效账号操作", 403);
}
async function lockHall(client, uid, id) {
  await active(client, uid);
  const hall = (
    await client.query(
      "SELECT * FROM memorial_halls WHERE id=$1 AND owner_id=$2 FOR UPDATE",
      [id, uid],
    )
  ).rows[0];
  if (!hall || hall.status === "deleted")
    policy.fail("MEMORIAL_NOT_FOUND", "纪念馆不存在或无权管理", 404);
  return hall;
}
async function lockAdminHall(client, id, allowDeleted = false) {
  const owner = (
    await client.query("SELECT owner_id FROM memorial_halls WHERE id=$1", [id])
  ).rows[0];
  if (!owner) policy.fail("MEMORIAL_NOT_FOUND", "纪念馆不存在", 404);
  await client.query("SELECT id FROM app_users WHERE id=$1 FOR NO KEY UPDATE", [
    owner.owner_id,
  ]);
  const hall = (
    await client.query("SELECT * FROM memorial_halls WHERE id=$1 FOR UPDATE", [
      id,
    ])
  ).rows[0];
  if (hall.status === "deleted" && !allowDeleted)
    policy.fail("MEMORIAL_NOT_FOUND", "纪念馆已删除", 404);
  return hall;
}
async function audit(client, hall, action, actor, reason = "") {
  await client.query(
    "INSERT INTO memorial_audit(hall_id,action,actor,revision,reason) VALUES($1,$2,$3,$4,$5)",
    [hall.id, action, actor, hall.revision, reason],
  );
}
const publicValue = (hall) => ({
  id: hall.id,
  name: hall.payload.name,
  birthDate: hall.payload.birthDate,
  deathDate: hall.payload.deathDate,
  biography: hall.payload.biography,
  memories: hall.payload.memories,
  portraitUrl: hall.portrait_image_id
    ? "/api/v1/memorial/halls/" + hall.id + "/portrait"
    : "",
  updatedAt: hall.updated_at,
});

function attachMemorial(repo, pool) {
  const one = async (sql, args) =>
    (await pool.query(sql, args)).rows[0] || null;
  repo.memorialSave = (uid, id, input) =>
    transaction(pool, async (client) => {
      await active(client, uid);
      const value = policy.payload(input.payload || {}, true),
        subject = policy.subject(value);
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.clientKey || ""))
        policy.fail("MEMORIAL_REQUEST_KEY", "请保留本次创建编号后重试");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "memorial:" + uid + ":" + input.clientKey,
      ]);
      let hall;
      if (id) hall = await lockHall(client, uid, id);
      else
        hall = (
          await client.query(
            "SELECT * FROM memorial_halls WHERE owner_id=$1 AND client_key=$2 FOR UPDATE",
            [uid, input.clientKey],
          )
        ).rows[0];
      if (hall) {
        if (hall.status === "deleted")
          policy.fail(
            "MEMORIAL_NOT_FOUND",
            "该创建编号已结束，请重新创建",
            409,
          );
        if (require("node:util").isDeepStrictEqual(hall.payload, value))
          return hall;
        if (!id || hall.revision !== policy.revision(input.revision))
          policy.fail("MEMORIAL_CHANGED", "纪念馆已被更新，请重新读取", 409);
      }
      if (value.portraitImageId) {
        const image = (
          await client.query(
            "SELECT id FROM content_images WHERE id=$1 AND user_id=$2 FOR UPDATE",
            [value.portraitImageId, uid],
          )
        ).rows[0];
        if (!image) policy.fail("IMAGE_NOT_OWNED", "请选择本人上传的纪念照片");
        const refs = await client.query(
          `SELECT id FROM publications WHERE $1=ANY(image_ids) UNION ALL SELECT id FROM service_catalog WHERE $1=ANY(image_ids)
    UNION ALL SELECT id FROM app_users WHERE avatar_image_id=$1 UNION ALL SELECT id FROM memorial_halls WHERE portrait_image_id=$1 AND id<>$2 LIMIT 1`,
          [
            value.portraitImageId,
            hall?.id || "00000000-0000-0000-0000-000000000000",
          ],
        );
        if (refs.rows.length)
          policy.fail(
            "MEMORIAL_PORTRAIT_REUSED",
            "请单独上传用于本纪念馆的照片",
          );
      }
      if (
        !hall &&
        (
          await client.query(
            "SELECT count(*)::int n FROM memorial_halls WHERE owner_id=$1 AND created_at>now()-interval '1 day'",
            [uid],
          )
        ).rows[0].n >= 5
      )
        policy.fail("MEMORIAL_LIMIT", "今日创建次数已达上限", 429);
      const result = hall
        ? (
            await client.query(
              `UPDATE memorial_halls SET payload=$2,subject_hash=$3,portrait_image_id=$4,status='draft',public_allowed=false,requested_public=false,response='',revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *`,
              [id, value, subject, value.portraitImageId],
            )
          ).rows[0]
        : (
            await client.query(
              "INSERT INTO memorial_halls(owner_id,client_key,payload,subject_hash,portrait_image_id) VALUES($1,$2,$3,$4,$5) RETURNING *",
              [uid, input.clientKey, value, subject, value.portraitImageId],
            )
          ).rows[0];
      await audit(client, result, "draft_saved", uid);
      return result;
    });
  repo.memorialOwnList = async (uid, offset = 0) =>
    (
      await pool.query(
        "SELECT id,payload,status,revision,response,requested_public,public_allowed,created_at,updated_at FROM memorial_halls WHERE owner_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 21 OFFSET $2",
        [uid, offset],
      )
    ).rows;
  repo.memorialOwn = async (uid, id) => {
    const hall = await one(
      "SELECT * FROM memorial_halls WHERE id=$1 AND owner_id=$2",
      [id, uid],
    );
    if (!hall) return null;
    const authorization = hall.authorization_id
      ? await one(
          'SELECT id,status,revision,response,relationship,statement,subject_hash,proof_id AS "proofId" FROM memorial_authorizations WHERE id=$1 AND owner_id=$2',
          [hall.authorization_id, uid],
        )
      : null;
    return {
      ...hall,
      authorization: authorization
        ? {
            ...authorization,
            current: authorization.subject_hash === hall.subject_hash,
          }
        : null,
    };
  };
  repo.memorialProofPermission = async (uid, id) =>
    !!(await one(
      "SELECT h.id FROM memorial_halls h JOIN app_users u ON u.id=h.owner_id AND u.status='active' WHERE h.id=$1 AND h.owner_id=$2 AND h.status<>'deleted'",
      [id, uid],
    ));
  repo.memorialStoreProof = (uid, id, file) =>
    transaction(pool, async (client) => {
      await lockHall(client, uid, id);
      if (
        (
          await client.query(
            "SELECT count(*)::int n FROM memorial_proofs WHERE owner_id=$1 AND created_at>now()-interval '1 day'",
            [uid],
          )
        ).rows[0].n >= 10
      )
        policy.fail(
          "MEMORIAL_PROOF_LIMIT",
          "今日核验材料上传次数已达上限",
          429,
        );
      await client.query(
        "INSERT INTO memorial_proofs(id,hall_id,owner_id,content_type,sha256,size) VALUES($1,$2,$3,$4,$5,$6)",
        [file.id, id, uid, file.contentType, file.hash, file.size],
      );
      return { id: file.id };
    });
  repo.memorialProof = async (id, uid = null) =>
    one(
      "SELECT * FROM memorial_proofs WHERE id=$1 AND ($2::uuid IS NULL OR owner_id=$2)",
      [id, uid],
    );
  repo.memorialAuthorize = (uid, id, input) =>
    transaction(pool, async (client) => {
      const hall = await lockHall(client, uid, id);
      if (hall.revision !== policy.revision(input.revision))
        policy.fail("MEMORIAL_CHANGED", "请重新读取纪念馆资料", 409);
      policy.payload(hall.payload);
      const relationship = text(input.relationship, 80, 2),
        statement = text(input.statement, 2000, 10);
      if (
        !uuid(input.proofId) ||
        !(
          await client.query(
            "SELECT 1 FROM memorial_proofs WHERE id=$1 AND owner_id=$2 AND hall_id=$3",
            [input.proofId, uid, id],
          )
        ).rows.length
      )
        policy.fail(
          "MEMORIAL_PROOF_REQUIRED",
          "请先上传本纪念馆的必要授权核验材料",
        );
      const previous = hall.authorization_id
        ? (
            await client.query(
              "SELECT * FROM memorial_authorizations WHERE id=$1",
              [hall.authorization_id],
            )
          ).rows[0]
        : null;
      if (
        previous?.status === "pending" &&
        previous.subject_hash === hall.subject_hash &&
        previous.proof_id === input.proofId &&
        previous.relationship === relationship &&
        previous.statement === statement
      )
        return previous;
      const authorization = (
        await client.query(
          "INSERT INTO memorial_authorizations(hall_id,owner_id,subject_hash,relationship,statement,proof_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [id, uid, hall.subject_hash, relationship, statement, input.proofId],
        )
      ).rows[0];
      await client.query(
        "UPDATE memorial_halls SET authorization_id=$2,public_allowed=false,status='draft',revision=revision+1,updated_at=now() WHERE id=$1",
        [id, authorization.id],
      );
      await audit(
        client,
        { ...hall, revision: hall.revision + 1 },
        "authorization_requested",
        uid,
      );
      return authorization;
    });
  repo.memorialSubmit = (uid, id, input) =>
    transaction(pool, async (client) => {
      const hall = await lockHall(client, uid, id),
        consent = policy.consent(input.consent);
      if (
        hall.status === "pending_review" &&
        hall.revision === input.revision + 1 &&
        hall.submitted_notice?.version === consent.version &&
        hall.requested_public === consent.publicRequested
      )
        return hall;
      if (hall.revision !== policy.revision(input.revision))
        policy.fail("MEMORIAL_CHANGED", "纪念馆内容已变化，请重新读取", 409);
      policy.payload(hall.payload);
      await require("./trust-repository").guard(
        client,
        uid,
        "publish",
        {},
        repo.trustOptions || {},
      );
      const authorization = (
        await client.query(
          "SELECT id,status,subject_hash FROM memorial_authorizations WHERE id=$1 FOR SHARE",
          [hall.authorization_id],
        )
      ).rows[0];
      if (
        !authorization ||
        !["pending", "verified"].includes(authorization.status) ||
        authorization.subject_hash !== hall.subject_hash
      )
        policy.fail(
          "MEMORIAL_AUTHORIZATION_REQUIRED",
          "请先提交与当前逝者资料对应的授权核验",
        );
      const result = (
        await client.query(
          "UPDATE memorial_halls SET status='pending_review',requested_public=$2,public_allowed=false,submitted_notice=$3,revision=revision+1,response='',updated_at=now() WHERE id=$1 RETURNING *",
          [
            id,
            consent.publicRequested,
            { version: consent.version, content: policy.document().content },
          ],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO memorial_submissions(hall_id,user_id,revision,payload,authorization_id,notice_version,public_requested) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          uid,
          result.revision,
          hall.payload,
          hall.authorization_id,
          consent.version,
          consent.publicRequested,
        ],
      );
      await audit(client, result, "submitted", uid);
      return result;
    });
  repo.memorialOwnerAction = (uid, id, input) =>
    transaction(pool, async (client) => {
      await active(client, uid);
      const hall = (
        await client.query(
          "SELECT * FROM memorial_halls WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [id, uid],
        )
      ).rows[0];
      if (!hall)
        policy.fail("MEMORIAL_NOT_FOUND", "纪念馆不存在或无权管理", 404);
      if (!["hide", "delete"].includes(input.action))
        policy.fail("MEMORIAL_ACTION_INVALID", "纪念馆操作无效");
      const status = input.action === "delete" ? "deleted" : "hidden";
      if (hall.status === status) return hall;
      if (hall.status === "deleted")
        policy.fail("MEMORIAL_NOT_FOUND", "纪念馆已删除", 404);
      if (hall.revision !== policy.revision(input.revision))
        policy.fail("MEMORIAL_CHANGED", "请重新读取最新纪念馆状态", 409);
      const result = (
        await client.query(
          "UPDATE memorial_halls SET status=$2::text,public_allowed=false,requested_public=false,payload=CASE WHEN $2::text='deleted' THEN '{}'::jsonb ELSE payload END,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
          [id, status],
        )
      ).rows[0];
      await audit(client, result, input.action, uid);
      return result;
    });
  repo.memorialPublic = async (id) => {
    const hall = await one(
      "SELECT h.* FROM memorial_halls h JOIN public_memorial_eligibility e ON e.id=h.id WHERE h.id=$1",
      [id],
    );
    return hall ? publicValue(hall) : null;
  };
  repo.memorialSearch = async (q = "", offset = 0) => {
    const rows = (
      await pool.query(
        "SELECT h.* FROM memorial_halls h JOIN public_memorial_eligibility e ON e.id=h.id WHERE (h.payload->>'name' ILIKE $1 OR h.payload->>'biography' ILIKE $1 OR h.payload->>'memories' ILIKE $1) ORDER BY h.updated_at DESC,h.id DESC LIMIT 21 OFFSET $2",
        ["%" + literalSearchPattern(q) + "%", offset],
      )
    ).rows;
    return {
      items: rows.slice(0, 20).map(publicValue),
      hasMore: rows.length > 20,
    };
  };
  repo.memorialPortrait = async (id) =>
    one(
      "SELECT i.data,i.thumbnail FROM memorial_halls h JOIN public_memorial_eligibility e ON e.id=h.id JOIN content_images i ON i.id=h.portrait_image_id WHERE h.id=$1",
      [id],
    );
  repo.memorialTribute = (uid, id, input) =>
    transaction(pool, async (client) => {
      await active(client, uid);
      await client.query(
        "SELECT id FROM memorial_halls WHERE id=$1 FOR SHARE",
        [id],
      );
      if (
        !(
          await client.query(
            "SELECT id FROM public_memorial_eligibility WHERE id=$1",
            [id],
          )
        ).rows.length
      )
        policy.fail("MEMORIAL_NOT_FOUND", "该纪念馆暂未公开", 404);
      if (!["flower", "candle", "blessing"].includes(input.kind))
        policy.fail(
          "MEMORIAL_TRIBUTE_INVALID",
          "请选择献花、点烛或固定追思祝福",
        );
      if (
        input.kind === "blessing" &&
        !policy.blessings.some((item) => item.code === input.blessingCode)
      )
        policy.fail("MEMORIAL_BLESSING_INVALID", "请选择平台提供的追思祝福");
      const previous = (
        await client.query(
          "SELECT id FROM memorial_tributes WHERE hall_id=$1 AND user_id=$2 AND kind=$3 AND tribute_day=(now() AT TIME ZONE 'Asia/Shanghai')::date",
          [id, uid, input.kind],
        )
      ).rows[0];
      if (previous) return { sent: true, alreadySent: true };
      if (
        (
          await client.query(
            "SELECT count(*)::int n FROM memorial_tributes WHERE user_id=$1 AND tribute_day=(now() AT TIME ZONE 'Asia/Shanghai')::date",
            [uid],
          )
        ).rows[0].n >= 100
      )
        policy.fail(
          "MEMORIAL_TRIBUTE_LIMIT",
          "今日寄托心意次数较多，请稍后再来",
          429,
        );
      const inserted = await client.query(
        "INSERT INTO memorial_tributes(hall_id,user_id,kind,blessing_code) VALUES($1,$2,$3,$4) ON CONFLICT(hall_id,user_id,kind,tribute_day) DO NOTHING RETURNING id",
        [
          id,
          uid,
          input.kind,
          input.kind === "blessing" ? input.blessingCode : null,
        ],
      );
      return { sent: true, alreadySent: !inserted.rows.length };
    });
  repo.memorialReport = (uid, id, input) =>
    transaction(pool, async (client) => {
      await active(client, uid);
      if (
        !(
          await client.query(
            "SELECT id FROM public_memorial_eligibility WHERE id=$1",
            [id],
          )
        ).rows.length
      )
        policy.fail("MEMORIAL_NOT_FOUND", "该纪念馆暂未公开", 404);
      if (!["impersonation", "privacy", "rights", "other"].includes(input.kind))
        policy.fail("MEMORIAL_REPORT_INVALID", "请选择核查事项");
      const reason = text(input.reason, 1000, 8);
      const row = (
        await client.query(
          "INSERT INTO memorial_reports(hall_id,user_id,kind,reason) VALUES($1,$2,$3,$4) ON CONFLICT(hall_id,user_id) WHERE status='pending' DO NOTHING RETURNING id,status",
          [id, uid, input.kind, reason],
        )
      ).rows[0];
      return row || { status: "pending", alreadySubmitted: true };
    });
  repo.memorialOwnReports = async (uid) =>
    (
      await pool.query(
        "SELECT id,hall_id,kind,status,response,created_at FROM memorial_reports WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
        [uid],
      )
    ).rows;
  repo.memorialAdminQueue = async (qualification, offset = 0) =>
    qualification
      ? {
          authorizations: (
            await pool.query(
              "SELECT a.id,a.hall_id,a.status,a.revision,a.created_at,h.payload->>'name' AS name FROM memorial_authorizations a JOIN memorial_halls h ON h.id=a.hall_id WHERE h.authorization_id=a.id AND h.status<>'deleted' ORDER BY a.created_at,a.id LIMIT 21 OFFSET $1",
              [offset],
            )
          ).rows,
        }
      : {
          halls: (
            await pool.query(
              "SELECT id,payload,status,revision,response,requested_public FROM memorial_halls WHERE status IN ('pending_review','published','hidden') ORDER BY updated_at DESC,id DESC LIMIT 21 OFFSET $1",
              [offset],
            )
          ).rows,
          reports: (
            await pool.query(
              "SELECT * FROM memorial_reports WHERE status='pending' ORDER BY created_at,id LIMIT 100",
            )
          ).rows,
        };
  repo.memorialAdminHall = async (id) => {
    const hall = await one("SELECT * FROM memorial_halls WHERE id=$1", [id]);
    if (!hall) return null;
    const authorization = await one(
      "SELECT id,status,subject_hash,revision,response FROM memorial_authorizations WHERE id=$1",
      [hall.authorization_id],
    );
    const history = (
      await pool.query(
        "SELECT * FROM memorial_audit WHERE hall_id=$1 ORDER BY created_at,id",
        [id],
      )
    ).rows;
    const submissions = (
      await pool.query(
        "SELECT revision,payload,notice_version,public_requested,confirmed_at FROM memorial_submissions WHERE hall_id=$1 ORDER BY confirmed_at,id",
        [id],
      )
    ).rows;
    return { ...hall, authorization, history, submissions };
  };
  repo.memorialAdminAuthorization = async (id) =>
    one(
      `SELECT a.*,jsonb_build_object('name',h.payload->>'name','birthDate',h.payload->>'birthDate','deathDate',h.payload->>'deathDate') AS subject
  FROM memorial_authorizations a JOIN memorial_halls h ON h.id=a.hall_id WHERE a.id=$1`,
      [id],
    );
  repo.memorialReviewAuthorization = (id, input, actor) =>
    transaction(pool, async (client) => {
      const identity = (
        await client.query(
          "SELECT hall_id FROM memorial_authorizations WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (!identity) policy.fail("MEMORIAL_NOT_FOUND", "核验记录不存在", 404);
      const hall = await lockAdminHall(client, identity.hall_id);
      const row = (
        await client.query(
          "SELECT * FROM memorial_authorizations WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        row.revision !== policy.revision(input.revision) ||
        hall.authorization_id !== id
      )
        policy.fail("MEMORIAL_CHANGED", "核验申请已更新", 409);
      if (
        !["verified", "rejected", "revoked"].includes(input.status) ||
        (input.status === "verified" &&
          (input.manuallyVerified !== true ||
            row.subject_hash !== hall.subject_hash))
      )
        policy.fail(
          "MEMORIAL_AUTHORIZATION_CHECK",
          "请实际核查家属关系、授权范围和当前逝者资料",
        );
      const response = text(input.response, 1000, 8);
      await client.query(
        "UPDATE memorial_authorizations SET status=$2::text,response=$3,revision=revision+1 WHERE id=$1",
        [id, input.status, response],
      );
      if (input.status !== "verified")
        await client.query(
          "UPDATE memorial_halls SET public_allowed=false,status=CASE WHEN status='published' THEN 'hidden' ELSE status END,revision=revision+1,response=$2 WHERE id=$1",
          [hall.id, "授权核验已有更新，请查看本人管理记录"],
        );
      await audit(
        client,
        hall,
        "authorization_" + input.status,
        actor,
        response,
      );
      return { ok: true };
    });
  repo.memorialReview = (id, input, actor) =>
    transaction(pool, async (client) => {
      const hall = await lockAdminHall(client, id);
      await active(client, hall.owner_id);
      if (hall.revision !== policy.revision(input.revision))
        policy.fail("MEMORIAL_CHANGED", "内容已变化，请重新读取", 409);
      if (
        !["published", "rejected", "hidden"].includes(input.status) ||
        (input.status !== "hidden" && hall.status !== "pending_review")
      )
        policy.fail("MEMORIAL_REVIEW_INVALID", "当前状态不支持该审核操作");
      if (input.status === "published") {
        policy.payload(hall.payload);
        const authorization = (
          await client.query(
            "SELECT id FROM memorial_authorizations WHERE id=$1 AND status='verified' AND subject_hash=$2 FOR SHARE",
            [hall.authorization_id, hall.subject_hash],
          )
        ).rows[0];
        if (!authorization)
          policy.fail(
            "MEMORIAL_AUTHORIZATION_REQUIRED",
            "当前逝者资料须先完成独立授权核验",
            403,
          );
        if (
          input.textReviewed !== true ||
          input.rightsReviewed !== true ||
          (hall.portrait_image_id && input.portraitReviewed !== true)
        )
          policy.fail(
            "MEMORIAL_CONTENT_CHECK",
            "请逐项核查生平文字、照片使用权和公开范围",
          );
      }
      const response = text(input.response, 1000, 8);
      const result = (
        await client.query(
          "UPDATE memorial_halls SET status=$2::text,public_allowed=($2='published' AND requested_public),response=$3,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
          [id, input.status, response],
        )
      ).rows[0];
      await audit(client, result, "review_" + input.status, actor, response);
      return { ok: true };
    });
  repo.memorialResolveReport = (id, input, actor) =>
    transaction(pool, async (client) => {
      const identity = (
        await client.query("SELECT hall_id FROM memorial_reports WHERE id=$1", [
          id,
        ])
      ).rows[0];
      if (!identity) policy.fail("MEMORIAL_NOT_FOUND", "举报记录不存在", 404);
      const hall = await lockAdminHall(client, identity.hall_id, true);
      const row = (
        await client.query(
          "SELECT * FROM memorial_reports WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        row.revision !== policy.revision(input.revision) ||
        row.status !== "pending"
      )
        policy.fail("MEMORIAL_CHANGED", "举报已被处理", 409);
      if (!["resolved", "rejected"].includes(input.status))
        policy.fail("MEMORIAL_REPORT_INVALID", "请选择处理结果");
      const response = text(input.response, 1000, 8);
      if (input.hide === true && hall.status !== "deleted")
        await client.query(
          "UPDATE memorial_halls SET status='hidden',public_allowed=false,revision=revision+1 WHERE id=$1",
          [hall.id],
        );
      await client.query(
        "UPDATE memorial_reports SET status=$2::text,response=$3,revision=revision+1 WHERE id=$1",
        [id, input.status, response],
      );
      await audit(client, hall, "report_" + input.status, actor, response);
      return { ok: true };
    });
  const readImage = repo.readContentImage;
  repo.readContentImage = async (id, uid, ...args) => {
    const portrait = await one(
      "SELECT owner_id FROM memorial_halls WHERE portrait_image_id=$1 LIMIT 1",
      [id],
    );
    if (portrait && portrait.owner_id !== uid) return null;
    return readImage(id, uid, ...args);
  };
  const deleteImage = repo.deleteContentImage;
  repo.deleteContentImage = async (uid, id) =>
    (await one(
      "SELECT id FROM memorial_halls WHERE portrait_image_id=$1 LIMIT 1",
      [id],
    ))
      ? false
      : deleteImage(uid, id);
  return repo;
}
module.exports = { attachMemorial, publicValue };
