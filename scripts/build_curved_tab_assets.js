'use strict';
// Shared line geometry and PRISM GLASS palette for the custom navigation.
const sharp=require('../backend/node_modules/sharp'),path=require('node:path');
const {palettes,resolvePalette}=require('../miniprogram/utils/palettes');
const shapes=require('./navigation-icon-paths');
async function png(name,svg){await sharp(Buffer.from(svg)).png().toFile(path.resolve(__dirname,'../miniprogram/assets/icons/'+name+'.png'));}
async function icon(name,color,suffix){const drawing='<path d="'+(name==='publish'?'M16 8v16M8 16h16':shapes[name])+'" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';await png('nav-'+name+suffix,`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 32 32">${drawing}</svg>`);}
(async()=>{
 for(const name of ['home','discover','publish','messages','me']){
  await icon(name,palettes.prism.muted,'');
  for(const theme of Object.keys(palettes))await icon(name,resolvePalette(theme,'pages/'+name+'/index').brand,'-'+theme);
 }
 for(const [theme,c]of Object.entries(palettes)){
  const edge=theme==='dark'?'rgba(255,255,255,.2)':c.border;
  await png('nav-curve-'+theme,`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="34" viewBox="0 0 960 34"><path d="M0 32H380C423 32 426 2 480 2S537 32 580 32H960V34H0Z" fill="${c.surface}"/><path d="M0 32H380C423 32 426 2 480 2S537 32 580 32H960" fill="none" stroke="${edge}" stroke-width="1"/></svg>`);
 }
 console.log('PASS curved divider and five line icons generated from the shared palette');
})().catch(e=>{console.error(e.message);process.exitCode=1});
