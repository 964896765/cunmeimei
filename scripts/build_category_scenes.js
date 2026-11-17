"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("../backend/node_modules/sharp");
const catalog = require("../miniprogram/utils/classification-contract");
const specs = require("./category-scene-specs.json");
const original = require("../docs/design/category-resources-2026-11-15/source-manifest.json");

async function contactSheet(items, output) {
  const columns=6,cellWidth=180,cellHeight=200;
  const layers=[];
  for(const [index,item] of items.entries()){
    const left=index%columns*cellWidth,top=Math.floor(index/columns)*cellHeight;
    const image=await sharp(path.join(__dirname,"../miniprogram",item.path)).png().toBuffer();
    layers.push({input:image,left:left+10,top});
    const name=item.name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const label=Buffer.from('<svg width="180" height="40"><text x="90" y="22" text-anchor="middle" font-size="13" font-family="Microsoft YaHei" fill="#3B3543">'+name+'</text></svg>');
    layers.push({input:label,left,top:top+160});
  }
  await sharp({create:{width:columns*cellWidth,height:Math.ceil(items.length/columns)*cellHeight,channels:4,background:'#FAF8F6'}}).composite(layers).png().toFile(output);
}

async function main() {
  const source = process.argv[2];
  if (!source) throw Error("Provide the Blender PNG output directory");
  const root = path.resolve(__dirname, "..");
  const output = path.join(root, "docs/design/experience-refinement-2026-11-18");
  const items = [];
  const groups = {};
  for (const spec of specs) {
    const project = catalog.find(spec.id);
    if (!project?.groupId) throw Error("Unknown category " + spec.id);
    const image = await sharp(path.join(source, spec.id + ".png"))
      .resize(160, 160)
      .webp({ quality: 72, alphaQuality: 85, effort: 6 })
      .toBuffer();
    const assetPath = "/category-art/assets/categories/" + project.categoryId + "/" + spec.id + ".webp";
    await fs.writeFile(path.join(root, "miniprogram", assetPath), image);
    (groups[project.groupId] ||= []).push(Number(spec.id.slice(-2)));
    items.push({
      id: spec.id,
      name: project.name,
      path: assetPath,
      stage: "rendered3d",
      transparent: true,
      width: 160,
      height: 160,
      bytes: image.length,
      sha256: crypto.createHash("sha256").update(image).digest("hex"),
      previousSha256: original.items.find(item => item.category_id === spec.id).sha256,
      models: spec.parts.map(part => part.model),
    });
  }
  await fs.writeFile(path.join(root, "miniprogram/data/category-art-scenes.js"), "module.exports=" + JSON.stringify(groups) + ";\n");
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "assets.json"), JSON.stringify({
    tool: "Blender 5.1 Cycles",
    generator: "scripts/render_category_scenes.py",
    specifications: "scripts/category-scene-specs.json",
    provenance: "Project-authored geometry and materials",
    items,
  }, null, 2) + "\n");
  await contactSheet(items.filter(item=>item.id.startsWith('C12')||item.id.startsWith('C21')),path.join(output,'parent-pet-scenes.png'));
  for(let start=0;start<items.length;start+=42)await contactSheet(items.slice(start,start+42),path.join(output,'scenes-'+(Math.floor(start/42)+1)+'.png'));
  console.log("Exported " + items.length + " transparent 3D scenes");
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
