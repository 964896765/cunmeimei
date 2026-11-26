"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("../backend/node_modules/sharp");
const assets = require("../miniprogram/utils/category-art");
const catalog = require("../miniprogram/utils/classification-contract");

async function main() {
  const mini = path.resolve(__dirname, "../miniprogram");
  const masters = path.resolve(__dirname, "../3D插画/珍珠玻璃-统一版");
  const requested = process.argv.slice(2);
  const ids = requested.length ? requested : [
    ...catalog.projects.map(item => item.id),
    "memorial-create", "memorial-manage", "memorial-remembrance",
  ];
  await fs.mkdir(path.join(mini, "category-art/images"), { recursive: true });

  for (const id of ids) {
    const descriptor = assets.describe(id);
    if (!descriptor) throw Error("Unknown catalog artwork " + id);
    const output = path.join(mini, descriptor.displayPath);
    const project = catalog.find(id);
    if (project) {
      const master = path.join(masters, project.categoryId, id + ".png");
      await sharp(master)
        .resize(92, 92)
        .png({ palette: true, colours: 72, dither: 0, compressionLevel: 9, effort: 10 })
        .toFile(output);
    } else {
      await sharp(path.join(mini, descriptor.path))
        .resize(112, 112, { fit: "inside", withoutEnlargement: true })
        .png({ palette: true, colours: 64, effort: 5, dither: 0.35 })
        .toFile(output);
    }
  }
  console.log("Built " + ids.length + " catalog PNGs.");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
