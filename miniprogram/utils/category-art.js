"use strict";

const registry = require("./classification-contract");
const draftIds = new Set(require("../data/category-art-drafts"));
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
