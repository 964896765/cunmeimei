'use strict';

const version = 'review-1.0-20261114';
const rules = {
 general:{name:'通用信息审核',checks:[['rightsReviewed','已核查真实性、有效期、内容权利与个人信息保护']]},
 used:{name:'二手物品审核',checks:[['goodsReviewed','已核查物品来源、实际成色、缺陷说明及禁售范围']]},
 recruitment:{name:'招聘专项审核',checks:[['employerReviewed','已核查招聘企业、发布授权及适用的人力资源服务资质'],['jobTermsReviewed','已核查真实岗位、薪资工时、无招聘收费与培训贷及用工条件']]},
 housing:{name:'房产专项审核',checks:[['propertyRightsReviewed','已核查本条房源权属或发布授权及适用的经纪资质'],['housingSafetyReviewed','已核查真实房源、价格、用途及居住安全限制']]},
 medical:{name:'医疗专项审核',checks:[['medicalLicenseReviewed','已核查医疗、药品或相关机构的适用许可及获准范围'],['medicalClaimsReviewed','已核查官方来源、诊疗服务边界及疗效宣传限制']]},
 education:{name:'教育专项审核',checks:[['educationLicenseReviewed','已核查适用的办学、培训许可或登记及课程范围'],['educationClaimsReviewed','已核查课程、师资、收费退款及招生承诺']]},
 food:{name:'食品餐饮专项审核',checks:[['foodLicenseReviewed','已核查适用的食品经营许可或备案、实际主体及有效期'],['foodScopeReviewed','已核查实际门店、经营范围、餐品及价格宣传']]},
 finance:{name:'金融机构目录审核',checks:[['financeLicenseReviewed','已核查持牌机构、官方公示及核准业务范围'],['financeClaimsReviewed','已核查目录展示边界及收益承诺、引流与交易限制']]},
 maternal:{name:'母婴专项审核',checks:[['maternalScopeReviewed','已核查托育、护理或母婴服务适用资格、人员与服务安全范围']]},
 provider:{name:'机构服务审核',checks:[['providerScopeReviewed','已核查实际经营主体、适用许可、服务范围及价格和取消规则']]}
};

function resolve({projectId='',type='',policy=''} = {}) {
 const category = projectId.slice(0,3);
 const code = ({C01:'food',C02:'recruitment',C05:'housing',C12:'maternal',C13:'education',C15:'medical',C27:'finance'})[category]
  || (type === 'housing' ? 'housing' : type === 'used' ? 'used' : /MERCHANT|LICENSED|PROPERTY_BIZ/.test(policy) ? 'provider' : 'general');
 const rule = rules[code];
 return {code,version,name:rule.name,checks:rule.checks.map(([key,label]) => ({key,label}))};
}

module.exports = {version,resolve};
