'use strict';
function reset(page) {
 page.setData({publicationConsent:null,consentRevision:(page.data.consentRevision||0)+1});
}
function changed(page,event) {
 page.setData({publicationConsent:event.detail.consent||null});
}
function requireConsent(page) {
 if(page.data.publicationConsent?.accepted===true)return page.data.publicationConsent;
 page.setData({error:'请阅读《信息发布须知》，勾选本条信息的真实性承诺。'});
 return null;
}
function recover(page,error) {
 if(error.code!=='PUBLICATION_CONSENT_REQUIRED')return;
 reset(page);
 page.selectComponent?.('#publication-confirmation')?.load?.();
}
module.exports = {reset,changed,requireConsent,recover};
