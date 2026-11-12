'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../backend/node_modules/sharp');
const {iconPalettes} = require('../miniprogram/utils/palettes');

// Use the existing industry's 24-unit line grid for the four device categories.
const shapes = {
  'project-phone': '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/>',
  'project-laptop': '<rect x="4" y="3" width="16" height="13" rx="1.5"/><path d="m4 16-2 4h20l-2-4M9 20h6"/>',
  'project-tablet': '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M11 19h2"/>',
  'project-headphones': '<path d="M3 15v-3a9 9 0 0 1 18 0v3M3 13h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 1-2M21 13h-3v8h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-1-2"/>',
  'publish-guide': require('./build_industry_icons').shapes.C13,
  'publish-drafts': '<path d="M3 7h18v13H3zM3 7V4h7l2 3M3 11h18"/>',
  'publish-history': '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l5 3"/>',
  'publish-help': '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3v2M12 17v.2"/>',
  'publish-homeware': '<path d="M5 11V7c0-4 14-4 14 0v4M5 12H3v7h18v-7h-2M5 11c2-1 4 0 4 3h6c0-3 2-4 4-3M5 19v2M19 19v2"/>',
  'publish-other': '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  'home-news': '<path d="M4 9h4l7-5v16l-7-5H4zM8 15v6M18 8a6 6 0 0 1 0 8M20 4a11 11 0 0 1 0 16"/>'
};

async function build() {
  const destination = path.resolve(__dirname, '../miniprogram/assets/icons');
  for (const [name, shape] of Object.entries(shapes)) {
    for (const [theme, colors] of Object.entries(iconPalettes)) {
      const fill = name.startsWith('project-') ? 'url(#wash)' : 'none';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24"><defs><linearGradient id="wash" x2="1" y2="1"><stop stop-color="${colors.soft}"/><stop offset="1" stop-color="${colors.brand}" stop-opacity=".24"/></linearGradient></defs><g fill="${fill}" stroke="${colors.link}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
      await sharp(Buffer.from(svg)).png({palette:true}).toFile(path.join(destination, `${name}-${theme}.png`));
    }
  }
  console.log('Built publish and news icons for the six existing themes.');
}

build().catch(error => { console.error(error.message); process.exitCode = 1; });
