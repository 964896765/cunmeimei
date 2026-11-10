'use strict';
// Only navigation geometry changes. Existing frozen colors and native fallback assets stay intact.
const sharp=require('../backend/node_modules/sharp'),path=require('node:path');
const {palettes,resolvePalette}=require('../miniprogram/utils/palettes');
const shapes={
 home:'M3 14 16 3l13 11h-4v15h-7V19h-5v10H7V14z',
 discover:'M3 6 12 3l9 4 8-4v23l-8 4-9-4-9 3zm11 0v18l5 2V9z',
 messages:'M6 3h21a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H13L3 32V6a3 3 0 0 1 3-3zm3 6v3h15V9zm0 6v3h15v-3z',
 me:'M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10m13 1a4 4 0 1 1 0 8 4 4 0 0 1 0-8M1 28v-4c0-6 22-6 22 0v4zm24 0v-4c0-3-2-5-5-6 6-2 12 1 12 5v5z'
};
async function png(name,svg){await sharp(Buffer.from(svg)).png().toFile(path.resolve(__dirname,'../miniprogram/assets/icons/'+name+'.png'));}
async function icon(name,color,suffix){const drawing=name==='publish'?`<path d="M16 4v24M4 16h24" stroke="${color}" stroke-width="3.2"/>`:`<path d="${shapes[name]}" fill="${color}" fill-rule="evenodd"/>`;await png('nav-'+name+suffix,`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 32 32">${drawing}</svg>`);}
(async()=>{
 for(const name of ['home','discover','publish','messages','me']){
  await icon(name,palettes.prism.muted,'');
  for(const theme of Object.keys(palettes))await icon(name,resolvePalette(theme,'pages/'+name+'/index').brand,'-'+theme);
 }
 for(const [theme,c]of Object.entries(palettes)){
  const edge=theme==='dark'?'rgba(255,255,255,.2)':'#D7D7D7';
  await png('nav-curve-'+theme,`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="34" viewBox="0 0 960 34"><path d="M0 32H380C423 32 426 2 480 2S537 32 580 32H960V34H0Z" fill="${c.surface}"/><path d="M0 32H380C423 32 426 2 480 2S537 32 580 32H960" fill="none" stroke="${edge}" stroke-width="1"/></svg>`);
 }
 console.log('PASS curved divider and five icon silhouettes generated from unchanged frozen colors');
})().catch(e=>{console.error(e.message);process.exitCode=1});
