'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {ApiError} = require('./rules');
const BRAND = '青方睐村美美';
const OPERATOR = '东莞市石排青方睐软件中心（个体工商户）';
const TERMS = 'terms-1.0-20261113';
const PRIVACY = 'privacy-1.1-20261124';
const termsTemplate = fs.readFileSync(path.join(__dirname,'../legal/user-service-agreement.md'),'utf8');
const privacyTemplate = fs.readFileSync(path.join(__dirname,'../legal/privacy-policy.md'),'utf8');

function documents(config = {}) {
 const operatorName = String(config.operatorName || process.env.PLATFORM_OPERATOR_NAME || OPERATOR).trim();
 const contactEmail = String(config.contactEmail || process.env.PRIVACY_CONTACT_EMAIL || '').trim();
 const contactAddress = String(config.contactAddress || process.env.PLATFORM_CONTACT_ADDRESS || '').trim();
 const contactPhone = String(config.contactPhone || process.env.PLATFORM_CONTACT_PHONE || '').trim();
 const configured = operatorName.length >= 2 && operatorName.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);
 const values = {
  OPERATOR:operatorName,
  ADDRESS:contactAddress || '【填写运营主体有效联系地址】',
  PHONE:contactPhone || '【填写平台客服电话】',
  CONTACT_EMAIL:contactEmail || '【填写平台官方邮箱】',
  PRIVACY_EMAIL:contactEmail || '【填写平台隐私保护联系邮箱】'
 };
 const render = template => template.replace(/\{\{([A-Z_]+)\}\}/g, (token,key) => values[key] ?? token);
 const terms = render(termsTemplate);
 const privacy = render(privacyTemplate);
 const hash = crypto.createHash('sha256').update(JSON.stringify([TERMS,PRIVACY,terms,privacy])).digest('hex');
 return {brand:BRAND,configured,operatorName,contactEmail,termsVersion:TERMS,privacyVersion:PRIVACY,hash,terms,privacy};
}

function consent(value, docs) {
 if (!docs.configured) throw new ApiError(503,'LEGAL_NOT_CONFIGURED','运营主体与隐私联系渠道尚未配置，请稍后重试或继续浏览');
 if (value.consent !== true || value.termsVersion !== docs.termsVersion || value.privacyVersion !== docs.privacyVersion || value.legalHash !== docs.hash) {
  throw new ApiError(400,'LEGAL_CONSENT_REQUIRED','请先阅读并确认当前用户协议和隐私政策');
 }
 return {termsVersion:docs.termsVersion,privacyVersion:docs.privacyVersion,hash:docs.hash};
}
module.exports = {documents,consent,BRAND};
