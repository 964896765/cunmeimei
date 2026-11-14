'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');

test('the shared brand PNG has transparency and stays available in the preview package',async()=>{
 const file=path.join(root,'miniprogram/assets/brand-butterfly-transparent.png');
 const {data,info}=await require('sharp')(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(data[3],0);
 assert.equal(data[data.length-1],0);
 assert.ok(info.width>=128&&info.height>=128);
 assert.ok(data.some((value,index)=>index%4===3&&value>240));
 const ignored=require('../../project.config.json').packOptions.ignore.map(item=>item.value);
 assert.ok(!ignored.includes('assets/brand-butterfly-transparent.png'));
 assert.ok(!ignored.includes('assets/icons/industry-C03-pearl.png'));
 assert.ok(ignored.includes('assets/brand-butterfly.jpg'));
});

test('home and the category directory use the same runtime icon palette',()=>{
 for(const page of ['home','categories']){
  const markup=fs.readFileSync(path.join(root,'miniprogram/pages',page,'index.wxml'),'utf8');
  assert.ok(!markup.includes("displayPreferences.theme==='prism'?'pearl'"));
  assert.ok(markup.includes('{{item.icon}}-{{iconPalette}}.png'));
 }
 const app=require('../../miniprogram/app.json');
 assert.equal(app.pages.length,28);
 assert.equal(app.usingComponents['brand-scene'],'/components/brand-scene/index');
});
