'use strict';
// Fixed-window failed-password guard for an individual API process.
// It is NOT a distributed rate limiter; a gateway/shared store is required for
// production deployments using multiple instances.
function createAdminLoginLimiter({maxFailures=5,windowMs=15*60*1000,maxKeys=2048,clock=Date.now}={}){
 if(!Number.isSafeInteger(maxFailures)||maxFailures<1||!Number.isSafeInteger(windowMs)||windowMs<1||!Number.isSafeInteger(maxKeys)||maxKeys<1)throw new TypeError('Invalid limiter options');
 const states=new Map();
 function clean(now){
  for(const [key,state] of states)if(state.expiresAt<=now)states.delete(key);
 }
 function blocked(key){
  const now=clock();
  const state=states.get(key);
  if(state&&state.expiresAt<=now)states.delete(key);
  if(states.size>=maxKeys&&!states.has(key))clean(now);
  return (states.size>=maxKeys&&!states.has(key)) || (states.get(key)?.failures>=maxFailures);
 }
 function failure(key){
  const now=clock();
  if(states.size>=maxKeys&&!states.has(key))clean(now);
  if(states.size>=maxKeys&&!states.has(key))return false;
  const prior=states.get(key);
  const failures=prior&&prior.expiresAt>now?prior.failures+1:1;
  states.set(key,{failures,expiresAt:prior&&prior.expiresAt>now?prior.expiresAt:now+windowMs});
  return failures>=maxFailures;
 }
 function success(key){states.delete(key);}
 return {blocked,failure,success};
}
// Caps idle memory for short-lived maps keyed by user or session token.
function pruneExpired(map,expireKey,now=Date.now(),threshold=512){
 if(map.size<threshold)return;
 for(const [key,value] of map){if(value?.[expireKey]<=now)map.delete(key);}
}
module.exports={createAdminLoginLimiter,pruneExpired};
