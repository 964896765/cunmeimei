"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const sharp = require("sharp");
const catalog = require("../../miniprogram/utils/classification-contract");
const assets = require("../../miniprogram/utils/category-art");
const root = path.resolve(__dirname, "../..");
const manifest = require("../../docs/design/category-resources-2026-11-15/source-manifest.json");
const styled = require("../../docs/design/3d-blending-2026-11-15/assets.json");
const scenes = require("../../docs/design/experience-refinement-2026-11-18/assets.json");
const completion = require("../../docs/remediation/b123-2026-11-18/assets.json");
const sceneItems=[...scenes.items,...completion.items];

test("authored category scenes use distinct object combinations", () => {
  const compositions = new Map();
  const specs = [
    ...require("../../scripts/category-scene-specs.json"),
    ...require("../../scripts/category-completion-specs.json"),
  ];
  for (const spec of specs) {
    const key = spec.parts.map((part) => part.model).sort().join("+");
    assert.ok(!compositions.has(key), `${spec.id} reuses the objects in ${compositions.get(key)}`);
    compositions.set(key, spec.id);
  }
});

test("all category images have distinct content and rendered replacements retain transparent edges",async()=>{
 const hashes=new Set();
 for(const project of catalog.projects){
  const descriptor=assets.describe(project.id);
  const bytes=fs.readFileSync(path.join(root,"miniprogram",descriptor.path));
  const hash=crypto.createHash("sha256").update(bytes).digest("hex");
  assert.ok(!hashes.has(hash),project.id+" duplicates another category image");
  hashes.add(hash);
  if(descriptor.stage==="rendered3d"){
   const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   let clear=0,opaque=0;
   for(let i=3;i<data.length;i+=info.channels){clear+=Number(data[i]===0);opaque+=Number(data[i]>245);}
   assert.ok(clear>info.width*info.height*.15,project.id+" needs transparent padding");
   assert.ok(opaque>16,project.id+" has no visible subject");
  }
 }
 assert.equal(hashes.size,418);
 assert.equal(scenes.items.filter(item=>item.id.startsWith("C12")||item.id.startsWith("C21")).length,26);
});

test("source map preserves 418 identities and provenance while all authored replacements are applied", async () => {
  assert.deepEqual(manifest.counts, {
    projects: 418,
    draft3d: 76,
    placeholder: 342,
    memorialPlaceholders: 3,
  });
  assert.equal(
    new Set(manifest.items.map((item) => item.category_id)).size,
    418,
  );
  assert.deepEqual(
    manifest.items.map((item) => item.category_id).sort(),
    catalog.projects.map((item) => item.id).sort(),
  );
  let drafts = 0;
  const draftFrames = {
    C01: "food",
    C02: "profession",
    C03: "service",
    C04: "goods",
  };
  for (const item of manifest.items) {
    const project = catalog.find(item.category_id);
    assert.equal(project.name, item.category_name);
    assert.equal(project.categoryId, item.industry_id);
    assert.equal(project.groupId, item.group_id);
    const descriptor = assets.describe(item.category_id);
    const refined = styled.items.find((asset) => asset.id === item.category_id);
    assert.equal(descriptor.path, refined ? refined.path : item.runtime_path);
    const expectedStage =
      item.asset_status === "3D拼版裁切初稿" ? "draft3d" : "placeholder";
    const scene = sceneItems.find(asset => asset.id === item.category_id);
    assert.equal(descriptor.stage, scene ? "rendered3d" : refined ? "styled3d" : expectedStage);
    const originalFrame =
      expectedStage === "draft3d" ? draftFrames[item.industry_id] : "symbol";
    assert.equal(descriptor.frame, scene || refined ? "transparent" : originalFrame);
    drafts += Number(expectedStage === "draft3d");
    const bytes = fs.readFileSync(
      path.join(root, "miniprogram", item.runtime_path),
    );
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      scene ? scene.sha256 : item.sha256,
    );
    const decoded = await sharp(bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, scene ? 160 : 256);
    assert.equal(decoded.info.height, scene ? 160 : 256);
  }
  assert.equal(drafts, 76);
  assert.equal(assets.describe("C01"), null);
  assert.equal(assets.describe("../private"), null);
});

test("the four renewed digital illustrations have real transparency and preserved asset identity", async () => {
  assert.equal(styled.items.length, 4);
  for (const item of styled.items) {
    const descriptor = assets.describe(item.id);
    assert.equal(descriptor.path, item.path);
    assert.equal(descriptor.stage, "styled3d");
    assert.equal(descriptor.transparent, true);
    assert.equal(descriptor.frame, "transparent");
    const bytes = fs.readFileSync(path.join(root, "miniprogram", item.path));
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      item.sha256,
    );
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 384);
    assert.equal(info.height, 384);
    assert.equal(info.channels, 4);
    let clear = 0;
    for (let index = 3; index < data.length; index += 4)
      clear += Number(data[index] === 0);
    assert.ok(clear > info.width * info.height * 0.25);
    assert.equal(data[3], 0);
    assert.equal(data[data.length - 1], 0);
  }
});

test("resources occupy a separate package, retain all original routes and keep the existing housing artwork", () => {
  const app = require("../../miniprogram/app.json");
  const resourcePackage = app.subPackages.find(
    (item) => item.name === "category-art",
  );
  assert.equal(resourcePackage.root, "category-art");
  assert.deepEqual(resourcePackage.pages, ["entry/index"]);
  for (const page of resourcePackage.pages)
    for (const extension of [".js", ".json", ".wxml"])
      assert.ok(fs.existsSync(path.join(root, "miniprogram", resourcePackage.root, page + extension)));
  assert.equal(app.pages.length, 28);
  assert.deepEqual(app.preloadRule["pages/publish/index"], {
    network: "all",
    packages: [resourcePackage.name],
  });
  assert.equal(manifest.existingHousingOverrides.length, 5);
  for (const id of manifest.existingHousingOverrides)
    assert.equal(assets.describe(id).stage, scenes.items.some(item=>item.id===id)?"rendered3d":"placeholder");
  for (const id of [
    "memorial-create",
    "memorial-manage",
    "memorial-remembrance",
  ]) {
    const descriptor = assets.describe(id);
    assert.equal(descriptor.stage, "placeholder");
    assert.equal(descriptor.frame, "symbol");
    assert.ok(fs.existsSync(path.join(root, "miniprogram", descriptor.path)));
  }
  assert.equal(catalog.categories.length, 27);
  assert.equal(catalog.projects.length, 418);
  for (const project of catalog.projects.filter((item) =>
    require("../../miniprogram/utils/product-scope").isForumProject(item.id),
  )) {
    assert.equal(catalog.publicationFor(project.id).enabled, false);
  }
});

test("catalog images and the 27 industry icons are packaged separately from source WebPs", async () => {
  const project = require("../../project.config.json");
  const base = path.join(root, "miniprogram");
  const rules = project.packOptions;
  function matches(file, rule) {
    if (rule.type === "file") return file === rule.value;
    if (rule.type === "folder") return file.startsWith(rule.value + "/");
    if (rule.type === "suffix") return file.endsWith(rule.value);
    if (rule.type === "prefix") return file.startsWith(rule.value);
    return false;
  }
  const artIds = catalog.projects.map((item) => item.id);
  assert.equal(new Set(artIds).size, 418);
  artIds.push("memorial-create", "memorial-manage", "memorial-remembrance");
  const hashes = new Set();
  for (const id of artIds) {
    const descriptor = assets.describe(id);
    const file = descriptor.displayPath.slice(1);
    assert.ok(rules.include.some((rule) => matches(file, rule)), file);
    assert.ok(!rules.ignore.some((rule) => matches(file, rule)), file);
    assert.ok(rules.ignore.some((rule) => matches(descriptor.path.slice(1), rule)), descriptor.path);
    const bytes = fs.readFileSync(path.join(base, file));
    const info = await sharp(bytes).metadata();
    assert.equal(info.format, "png", id);
    if (!id.startsWith("memorial-")) {
      assert.deepEqual([info.width, info.height, info.hasAlpha], [92, 92, true], id);
      assert.equal(descriptor.displayFrame, "transparent", id);
      const rgba = await sharp(bytes).ensureAlpha().raw().toBuffer();
      let clear = 0;
      let visible = 0;
      for (let i = 3; i < rgba.length; i += 4) {
        clear += Number(rgba[i] === 0);
        visible += Number(rgba[i] > 220);
      }
      assert.ok(clear > info.width * info.height * 0.15 && visible > 50, id);
    } else {
      assert.ok(info.width > 0 && info.height > 0 && info.width <= 112 && info.height <= 112, id);
    }
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    assert.ok(!hashes.has(hash), id);
    hashes.add(hash);
  }

  assert.equal(artIds.filter((id) => assets.describe(id).displayFrame === "transparent").length, 418);
  for (const category of catalog.categories) {
    const file = "assets/publish-industry/" + category.id + ".png";
    assert.ok(rules.include.some((rule) => matches(file, rule)), file);
    const info = await sharp(path.join(base, file)).metadata();
    assert.deepEqual([info.format, info.width, info.height, info.hasAlpha], ["png", 64, 64, true]);
  }

  const sizes = { main: 0, art: 0 };
  const entries = fs.readdirSync(base, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filename = path.join(entry.path, entry.name);
    const file = path.relative(base, filename).split(path.sep).join("/");
    if (rules.ignore.some((rule) => matches(file, rule))) continue;
    sizes[file.startsWith("category-art/") ? "art" : "main"] += fs.statSync(filename).size;
  }
  for (const [name, bytes] of Object.entries(sizes))
    assert.ok(bytes < 2 * 1024 * 1024, name + " source package: " + bytes);
});

test("publish catalog images retain a fallback and the memorial banner is available in the main package", () => {
  const config = require("../../miniprogram/pages/publish/index.json");
  assert.equal(config.usingComponents["catalog-image"], "/category-art/components/catalog-image/index");
  assert.equal(config.usingComponents["catalog-image-fallback"], "/components/catalog-image/index");
  assert.equal(config.componentPlaceholder["catalog-image"], "catalog-image-fallback");
  const memorial = fs.readFileSync(path.join(root, "miniprogram/pages/memorial/index.wxml"), "utf8");
  assert.match(memorial, /src="\/assets\/memorial-landscape\.jpg"/);
  assert.ok(fs.existsSync(path.join(root, "miniprogram/assets/memorial-landscape.jpg")));
});

function component() {
  let definition;
  const box = {
    Component: (value) => (definition = value),
    require: () => ({ describe: assets.describe }),
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(
        root,
        "miniprogram/category-art/components/catalog-image/index.js",
      ),
      "utf8",
    ),
    box,
  );
  const instance = {
    properties: {
      assetId: "C04G01S01",
      fallbackSrc: "/assets/icons/project-phone-prism.png",
      preferFallback: false,
    },
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  for (const [name, method] of Object.entries(definition.methods))
    instance[name] = method.bind(instance);
  return { instance, definition };
}

test("catalog cards select supplied artwork by ID and fall back when an image fails", () => {
  const { instance } = component();
  instance.refresh();
  assert.equal(instance.data.src, assets.describe("C04G01S01").displayPath);
  assert.equal(instance.data.stage, "supplied3d");
  assert.equal(instance.data.frame, "transparent");
  for (const id of ["C09G01S01", "C10G01S01", "C19G01S01", "C27G01S01"]) {
    instance.properties.assetId = id;
    instance.refresh();
    assert.equal(instance.data.frame, "transparent", id);
    assert.equal(instance.data.src, "/category-art/images/" + id + ".png", id);
  }
  instance.properties.assetId = "C23G01S01";
  instance.refresh();
  assert.equal(instance.data.frame, "transparent");
  instance.properties.assetId = "C01G01S01";
  instance.refresh();
  assert.equal(instance.data.frame, "transparent");
  instance.properties.assetId = "C06G01S01";
  instance.refresh();
  assert.equal(instance.data.frame, "transparent");
  assert.match(instance.data.src, /C06G01S01\.png$/);
  instance.properties.assetId = "C15G01S01";
  instance.refresh();
  assert.equal(instance.data.stage, "supplied3d");
  assert.equal(instance.data.frame, "transparent");
  instance.properties.assetId = "C05G01S02";
  instance.refresh();
  assert.equal(instance.data.frame, "transparent");
  instance.properties.assetId = "C05G01S01";
  instance.properties.preferFallback = true;
  instance.properties.fallbackSrc = "/assets/publish/new-home.png";
  instance.refresh();
  assert.equal(instance.data.src, "/assets/publish/new-home.png");
  assert.equal(instance.data.stage, "existing");
  assert.equal(instance.data.frame, "plain");
  instance.imageLoaded();
  assert.equal(instance.data.imageReady, true);
  instance.refresh();
  assert.equal(instance.data.imageReady, true);
  instance.properties.preferFallback = false;
  instance.properties.assetId = "C04G01S01";
  instance.properties.fallbackSrc = "/assets/icons/project-phone-prism.png";
  instance.refresh();
  assert.equal(instance.data.imageReady, false);
  instance.imageFailed();
  assert.equal(instance.data.src, instance.properties.fallbackSrc);
  assert.equal(instance.data.frame, "plain");
  instance.imageFailed();
  assert.equal(instance.data.src, "");
});
