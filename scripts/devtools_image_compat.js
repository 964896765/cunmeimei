'use strict';
// Automator 0.13 only uses Jimp.read(buffer).bitmap for QR decoding.
// Jimp 1 exposes that same reader on the named class. Supply the legacy export
// without retaining the vulnerable Jimp 0.x image/dependency tree.
const {createRequire}=require('node:module');
const fromAutomator=createRequire(require.resolve('../backend/node_modules/miniprogram-automator'));
const images=fromAutomator('jimp');
const reader={read:images.Jimp.read.bind(images.Jimp)};
// Jimp 1 marks its exports as __esModule; automator's TS helper consequently
// reads .default instead of wrapping the object itself.
if(typeof images.default?.read!=='function')images.default=reader;
module.exports=reader;
