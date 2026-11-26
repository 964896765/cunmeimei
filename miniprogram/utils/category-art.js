"use strict";

const registry = require("./classification-contract");
const draftIds = new Set(require("../data/category-art-drafts"));
const sceneGroups = require("../data/category-art-scenes");
const styledIds = new Set(["C04G01S01", "C04G01S02", "C04G01S03", "C04G01S04"]);
const draftFrames = { C01: "food", C02: "profession", C03: "service", C04: "goods" };
const memorialIds = new Set([
  "memorial-create",
  "memorial-manage",
  "memorial-remembrance",
]);

function describe(id) {
  const displayPath = "/category-art/images/" + id + ".png";
  if (memorialIds.has(id)) {
    return {
      path: "/category-art/assets/memorial/" + id + ".webp",
      displayPath,
      stage: "placeholder",
      frame: "symbol",
    };
  }
  const project = registry.find(id);
  if (!project?.groupId) return null;
  const display = { displayPath, displayFrame: "transparent" };
  if (styledIds.has(id)) {
    return {
      path: "/category-art/assets/3d-v1/" + id + ".webp",
      ...display,
      stage: "styled3d",
      transparent: true,
      frame: "transparent",
    };
  }
  const rendered = sceneGroups[project.groupId]?.includes(Number(id.slice(-2)));
  return {
    path:
      "/category-art/assets/categories/" +
      project.categoryId +
      "/" +
      id +
      ".webp",
    ...display,
    stage: rendered ? "rendered3d" : draftIds.has(id) ? "draft3d" : "placeholder",
    transparent: !!rendered,
    frame: rendered ? "transparent" : draftIds.has(id) ? draftFrames[project.categoryId] || "goods" : "symbol",
  };
}

module.exports = { describe };
