'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {documents,consent}=require('../src/legal-documents');
const {blocks}=require('../../miniprogram/utils/legal-content');

test('supplied agreements expose every chapter with the current version and requested contact placeholders',()=>{
 const docs=documents({contactEmail:'【填写平台隐私保护联系邮箱】'});
 assert.equal(docs.configured,false);
 assert.match(docs.operatorName,/东莞市石排青方睐软件中心/);
 assert.equal((docs.terms.match(/^## 第/gm)||[]).length,14);
 assert.equal((docs.privacy.match(/^## 第/gm)||[]).length,13);
 assert.ok(docs.terms.includes('【填写运营主体有效联系地址】'));
 assert.ok(docs.privacy.includes('【填写平台客服电话】'));
 assert.ok(!docs.terms.includes('{{'));
 assert.equal(docs.termsVersion,'terms-1.0-20261113');
 assert.equal(docs.privacyVersion,'privacy-1.1-20261124');
 assert.match(docs.privacy,/阿里云国内短信服务处理该次短信的接收号码和验证码/);
});

test('contact and agreement changes are included in the login consent hash',()=>{
 const before=documents({operatorName:'隔离测试主体',contactEmail:'privacy@example.test'});
 const after=documents({operatorName:'隔离测试主体',contactEmail:'privacy@example.test',contactAddress:'隔离测试地址',contactPhone:'测试电话'});
 assert.notEqual(before.hash,after.hash);
 assert.throws(()=>consent({consent:true,termsVersion:before.termsVersion,privacyVersion:before.privacyVersion,legalHash:before.hash},after),{code:'LEGAL_CONSENT_REQUIRED'});
 assert.equal(consent({consent:true,termsVersion:after.termsVersion,privacyVersion:after.privacyVersion,legalHash:after.hash},after).hash,after.hash);
});

test('legal reading preserves text while rendering headings, emphasis and list markers as native text',()=>{
 const value=blocks('# 标题\n\n## 第一条\n**版本：V1.0**\n- 内容\n<script>text only</script>');
 assert.deepEqual(value.map(block=>block.kind),['heading-1','heading-2','paragraph','bullet','paragraph']);
 assert.equal(value[2].text,'版本：V1.0');
 assert.equal(value[4].text,'<script>text only</script>');
});
