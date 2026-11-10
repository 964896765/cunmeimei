'use strict';
function decodeQuery(value,max=80){if(typeof value!=='string')return'';try{return decodeURIComponent(value).slice(0,max);}catch{return value.slice(0,max);}}
module.exports={decodeQuery};
