"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("../backend/node_modules/sharp");

const projects = ["C04G01S01", "C04G01S02", "C04G01S03", "C04G01S04"];

async function main() {
  const sources = process.argv.slice(2);
  if (sources.length !== projects.length)
    throw Error("Provide the phone, laptop, tablet and accessories PNG paths");
  const root = path.resolve(__dirname, "..");
  const directory = path.join(root, "miniprogram/category-art/assets/3d-v1");
  await fs.mkdir(directory, { recursive: true });
  const items = [];
  for (const [index, id] of projects.entries()) {
    const source = await fs.readFile(sources[index]);
    const original = await sharp(source).metadata();
    if (!original.hasAlpha)
      throw Error(id + " requires genuine alpha transparency");
    const output = await sharp(source)
      .resize(384, 384, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toBuffer();
    const file = path.join(directory, id + ".webp");
    await fs.writeFile(file, output);
    items.push({
      id,
      path: "/category-art/assets/3d-v1/" + id + ".webp",
      stage: "styled3d",
      transparent: true,
      width: 384,
      height: 384,
      bytes: output.length,
      sourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
      sha256: crypto.createHash("sha256").update(output).digest("hex"),
    });
  }
  const report = path.join(root, "docs/design/3d-blending-2026-11-15");
  await fs.mkdir(report, { recursive: true });
  await fs.writeFile(
    path.join(report, "assets.json"),
    JSON.stringify({ tool: "built-in imagegen", items }, null, 2) + "\n",
  );
  console.log("Prepared four transparent 3D category assets");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
