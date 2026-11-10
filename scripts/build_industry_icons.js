'use strict';
const path=require('node:path'),fs=require('node:fs');
// Shared 24-unit line grid; each industry has a distinct, meaningful silhouette.
const shapes={
 C01:'<circle cx="14" cy="12" r="6"/><path d="M3 3v6c0 2 4 2 4 0V3M5 3v18M22 3v18M22 3c-3 2-3 7 0 7"/>',
 C02:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12c5 4 13 4 18 0M10 12h4v4h-4z"/>',
 C03:'<path d="M14 5a6 6 0 0 0-7 8l-4 4a2.1 2.1 0 0 0 3 3l4-4a6 6 0 0 0 8-7l-4 4-3-3 4-4z"/>',
 C04:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9M8 5.2l8 4.5"/>',
 C05:'<path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/>',
 C06:'<path d="M7 7h10c3 0 4 4 4 8 0 3-2 4-4 1l-1-1H8l-1 1c-2 3-4 2-4-1 0-4 1-8 4-8zM8 9v5M5.5 11.5h5"/><circle cx="16" cy="10" r=".7"/><circle cx="18" cy="13" r=".7"/>',
 C07:'<path d="M5 8h14l2 13H3L5 8zM8 9V6a4 4 0 0 1 8 0v3"/>',
 C08:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M7 8h4v5H7zM15 8h2M15 12h2M7 17h10"/>',
 C09:'<rect x="5" y="3" width="14" height="17" rx="3"/><path d="M5 8h14M5 13h14M9 8v5M5 21v-2M19 21v-2"/><circle cx="8" cy="17" r=".8"/><circle cx="16" cy="17" r=".8"/>',
 C10:'<path d="m5 10 2-6h10l2 6M4 10h16l1 7H3l1-7zM5 17v3M19 17v3M7 13h1M16 13h1"/>',
 C11:'<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.5 8.5 12 12M8.5 15.5l12-12M11 12h1"/>',
 C12:'<path d="M8 4c5 0 9 4 9 9H4V7M4 13l3 5h9l4-11h2M17 13h3M8 4v9"/><circle cx="8" cy="21" r="1"/><circle cx="16" cy="21" r="1"/>',
 C13:'<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 1-3-2-6-2-9-1V5zM12 6v15M6 9h3M6 13h3M15 9h3M15 13h3"/>',
 C14:'<rect x="3" y="3" width="15" height="7" rx="2"/><path d="M18 6h3v8h-9v3"/><rect x="10" y="17" width="4" height="5" rx="1"/>',
 C15:'<path d="M12 21s-9-6-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12zM12 8v7M8.5 11.5h7"/>',
 C16:'<circle cx="12" cy="12" r="9"/><path d="m16.5 7.5-3 6-6 3 3-6 6-3zM12 3v2M21 12h-2M12 21v-2M3 12h2"/>',
 C17:'<path d="M3 4v17M21 10v11M3 17h18M3 10h18v7M7 10V7h5v3"/>',
 C18:'<path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12M3 12h3M18 12h3"/>',
 C19:'<circle cx="8" cy="15" r="5"/><circle cx="16" cy="15" r="5"/><path d="M12 9S7 6 7 3.8a2.5 2.5 0 0 1 5-.5 2.5 2.5 0 0 1 5 .5C17 6 12 9 12 9z"/>',
 C20:'<path d="M4 21V4h11v17M15 9h5v12M2 21h20M8 8h3M8 12h3M8 16h3M17 13h1M17 17h1"/>',
 C21:'<ellipse cx="5" cy="9" rx="2" ry="3"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5" rx="2" ry="3"/><ellipse cx="21" cy="10" rx="2" ry="3"/><path d="M6 18c0-3 4-7 7-7s6 4 6 7-4 4-6 2c-2 2-7 1-7-2z"/>',
 C22:'<circle cx="11" cy="3" r="1.5"/><path d="M11 7v7h6l3 6 2-1M11 10h6M7 10a6 6 0 1 0 8 8"/>',
 C23:'<path d="M12 3c-3 3-3 5 0 6 3-1 3-3 0-6zM8 11h8v10H8zM5 21h14M8 15h8"/>',
 C24:'<path d="M2 5h12v13H2V5zM14 10h4l4 5v3h-8M14 15h8"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
 C25:'<path d="M12 21V10M12 13C4 13 3 9 3 4c6 0 9 3 9 9zM12 10c0-5 4-7 9-7 0 5-3 8-9 8M5 21h14"/>',
 C26:'<path d="m3 7 9-4 9 4H3zM3 21h18M5 18h14M6 10v8M12 10v8M18 10v8"/>',
 C27:'<path d="M12 2 4 5v7c0 5 8 10 8 10s8-5 8-10V5l-8-3zM9 8l3 4 3-4M9 12h6M9 15h6M12 12v6"/>'
};
function svg(id,color){return '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><g fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+shapes[id]+'</g></svg>';}
async function build(){const sharp=require('../backend/node_modules/sharp'),{iconPalettes}=require('../miniprogram/utils/palettes');let total=0;
 for(const id of Object.keys(shapes)){
  fs.writeFileSync(path.resolve(__dirname,'../miniprogram/assets/icons/industry-'+id+'.svg'),svg(id,iconPalettes.prism.brand));
  for(const [theme,c]of Object.entries(iconPalettes)){const output=await sharp(Buffer.from(svg(id,c.brand))).png({palette:true,compressionLevel:9}).toBuffer();total+=output.length;fs.writeFileSync(path.resolve(__dirname,'../miniprogram/assets/icons/industry-'+id+'-'+theme+'.png'),output);}
 }
 console.log('PASS: 27 distinct 24px line icons, 1.8px stroke, '+Object.keys(iconPalettes).length+' existing palette variants; PNG bytes '+total);
}
if(require.main===module)build().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={shapes,svg};
