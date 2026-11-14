"use strict";
const noticeVersion = "memorial-1.0-20261114";
const blessings = [
  { code: "remember", text: "音容宛在，永远怀念。" },
  { code: "peace", text: "愿您安息，思念长存。" },
  { code: "warmth", text: "那些温暖的时光，会一直留在心里。" },
];
const statusNames = {
  draft: "草稿",
  pending_review: "待审核",
  published: "已审核",
  hidden: "已隐藏",
  rejected: "待修改",
  deleted: "已删除",
};
module.exports = { noticeVersion, blessings, statusNames };
