'use strict';
// Small project-authored vector navigation assets, rasterized for native TabBar compatibility.
const sharp=require('../backend/node_modules/sharp'),path=require('node:path'),fs=require('node:fs');
const {palettes,iconPalettes,resolvePalette}=require('../miniprogram/utils/palettes');
const paths=require('./navigation-icon-paths');
const controls={bell:'M7 22h18l-3-5v-6a6 6 0 0 0-12 0v6zM13 27h6',copy:'M11 10h16v18H11zM6 21H4V4h16v2',shield:'M16 3l11 4v9c0 6-11 13-11 13S5 22 5 16V7zM11 15l4 4 7-8',info:'M16 3a13 13 0 1 0 0 26a13 13 0 1 0 0-26M16 14v9M16 9v1'};
async function icon(name,d,color,colors=palettes.prism){
 const filledPublish=name.startsWith('publish');
 const svg=filledPublish?`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors['glow-start']}"/><stop offset=".5" stop-color="${colors.surface}"/><stop offset="1" stop-color="${colors.glow}"/></linearGradient></defs><circle cx="16" cy="16" r="13.5" fill="url(#glass)" stroke="${color}" stroke-width="1.2"/><path d="M16 10v12M10 16h12" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`:`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
 await sharp(Buffer.from(svg)).png().toFile(path.join(__dirname,'../miniprogram/assets/icons/'+name+'.png'));
}
(async()=>{
 for(const [name,d] of Object.entries(paths)){
  for(const [theme,colors] of Object.entries(iconPalettes)){
   const selected=theme==='prism'?resolvePalette('prism','pages/'+name+'/index'):colors;
   await icon(name+'-'+theme,d,selected.brand,selected);
  }
  await icon(name,d,palettes.prism.muted);
  const selected=resolvePalette('prism','pages/'+name+'/index');
  await icon(name+'-active',d,selected.brand,selected);
 }
 for(const [name,d] of Object.entries(controls)){
  for(const [theme,colors] of Object.entries(iconPalettes))await icon('ui-'+name+'-'+theme,d,colors.brand,colors);
 }
 // Native cold-start configuration and CSS fallback use the same palette as runtime.
 const appPath=path.join(__dirname,'../miniprogram/app.json');
 const app=JSON.parse(fs.readFileSync(appPath,'utf8')),c=palettes.prism;
 app.window.navigationBarBackgroundColor=c.background;app.window.backgroundColor=c.background;
 app.tabBar.color=c.muted;app.tabBar.selectedColor=c.link;app.tabBar.backgroundColor=c.surface;
 fs.writeFileSync(appPath,JSON.stringify(app,null,2)+'\n');
 const cssPath=path.join(__dirname,'../miniprogram/app.wxss');
 const css=fs.readFileSync(cssPath,'utf8').replace(/^(page\s*\{)([^}]*)(\})/m,(_,open,body,close)=>{
  for(const [key,value] of Object.entries(c)){
   const pattern=new RegExp('--'+key+':[^;]+;');
   body=pattern.test(body)?body.replace(pattern,'--'+key+':'+value+';'):body+' --'+key+':'+value+'; ';
  }
  return open+body+close;
 });
 fs.writeFileSync(cssPath,css);
 console.log('PASS: page-aware navigation and utility icons, light glass plus, native/CSS fallback colors generated from shared palettes');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
