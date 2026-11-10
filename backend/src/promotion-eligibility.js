'use strict';
// A directory or an official-source contribution never becomes an advertisement
// merely by obtaining a generic advertiser record.
function promotionClause(alias='p'){
 if(!/^[a-z]+$/.test(alias))throw Error('Invalid internal table alias');
 return `(NOT EXISTS(SELECT 1 FROM industry_entries ie WHERE ie.id=${alias}.id) OR EXISTS(SELECT 1 FROM industry_entries ie JOIN industry_public_eligibility ok ON ok.id=ie.id WHERE ie.id=${alias}.id AND ie.policy IN ('MERCHANT','MERCHANT_SERVICE','PROPERTY','PROPERTY_BIZ','JOB','JOB_FILTER','EVENT','EVENT_BIZ','COMMUNITY')))`;
}
module.exports={promotionClause};
