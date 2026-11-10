'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const sharp=require('sharp');
require('../../scripts/devtools_image_compat');
const {decodeQrCode}=require('miniprogram-automator/out/util');
const QRCode=require('qrcode-terminal/vendor/QRCode');
test('patched automator dependencies decode generated PNG and JPEG QR images',async()=>{
 const value='citylife-local-dependency-compatibility';
 const code=new QRCode(-1,1);code.addData(value);code.make();
 const count=code.getModuleCount(),scale=8,border=4,width=(count+border*2)*scale;
 const pixels=Buffer.alloc(width*width,255);
 for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(code.isDark(y,x)){
  for(let row=0;row<scale;row++)pixels.fill(0,((y+border)*scale+row)*width+(x+border)*scale,((y+border)*scale+row)*width+(x+border+1)*scale);
 }
 for(const format of ['png','jpeg']){
  const image=await sharp(pixels,{raw:{width,height:width,channels:1}})[format]().toBuffer();
  assert.equal(await decodeQrCode(image.toString('base64')),value,format);
 }
});
