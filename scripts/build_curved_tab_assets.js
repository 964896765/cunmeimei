'use strict';
// Shared line geometry and PRISM GLASS palette for the custom navigation.
const sharp=require('../backend/node_modules/sharp'),path=require('node:path');
const {palettes,resolvePalette}=require('../miniprogram/utils/palettes');
const shapes=require('./navigation-icon-paths');
async function png(name,svg){await sharp(Buffer.from(svg)).png().toFile(path.resolve(__dirname,'../miniprogram/assets/icons/'+name+'.png'));}
async function icon(name,color,suffix){
 const selected=!!suffix;
 let drawing='<path d="'+(name==='publish'?'M16 8v16M8 16h16':shapes[name])+'" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
 if(selected&&name==='home')drawing='<path d="M3 14 16 3l13 11h-5v14h-6v-9h-4v9H8V14z" fill="'+color+'" stroke="'+color+'" stroke-linejoin="round"/>';
 if(selected&&name==='me')drawing='<g fill="'+color+'"><circle cx="16" cy="9" r="6"/><path d="M5 28v-3a11 9 0 0 1 22 0v3z"/></g>';
 if(selected&&name==='messages')drawing='<path d="M9 5h14a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5H13l-6 5v-5a5 5 0 0 1-3-5v-9a5 5 0 0 1 5-5z" fill="'+color+'"/><g fill="#FFFFFF"><circle cx="10" cy="14" r="1.4"/><circle cx="16" cy="14" r="1.4"/><circle cx="22" cy="14" r="1.4"/></g>';
 await png('nav-'+name+suffix,`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 32 32">${drawing}</svg>`);
}

(async()=>{
 for(const name of ['home','discover','publish','messages','me']){
  await icon(name,palettes.prism.muted,'');
  for(const theme of Object.keys(palettes)){
   const colors=resolvePalette(theme,'pages/'+name+'/index');
   await icon(name,['home','me','messages'].includes(name)?colors.link:theme==='dark'?colors.background:'#FFFFFF','-'+theme);
  }
 }
 for(const [theme,c]of Object.entries(palettes)){
  const edge=theme==='dark'?'rgba(255,255,255,.2)':c.border;
  await png('nav-curve-'+theme,`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="34" viewBox="0 0 960 34"><path d="M0 32H380C423 32 426 2 480 2S537 32 580 32H960V34H0Z" fill="${c.surface}"/><path d="M0 32H380C423 32 426 2 480 2S537 32 580 32H960" fill="none" stroke="${edge}" stroke-width="1"/></svg>`);
 }
 console.log('PASS curved divider and five line icons generated from the shared palette');
})().catch(e=>{console.error(e.message);process.exitCode=1});
