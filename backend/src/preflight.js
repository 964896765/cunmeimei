'use strict';
const {validateDeployment}=require('./deployment-check');
const check=validateDeployment(process.env,undefined,{requireProduction:!process.argv.includes('--development')});
console.log(JSON.stringify({mode:process.env.NODE_ENV||'unset',configurationValid:check.ok,errors:check.errors},null,2));
if(!check.ok)process.exitCode=1;
