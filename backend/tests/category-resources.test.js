"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const catalog = require("../../miniprogram/utils/classification-contract");
const assets = require("../../miniprogram/utils/category-art");
const root = path.resolve(__dirname, "../..");
const manifest = require("../../docs/design/category-resources-2026-11-15/source-manifest.json");
const styled = require("../../docs/design/3d-blending-2026-11-15/assets.json");
const scenes = require("../../docs/design/experience-refinement-2026-11-18/assets.json");

test("all category images have distinct content and rendered replacements retain transparent edges",async()=>{
 const hashes=new Set();
 for(const project of catalog.projects){
  const descriptor=assets.describe(project.id);
  const bytes=fs.readFileSync(path.join(root,"miniprogram",descriptor.path));
  const hash=crypto.createHash("sha256").update(bytes).digest("hex");
  assert.ok(!hashes.has(hash),project.id+" duplicates another category image");
  hashes.add(hash);
  if(descriptor.stage==="rendered3d"){
   const {data,info}=await require("sharp")(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   let clear=0,opaque=0;
   for(let i=3;i<data.length;i+=info.channels){clear+=Number(data[i]===0);opaque+=Number(data[i]>245);}
   assert.ok(clear>info.width*info.height*.15,project.id+" needs transparent padding");
   assert.ok(opaque>16,project.id+" has no visible subject");
  }
 }
 assert.equal(hashes.size,418);
 assert.equal(scenes.items.filter(item=>item.id.startsWith("C12")||item.id.startsWith("C21")).length,26);
});

test("supplied map covers exactly 418 existing projects and preserves 76 draft / 342 placeholder stages", async () => {
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
    const scene = scenes.items.find(asset => asset.id === item.category_id);
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
    const decoded = await require("sharp")(bytes)
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
    const { data, info } = await require("sharp")(bytes)
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
  assert.deepEqual(resourcePackage.pages, []);
  assert.equal(app.pages.length, 28);
  assert.ok(manifest.resourceSubpackageBytes < 2 * 1024 * 1024);
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

test("native asynchronous components have a main-package image fallback on both consumer pages", () => {
  for (const page of ["publish", "memorial"]) {
    const config = require("../../miniprogram/pages/" + page + "/index.json");
    assert.equal(
      config.usingComponents["catalog-image"],
      "/category-art/components/catalog-image/index",
    );
    assert.equal(
      config.usingComponents["catalog-image-fallback"],
      "/components/catalog-image/index",
    );
    assert.equal(
      config.componentPlaceholder["catalog-image"],
      "catalog-image-fallback",
    );
  }
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

test("cards keep original housing art, respond to category changes and handle missing images", () => {
  const { instance } = component();
  instance.refresh();
  assert.equal(instance.data.src, assets.describe("C04G01S01").path);
  assert.equal(instance.data.stage, "styled3d");
  assert.equal(instance.data.frame, "transparent");
  instance.properties.assetId = "C01G01S01";
  instance.refresh();
  assert.equal(instance.data.frame, "food");
  instance.properties.assetId = "C15G01S01";
  instance.refresh();
  assert.equal(instance.data.frame, "symbol");
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
