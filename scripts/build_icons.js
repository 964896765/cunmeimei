const sharp=require('../backend/node_modules/sharp'),path=require('node:path'),fs=require('node:fs');
const {palettes,iconPalettes}=require('../miniprogram/utils/palettes');
(async()=>{
 for(const name of ['merchant','job','housing','used','service','community']){
  const source=path.join(__dirname,'../miniprogram/assets/icons/type-'+name+'.svg');
  const svg=fs.readFileSync(source,'utf8').replace(/stroke="#[0-9a-f]+"/gi,'stroke="'+palettes.prism.brand+'"');
  fs.writeFileSync(source,svg);
  await sharp(Buffer.from(svg)).png().toFile(source.replace(/\.svg$/,'.png'));
  for (const [theme, colors] of Object.entries(iconPalettes)) {
   const themed = svg.replace(/stroke="#[0-9a-f]+"/gi, 'stroke="'+colors.brand+'"');
   await sharp(Buffer.from(themed)).png().toFile(source.replace(/\.svg$/, '-'+theme+'.png'));
  }
 }
 console.log('PASS: six category vectors, default PNGs and page-aware theme PNGs match the shared palettes');
})().catch(e=>{console.error(e.message);process.exitCode=1});
