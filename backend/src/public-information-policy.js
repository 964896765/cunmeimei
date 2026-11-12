'use strict';

const scope = require('../../miniprogram/utils/product-scope');

function eligibilitySql(alias) {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw Error('Invalid publication table alias');
  const practical = scope.practicalInformationProjectIds.map(id => "'" + id + "'").join(',');
  const forums = scope.forumProjectIds.map(id => "'" + id + "'").join(',');
  return `(coalesce(${alias}.attributes->>'categoryId','') NOT IN (${forums}) AND coalesce(${alias}.attributes->>'industryProjectId','') NOT IN (${forums})) AND (${alias}.type <> 'community' OR ${alias}.attributes->>'categoryId' IN (${practical}) OR (${alias}.attributes->>'industryProjectId' IS NOT NULL AND ${alias}.attributes->>'industryProjectId' NOT IN (${forums})))`;
}

module.exports = { eligibilitySql };
