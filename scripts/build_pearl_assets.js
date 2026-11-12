'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../backend/node_modules/sharp');
const {iconPalettes} = require('../miniprogram/utils/palettes');

const destination = path.resolve(__dirname, '../miniprogram/assets/icons');
const atlasIds = ['C01','C02','C03','C04','C05','C06','C07','C08','C09','C10','C11','C12','C13','C14','C15','C18','C16','C17','C19','C20','C21','C22','C23','C24','C25','C26','C27','more'];

async function build() {
  const atlasPath = process.argv[3];
  if (!atlasPath) throw Error('Supply the publish illustration and the generated 4-column, 7-row category atlas.');
  const atlas = await fs.readFile(atlasPath);
  const {width, height} = await sharp(atlas).metadata();
  for (const [index, id] of atlasIds.entries()) {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const left = Math.round(column * width / 4);
    // Export at the transparent gutters of the approved generated atlas.
    const rowEdges = [0, 274, 519, 756, 978, 1208, 1434, 1659].map(value => Math.round(value * height / 1659));
    const top = rowEdges[row];
    const cell = {left, top, width:Math.round((column + 1) * width / 4) - left, height:rowEdges[row + 1] - top};
    const name = id === 'more' ? 'shortcut-more-pearl.png' : `industry-${id}-pearl.png`;
    await sharp(atlas).extract(cell).resize(108, 108, {fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png({palette:true,quality:95}).toFile(path.join(destination, name));
  }
  for (const [palette, colors] of Object.entries(iconPalettes)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 32 32"><g fill="${colors.link}"><circle cx="7" cy="16" r="2.4"/><circle cx="16" cy="16" r="2.4"/><circle cx="25" cy="16" r="2.4"/></g></svg>`;
    await sharp(Buffer.from(svg)).png({palette:true}).toFile(path.join(destination, `shortcut-more-${palette}.png`));
  }
  const source = process.argv[2];
  if (source) {
    await sharp(await fs.readFile(source)).resize(320, 320, {fit:'inside'}).png({palette:true,quality:90}).toFile(path.resolve(destination, '../publish-checklist.png'));
  }
  console.log('Built 27 illustrated category icons and fixed More icons.');
}

build().catch(error => { console.error(error.message); process.exitCode = 1; });
