"use strict";
const crypto = require("node:crypto");
const { ApiError, text, uuid } = require("./rules");
const shared = require("../../miniprogram/utils/memorial-policy");
const fail = (code, message, status = 400) => {
  throw new ApiError(status, code, message);
};
function validMemorialDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1)
    return false;
  const instant = Date.parse(value + "T00:00:00Z");
  return (
    Number.isFinite(instant) &&
    new Date(instant).toISOString().slice(0, 10) === value
  );
}
function payload(input, draft = false) {
  const value = {
    name: text(input.name || "", 80, draft ? 0 : 2),
    birthDate: text(input.birthDate || "", 10),
    deathDate: text(input.deathDate || "", 10),
    biography: text(input.biography || "", 5000, draft ? 0 : 10),
    memories: text(input.memories || "", 5000),
    portraitImageId: input.portraitImageId || null,
  };
  for (const date of [value.birthDate, value.deathDate])
    if (
      date &&
      (!validMemorialDate(date) ||
        date > new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10))
    )
      fail("MEMORIAL_DATE_INVALID", "请填写有效的已发生日期");
  if (value.birthDate && value.deathDate && value.birthDate > value.deathDate)
    fail("MEMORIAL_DATE_INVALID", "出生日期应早于或等于逝世日期");
  if (value.portraitImageId && !uuid(value.portraitImageId))
    fail("MEMORIAL_PORTRAIT_INVALID", "纪念照片编号无效");
  if (
    require("./trust-policy").redact(
      value.name + " " + value.biography + " " + value.memories,
    ) !==
    value.name + " " + value.biography + " " + value.memories
  )
    fail("MEMORIAL_PRIVATE_DATA", "公开资料请避免填写手机号或证件号码");
  return value;
}
function subject(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([value.name, value.birthDate, value.deathDate]))
    .digest("hex");
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1)
    fail("MEMORIAL_REVISION_REQUIRED", "请重新读取当前纪念馆版本");
  return value;
}
function consent(value) {
  if (
    value?.accepted !== true ||
    value.version !== shared.noticeVersion ||
    typeof value.publicRequested !== "boolean"
  )
    fail(
      "MEMORIAL_CONSENT_REQUIRED",
      "请单独确认家属授权、公开范围及纪念资料处理说明",
    );
  return value;
}
function document() {
  return {
    version: shared.noticeVersion,
    title: "纪念馆创建与资料处理说明",
    content:
      "# 纪念馆创建与资料处理说明\n\n创建人应具有合法处理、使用相关资料的依据，并取得必要的家属授权。仅上传与核验必要的材料，授权凭证由独立核验人员处理。\n\n生平、纪念照片与追思文字将经过审核。您可以选择仅供本人管理，或申请允许公开展示。公开展示以平台实际开放、家属授权有效和内容审核通过为前提。\n\n公开资料修改后需要重新审核。您可以隐藏或删除纪念馆，平台会同步停止公开查询和照片访问，按适用规则处理必要的核验、举报与审核档案。近亲属相关权利请求可通过举报或平台隐私申请渠道提交。\n\n献花、点烛和固定追思祝福免费。首版提供创建人维护的生平与追思文字，以及固定祝福语选择。\n\n平台将独立进行授权核验、内容审核、举报处理和信息保护。",
  };
}
module.exports = {
  ...shared,
  payload,
  subject,
  revision,
  consent,
  document,
  fail,
};
