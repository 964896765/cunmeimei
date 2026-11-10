'use strict';
const sharp=require('../backend/node_modules/sharp'),path=require('node:path');
const {palettes,resolvePalette}=require('../miniprogram/utils/palettes');
(async()=>{
 const variants={...palettes,'prism-home':resolvePalette('prism','pages/home/index')};
 for(const [name,c]of Object.entries(variants)){
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 32 32"><g fill="none" stroke="'+c.muted+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M26 13c0 8-10 16-10 16S6 21 6 13a10 10 0 0 1 20 0Z"/><circle cx="16" cy="13" r="3.5"/></g></svg>';
  await sharp(Buffer.from(svg)).png().toFile(path.resolve(__dirname,'../miniprogram/assets/icons/location-'+name+'.png'));
 }
 console.log('PASS location icon generated in existing theme colors');
})().catch(e=>{console.error(e.message);process.exitCode=1});
