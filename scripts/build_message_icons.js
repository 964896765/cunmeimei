'use strict';
// Small line icons use the frozen theme's existing secondary text color.
const sharp=require('../backend/node_modules/sharp'),path=require('node:path');
const {iconPalettes}=require('../miniprogram/utils/palettes');
const shapes={
 contact:'<path d="M7 5h18a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H13l-7 5v-5a3 3 0 0 1-3-3V9a4 4 0 0 1 4-4Z"/><path d="M9 12h14M9 18h9"/>',
 review:'<rect x="7" y="5" width="18" height="25" rx="3"/><rect x="12" y="2" width="8" height="6" rx="1.5"/><path d="m11 19 4 4 7-8"/>',
 calendar:'<rect x="4" y="6" width="24" height="23" rx="3"/><path d="M10 2v8M22 2v8M4 14h24m-19 7 4 4 8-7"/>',
 store:'<path d="m3 10 5-7h16l5 7v5c-2 3-5 3-7 0-2 3-5 3-7 0-2 3-5 3-7 0-2 3-5 3-5 0ZM6 19v11h20V19M13 30V21h7v9M3 10h26"/>',
 points:'<circle cx="12" cy="12" r="8"/><path d="M11 8h2v8m9-3a8 8 0 1 1-9 12m11-7-4 5h-3"/>',
 bell:'<path d="M6 23h20l-3-4v-7a7 7 0 0 0-14 0v7Zm6 4c2 3 6 3 8 0M16 3V1"/>'
};
(async()=>{
 for(const [theme,colors]of Object.entries(iconPalettes))for(const [name,shape]of Object.entries(shapes)){
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 32 32"><g fill="none" stroke="'+colors.muted+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+shape+'</g></svg>';
  await sharp(Buffer.from(svg)).png().toFile(path.resolve(__dirname,'../miniprogram/assets/icons/message-'+name+'-'+theme+'.png'));
 }
 console.log('PASS six message icon shapes generated from unchanged theme tokens');
})().catch(e=>{console.error(e.message);process.exitCode=1});
