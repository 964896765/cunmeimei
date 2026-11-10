'use strict';
const {validateDeployment}=require('./deployment-check');
const check=validateDeployment(process.env);
console.log(JSON.stringify({mode:process.env.NODE_ENV||'development',configurationValid:check.ok,errors:check.errors},null,2));
if(!check.ok)process.exitCode=1;
