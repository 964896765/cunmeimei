'use strict';
// Personal workspace line icons inherit existing theme colors; no new palette.
const sharp=require('../backend/node_modules/sharp'),path=require('node:path');
const {iconPalettes}=require('../miniprogram/utils/palettes');
const shapes={
 notifications:'<path d="M7 13a9 9 0 0 1 18 0v8l3 4H4l3-4ZM12 29h8M16 1v3"/>',
 data:'<ellipse cx="16" cy="6" rx="11" ry="4"/><path d="M5 6v20c0 6 22 6 22 0V6M5 16c0 6 22 6 22 0"/>',
 about:'<circle cx="16" cy="16" r="13"/><path d="M16 14v10M16 8v1"/>',
 trash:'<path d="M4 8h24M12 8V3h8v5M7 8l2 21h14l2-21M13 13v11M19 13v11"/>',
 profile:'<circle cx="16" cy="9" r="6"/><path d="M5 29c0-14 22-14 22 0"/>',
 posts:'<path d="M8 3h13l5 5v19a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 2-3Z"/><path d="M12 13h9M12 19h6"/>',
 draft:'<path d="M14 5H8a4 4 0 0 0-4 4v15a4 4 0 0 0 4 4h15a4 4 0 0 0 4-4v-6M13 20l1-6L25 3l5 5-11 11-6 1Z"/>',
 saved:'<path d="M16 29 5 18C-4 7 8-3 16 6 24-3 36 7 27 18Z"/>',
 booking:'<rect x="4" y="6" width="24" height="23" rx="3"/><path d="M10 2v8M22 2v8M4 14h24m-19 7 4 4 8-7"/>',
 points:'<circle cx="12" cy="12" r="8"/><path d="M11 8h2v8m9-3a8 8 0 1 1-9 12m11-7-4 5h-3"/>',
 merchant:'<path d="m3 10 5-7h16l5 7v5c-2 3-5 3-7 0-2 3-5 3-7 0-2 3-5 3-7 0-2 3-5 3-5 0ZM6 19v11h20V19M13 30V21h7v9M3 10h26"/>',
 history:'<circle cx="16" cy="16" r="13"/><path d="M16 7v10h8"/>',
 privacy:'<path d="m16 2 11 5v10c0 7-7 12-11 14C12 29 5 24 5 17V7Z"/><path d="m11 16 4 4 7-9"/>',
 settings:'<path d="M3 9h8m7 0h11M3 23h14m7 0h5"/><circle cx="14" cy="9" r="4"/><circle cx="20" cy="23" r="4"/>',
 help:'<circle cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="7"/><path d="m7 7 4 4m10 10 4 4M7 25l4-4M21 11l4-4"/>'
};
(async()=>{for(const [theme,c]of Object.entries(iconPalettes))for(const [name,shape]of Object.entries(shapes)){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 32 32"><g fill="none" stroke="'+c.muted+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+shape+'</g></svg>';
 await sharp(Buffer.from(svg)).png().toFile(path.resolve(__dirname,'../miniprogram/assets/icons/center-'+name+'-'+theme+'.png'));
}console.log('PASS personal workspace icons generated from frozen theme colors');})().catch(e=>{console.error(e.message);process.exitCode=1});
