'use strict';
const labels={recommended:'综合推荐',latest:'最新发布',popular:'热门优先',distance:'距离最近',price_low:'价格从低到高',price_high:'价格从高到低',salary_high:'薪资从高到低'};
function options(type){const prices=['housing','used','service'].includes(type),nearby=['all','merchant','service'].includes(type);return [
 {code:'recommended',name:labels.recommended,hint:'综合关键词匹配、真实收藏和发布时间',enabled:true},
 {code:'latest',name:labels.latest,hint:'按发布时间由新到旧',enabled:true},
 {code:'popular',name:labels.popular,hint:'按真实收藏数排序，同数时优先最新',enabled:true},
 {code:'distance',name:labels.distance,hint:nearby?'需授权定位，仅展示已核验公开点位':'仅商家与可预约服务支持公开位置排序',enabled:nearby},
 {code:'price_low',name:labels.price_low,hint:prices?'可比较价格优先，面议等信息排在后面':'请先选择房产、闲置或服务频道',enabled:prices},
 {code:'price_high',name:labels.price_high,hint:prices?'可比较价格优先，面议等信息排在后面':'请先选择房产、闲置或服务频道',enabled:prices},
 {code:'salary_high',name:labels.salary_high,hint:'薪资尚未纳入统一比较，请在岗位详情核对薪酬与用工说明',enabled:false}
];}
module.exports={labels,options};
