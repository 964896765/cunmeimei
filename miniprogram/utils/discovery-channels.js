'use strict';

// Browsing groups are independent of publication templates and qualifications.
const definitions = Object.freeze([
  {id:'job', name:'招聘', industries:['C02']},
  {id:'housing', name:'房产', industries:['C05']},
  {id:'used', name:'闲置', industries:['C04']},
  {id:'merchant', name:'商家', industries:['C01','C07','C17']},
  {id:'service', name:'服务', industries:['C03','C10','C11','C12','C13','C14','C15','C18','C19','C20','C21','C22','C23','C27']},
  {id:'event', name:'活动', industries:['C06','C16']},
  {id:'public', name:'便民', industries:['C08','C09','C24','C25','C26']}
]);

function channelFor(categoryId) {
  const industry = String(categoryId || '').slice(0, 3);
  return definitions.find(channel => channel.industries.includes(industry))?.id || '';
}

function matches(item, channel) {
  if (!channel || channel === 'all') return true;
  const categoryId = item.attributes?.categoryId || item.categoryId || '';
  const assigned = channelFor(categoryId);
  return assigned ? assigned === channel : item.type === channel || channel === 'public' && item.type === 'community';
}

module.exports = {definitions, channelFor, matches};
