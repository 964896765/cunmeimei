'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
module.exports=function loadStore(wx,runtime={apiBaseUrl:'http://127.0.0.1:3101'}){
 const target={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/booking-pending.js'),'utf8'),{wx,module:target,require:name=>name==='./runtime'?runtime:require(path.resolve(__dirname,'../../miniprogram/utils',name))});
 return target.exports;
};
