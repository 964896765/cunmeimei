'use strict';
// Transport tests explicitly accept the login UI. Broker/navigation tests use the real module.
module.exports=function acceptedLogin(getApi,consent={}){let active=null;
 return {request(){const nonce='accepted-'+Math.random();active=nonce;return getApi().completeLogin(nonce,consent).then(r=>r.token);},isCurrent:n=>active===n,cancel(){active=null;},cancelPhone(){},notifyReplay(){}};
};
