'use strict';
const aliases=Object.freeze({business:'me','publish-form':'publish',drafts:'publish',verification:'me',search:'discover',categories:'publish',map:'regions',information:'home',commerce:'me',industry:'publish',login:'me',legal:'me'});
function accentRoute(route=''){const name=String(route).replace(/^\//,'').split('/')[1];return aliases[name]?'pages/'+aliases[name]+'/index':route;}
module.exports={aliases,accentRoute};
