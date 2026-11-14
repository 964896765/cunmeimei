'use strict';
const notice = require('../../src/publication-notice');
const rules = require('../../../miniprogram/utils/publication-review-rules');

// These fixtures represent an explicit checkbox confirmation and completed manual checks.
// Tests of missing/stale consent use raw HTTP requests and never call this helper.
function acceptedConsent() {
 const document = notice.document();
 return {accepted:true,version:document.version,hash:document.hash};
}
function acceptedPublication(value) {
 return {publicationConsent:acceptedConsent(),...value};
}
function completedSectorChecks() {
 const projects=['C01','C02','C05','C12','C13','C15','C27'];
 const checks=[...projects.map(projectId=>rules.resolve({projectId})),rules.resolve({}),rules.resolve({type:'used'}),rules.resolve({policy:'MERCHANT_SERVICE'})].flatMap(rule=>rule.checks);
 return Object.fromEntries(checks.map(check=>[check.key,true]));
}
function acceptedFixtureRequest(route,method,value) {
 if(!value||typeof value!=='object')return value;
 const publication = method==='POST'&&route==='/api/v1/publications' || method==='PUT'&&/^\/api\/v1\/me\/publications\//.test(route);
 const service = ['POST','PUT'].includes(method)&&/^\/api\/v1\/merchants\/[^/]+\/services(?:\/[^/]+)?$/.test(route);
 const submission = /\/api\/v1\/industry\/entries/.test(route)&&value.action==='submit' || /\/services\/[^/]+\/action$/.test(route)&&value.action==='resubmit';
 if(publication||service||submission)value=acceptedPublication(value);
 if(route.startsWith('/admin/api/')&&['published','verified'].includes(value.status))value={...completedSectorChecks(),...value};
 return value;
}
module.exports={acceptedConsent,acceptedPublication,completedSectorChecks,acceptedFixtureRequest};
