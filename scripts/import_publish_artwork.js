"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const sharp = require("../backend/node_modules/sharp");
const catalog = require("../miniprogram/utils/classification-contract");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(projectRoot, "3D插画");
const mini = path.join(projectRoot, "miniprogram");

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  const iconDirectory = path.join(source, "一级分类_27行业UI图标");
  const iconSpec = await readJson(path.join(iconDirectory, "manifest.json"));
  const groupSpec = await readJson(path.join(source, "二级分组_83分组简化规范", "groups-83.json"));
  const expectedOrder = catalog.categories.map((item) => item.id);
  for (const id of ["C08", "C09", "C10", "C23"])
    expectedOrder.push(...expectedOrder.splice(expectedOrder.indexOf(id), 1));
  assert.deepEqual(iconSpec.display_order.map((item) => item.id), expectedOrder);
  assert.deepEqual(groupSpec.categories.map((item) => item.category_id), expectedOrder);
  let groupCount = 0;
  for (const item of groupSpec.categories) {
    const category = catalog.find(item.category_id);
    assert.equal(category.name, item.category_name);
    assert.deepEqual(item.groups.map((group) => [group.id, group.name, group.item_count]),
      category.groups.map((group) => [group.id, group.name, group.items.length]));
    groupCount += item.groups.length;
  }

  const iconOutput = path.join(mini, "assets/publish-industry");
  await fs.mkdir(iconOutput, { recursive: true });

  const icons = iconSpec.display_order;
  for (const { id, icon } of icons) {
    assert.ok(/^C\d{2}_[\w-]+\.svg$/.test(icon) && icon.startsWith(id + "_"), icon);
    await sharp(path.join(iconDirectory, "icons", icon), { density: 144 })
      .resize(64, 64).png({ palette: true, colours: 32 })
      .toFile(path.join(iconOutput, id + ".png"));
  }

  const projectIds = catalog.projects.map(item => item.id);
  execFileSync(process.execPath, [path.join(__dirname, "build_catalog_display_assets.js"), ...projectIds], { stdio: "inherit" });
  console.log(`Imported ${icons.length} industry icons and ${projectIds.length} illustrations. Verified ${groupCount} groups.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
