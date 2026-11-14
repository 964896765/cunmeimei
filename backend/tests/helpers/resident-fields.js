'use strict';

// Complete publication fields for in-memory HTTP regression fixtures.
// PostgreSQL tests replace imageIds with media uploaded by the actual owner.
function residentFields(kind = 'used', imageIds = ['00000000-0000-4000-8000-000000000001']) {
  const attributes = {
    categoryId: {
      used: 'C04G01S01',
      housing: 'C05G01S03',
      community: 'C08G01S01',
      service: 'C03G01S01'
    }[kind],
    categoryVersion: '2.0-audit',
    templateCode: { used: 'GOODS', housing: 'PROPERTY', community: 'PUBLIC', service: 'SERVICE' }[
      kind
    ],
    templateVersion: '3',
    cityCode: '310100',
    districtCode: '310101'
  };
  if (kind !== 'community') attributes.priceMode = 'amount';
  if (kind === 'used') attributes.condition = '正常使用';
  if (kind === 'housing')
    Object.assign(attributes, { intent: '出租', area: '80', layout: '两室一厅' });
  return {
    publicationConsent:require('./publication-confirmation').acceptedConsent(),
    attributes,
    imageIds: kind === 'used' ? imageIds : []
  };
}
module.exports = { residentFields };
