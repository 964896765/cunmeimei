'use strict';

const path = require('node:path');
const sharp = require('../backend/node_modules/sharp');
const {iconPalettes} = require('../miniprogram/utils/palettes');

async function build() {
  const outline = 'M4 3h16a1 1 0 0 1 1 1v2l-7 7v7a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-7L3 6V4a1 1 0 0 1 1-1z';
  for (const [theme, colors] of Object.entries(iconPalettes)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24"><path d="${outline}" fill="none" stroke="${colors.link}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    await sharp(Buffer.from(svg)).png({palette:true}).toFile(path.resolve(__dirname, '../miniprogram/assets/icons/filter-' + theme + '.png'));
  }
  console.log('Built filter outline in the six existing theme colors.');
}

build().catch(error => { console.error(error.message); process.exitCode = 1; });
