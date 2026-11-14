"use strict";

const registry = require("./classification-contract");
const draftIds = new Set(require("../data/category-art-drafts"));
const styledIds = new Set(["C04G01S01", "C04G01S02", "C04G01S03", "C04G01S04"]);
const memorialIds = new Set([
  "memorial-create",
  "memorial-manage",
  "memorial-remembrance",
]);

function describe(id) {
  if (memorialIds.has(id)) {
    return {
      path: "/category-art/assets/memorial/" + id + ".webp",
      stage: "placeholder",
    };
  }
  const project = registry.find(id);
  if (!project?.groupId) return null;
  if (styledIds.has(id)) {
    return {
      path: "/category-art/assets/3d-v1/" + id + ".webp",
      stage: "styled3d",
      transparent: true,
    };
  }
  return {
    path:
      "/category-art/assets/categories/" +
      project.categoryId +
      "/" +
      id +
      ".webp",
    stage: draftIds.has(id) ? "draft3d" : "placeholder",
  };
}

module.exports = { describe };
