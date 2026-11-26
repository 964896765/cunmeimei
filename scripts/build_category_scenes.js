"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("../backend/node_modules/sharp");
const catalog = require("../miniprogram/utils/classification-contract");
const completion=process.argv.includes('--completion');
const specs = require(completion?"./category-completion-specs.json":"./category-scene-specs.json");

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
  const output = path.join(root, completion?"docs/remediation/b123-2026-11-18":"docs/design/experience-refinement-2026-11-18");
  const manifestPath = path.join(output,"assets.json");
  const idFlag = process.argv.indexOf("--ids");
  const selected = idFlag < 0 ? specs : process.argv.slice(idFlag+1).map(id => specs.find(spec => spec.id===id));
  if(!selected.length||selected.some(spec=>!spec))throw Error("Select existing category scene IDs");
  await fs.mkdir(output,{recursive:true});
  const previousManifest = idFlag < 0 ? null : JSON.parse(await fs.readFile(manifestPath,"utf8"));
  const originalItems = new Map(previousManifest?.items.map(item => [item.id, item]));
  const items = [];
  const groups = completion||previousManifest?JSON.parse(JSON.stringify(require('../miniprogram/data/category-art-scenes'))):{};
  for (const spec of selected) {
    const project = catalog.find(spec.id);
    if (!project?.groupId) throw Error("Unknown category " + spec.id);
    const image = await sharp(path.join(source, spec.id + ".png"))
      .resize(160, 160)
      .webp({ quality: 72, alphaQuality: 85, effort: 6 })
      .toBuffer();
    const assetPath = "/category-art/assets/categories/" + project.categoryId + "/" + spec.id + ".webp";
    let previous=await fs.readFile(path.join(root,"miniprogram",assetPath));
    if(completion){const before=path.join(output,spec.id+'-before.webp');try{previous=await fs.readFile(before);}catch(e){if(e.code!=='ENOENT')throw e;await fs.writeFile(before,previous);}}
    await fs.writeFile(path.join(root, "miniprogram", assetPath), image);
    const index=Number(spec.id.slice(-2));if(!(groups[project.groupId] ||= []).includes(index))groups[project.groupId].push(index);
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
      previousSha256: originalItems.get(spec.id)?.previousSha256 || crypto.createHash('sha256').update(previous).digest('hex'),
      models: spec.parts.map(part => part.model),
    });
  }
  await fs.writeFile(path.join(root, "miniprogram/data/category-art-scenes.js"), "module.exports=" + JSON.stringify(groups) + ";\n");
  await fs.mkdir(output, { recursive: true });
  for (const item of items) originalItems.set(item.id, item);
  const manifestItems = Array.from(originalItems.values());
  await fs.writeFile(manifestPath, JSON.stringify({
    tool: "Blender 5.1 Cycles",
    generator: completion?"scripts/render_category_completion.py":"scripts/render_category_scenes.py",
    specifications: completion?"scripts/category-completion-specs.json":"scripts/category-scene-specs.json",
    provenance: "Project-authored geometry and materials",
    items:manifestItems,
  }, null, 2) + "\n");
  if(!previousManifest){
    const parentPet=items.filter(item=>item.id.startsWith('C12')||item.id.startsWith('C21'));if(parentPet.length)await contactSheet(parentPet,path.join(output,'parent-pet-scenes.png'));
    for(let start=0;start<items.length;start+=42)await contactSheet(items.slice(start,start+42),path.join(output,'scenes-'+(Math.floor(start/42)+1)+'.png'));
  }
  console.log("Exported " + items.length + " transparent 3D scenes");
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
