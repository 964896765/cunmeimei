'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {ApiError} = require('./rules');

const version = 'publication-1.0-20261114';
const content = fs.readFileSync(path.join(__dirname, '../legal/publication-notice.md'), 'utf8');
const hash = crypto.createHash('sha256').update(content).digest('hex');

function document() {
 return {version, hash, title:'信息发布须知与承诺', content};
}

function validate(value) {
 if (value?.accepted !== true || value.version !== version || value.hash !== hash) {
  throw new ApiError(400, 'PUBLICATION_CONSENT_REQUIRED', '请阅读当前版本《信息发布须知》，勾选承诺后再提交审核。');
 }
 return {accepted:true, version, hash};
}

module.exports = {document, validate};
