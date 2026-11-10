'use strict';
// Recent queries stay on this device and are scoped to the current account.
// Filter obvious contact/address patterns and recognized sensitive-life terms.
function safe(q){return typeof q==='string'&&q.trim().length>0&&q.trim().length<=80&&!/[\d@]|殡|葬|丧|孕|产检|流产|医疗|疾病|癌|艾滋|成人|情趣|隐私|诊疗|残疾|住址|门牌|栋|单元|室\b/.test(q);}
function list(value){return Array.isArray(value)?[...new Set(value.filter(safe).map(x=>x.trim()))].slice(0,10):[];}
function add(value,q){return safe(q)?list([q.trim(),...list(value)]):list(value);}
module.exports={safe,list,add};
