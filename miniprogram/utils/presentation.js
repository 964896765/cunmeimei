const runtime=require('./runtime');
const display=require('./publication-display');
const labels={used:'二手闲置',housing:'房屋信息',community:'实用信息',service:'服务需求',merchant:'本地商家',job:'招聘求职',event:'同城活动',public:'公共信息'};
function media(url,thumb=false){return url?(url.startsWith('/')?runtime.apiBaseUrl+url:url)+(thumb?'?size=thumb':'')+(runtime.devLogin&&wx.getStorageSync('city_life_acceptance_mode')?(thumb?'&test=1':'?test=1'):''):'';}
function item(x){const a=x.attributes||{},category=x.kind==='service'?'生活服务':labels[x.type]||x.category||'同城信息';
 const facts=display.describe(x.type,a,x.price,x.district);
 const date=x.createdAt?new Date(x.createdAt):null;const dateText=date&&!isNaN(date)?(date.getMonth()+1)+'月'+date.getDate()+'日':'';
 return {...x,...facts,category,dateText,images:(x.images||[]).map(u=>media(u)),cover:media(x.images?.[0],true),icon:'/assets/icons/type-'+(['used','housing','community','service','merchant','job'].includes(x.type)?x.type:'service')+'.png',meta:[a.condition,a.area?a.area+'㎡':'',a.layout,a.topic].filter(Boolean).join(' · ')};
}
module.exports={item,media,labels};
