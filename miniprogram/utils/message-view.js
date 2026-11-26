'use strict';
const {media}=require('./presentation');
const status={pending:'等待处理',accepted:'已同意',rejected:'未同意',withdrawn:'已撤回'};
const topics={
 job:['招聘求职','C02'],housing:['房屋租售','C05'],used:['二手闲置','C04'],service:['生活服务','C03'],
 merchant:['本地商家','C01'],event:['同城活动','C06']
};
function dateText(value,now=new Date()){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 if(date.toDateString()===now.toDateString())return String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
 const yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
 if(date.toDateString()===yesterday.toDateString())return '昨天';
 return (date.getFullYear()===now.getFullYear()?'':date.getFullYear()+'/')+(date.getMonth()+1)+'/'+date.getDate();
}
function notice(item){
 const kind=item.targetKind;
 const category=kind==='businesscase'?'business':kind==='merchant'?'merchant':['booking','merchant-booking'].includes(kind)?'booking':['publication','publication-expiry','industry'].includes(kind)?'review':['points-ledger','points-reward','points-appeal','commerce','promotion'].includes(kind)?'points':'other';
 return {...item,category,icon:{business:'calendar',merchant:'store',booking:'calendar',review:'review',points:'points',other:'bell'}[category],dateText:dateText(item.createdAt)};
}
function contact(item){
 const [topic,topicIcon]=Object.prototype.hasOwnProperty.call(topics,item.type)?topics[item.type]:['',''];
 const cover=item.coverPath ? media(item.coverPath,true) : '';
 return {...item,topic,topicIcon,cover,avatarInitial:Array.from(String(item.title||'联系').replace(/^\[[^\]]*\]\s*/,''))[0]||'联',statusText:item.endedAt?'会话已结束':item.blocked?'已屏蔽':status[item.status]||'状态已更新',dateText:dateText(item.createdAt),preview:item.status==='accepted'?'已建立站内会话':item.status==='pending'?'查看联系申请':'联系状态已更新',needsReply:item.status==='pending'&&!item.outgoing&&!item.blocked};
}
function filterContacts(items,query,filter){const q=String(query||'').trim().toLocaleLowerCase();return items.filter(x=>(filter!=='pending'||x.needsReply)&&(!q||[x.title,x.message,x.response].some(v=>String(v||'').toLocaleLowerCase().includes(q))));}
module.exports={dateText,notice,contact,filterContacts};
