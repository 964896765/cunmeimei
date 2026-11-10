const KEY = 'city_life_v1_demo_store';
const seed = {
  region: '示例市 · 中心街道',
  merchants: [
    { id:'m1', kind:'merchant', type:'merchant', title:'慢山咖啡 · 演示店', category:'餐饮咖啡', district:'中心街道', price:'人均 ¥28', desc:'一杯咖啡，一段安静的午后。示例门店，不代表真实商家。', detail:'提供咖啡、茶饮与简餐。可收藏或发起站内演示咨询。', glyph:'店' },
    { id:'m2', kind:'merchant', type:'merchant', title:'拾光生活馆 · 演示店', category:'家居零售', district:'西城区', price:'精选商品', desc:'日常生活用品和家居小物。示例门店。', detail:'演示商家主页，后续接入真实营业资质、地图和评价。', glyph:'店' }
  ],
  listings: [
    { id:'l1', kind:'listing', type:'job', title:'门店运营助理（演示职位）', category:'招聘', district:'中心街道', price:'¥4,000–6,000/月', desc:'白班 · 工作地点中心街道', detail:'演示招聘数据：实际发布前须完成主体与招聘资质核验。', glyph:'聘' },
    { id:'l2', kind:'listing', type:'housing', title:'整租一居室（演示房源）', category:'租房', district:'北城区', price:'¥1,500/月', desc:'一室一厅 · 近生活商圈', detail:'演示房源，真实性未经验证；正式业务将增加房源核验与举报流程。', glyph:'住' },
    { id:'l3', kind:'listing', type:'used', title:'闲置书桌（演示商品）', category:'二手', district:'中心街道', price:'¥180', desc:'自提优先 · 成色良好', detail:'演示二手交易信息，不提供线上担保付款。', glyph:'闲' },
    { id:'l4', kind:'listing', type:'used', title:'求购二手自行车（演示）', category:'求购', district:'西城区', price:'预算 ¥300', desc:'同城见面 · 个人求购', detail:'演示求购需求，正式交易请遵守平台规则。', glyph:'闲' }
  ],
  services: [
    { id:'s1', kind:'service', type:'service', title:'上门保洁 · 演示服务', category:'家政', district:'全城可约', price:'¥89 起', desc:'家庭日常清洁 · 预约咨询', detail:'服务价格和时间为演示数据，在线预约不会向服务人员实际派单。', glyph:'服' },
    { id:'s2', kind:'service', type:'service', title:'家电维修 · 演示服务', category:'维修', district:'中心街道', price:'上门询价', desc:'洗衣机、空调等家电检修', detail:'服务内容为开发演示，无真实承接方。', glyph:'服' }
  ],
  posts: [
    { id:'c1', kind:'post', type:'community', title:'周末读书分享（演示）', category:'活动', district:'中心街道', price:'社区交流', desc:'一起聊聊最近读过的好书', detail:'演示活动信息，实际活动报名能力将在后续阶段接入。', glyph:'邻' },
    { id:'c2', kind:'post', type:'community', title:'附近失物招领（演示）', category:'互助', district:'北城区', price:'邻里互助', desc:'展示社区互助信息的卡片形态', detail:'演示社区内容，可用于测试详情和收藏。', glyph:'邻' }
  ],
  publications: [], bookings: [], favorites: [], merchantRequest: null, merchantNotice: '',
  conversations: [{id:'system',title:'平台演示通知',note:'演示数据保存在当前设备',items:[{id:'msg0',text:'欢迎体验同城生活。当前项目是本地开发演示版，不接入真实用户、聊天、支付或审核。',from:'them',time:'演示'}]}]
};
function clone(v) {return JSON.parse(JSON.stringify(v));}
function ensureDemoData() {try{const d=wx.getStorageSync(KEY);if (!d || !d.merchants || !d.conversations){wx.setStorageSync(KEY, clone(seed));}}catch(e){wx.setStorageSync(KEY,clone(seed));}}
function getStore(){ensureDemoData();return wx.getStorageSync(KEY);}
function saveStore(s){wx.setStorageSync(KEY,s);return s;}
function uid(prefix){return prefix + Date.now().toString(36) + Math.floor(Math.random()*10000).toString(36);}
function allItems(){const s=getStore();return [...s.merchants,...s.listings,...s.services,...s.posts];}
function getItem(id){return allItems().find(i=>i.id===id)||null;}
function saveFavorite(id){const s=getStore();const pos=s.favorites.indexOf(id);if(pos<0)s.favorites.push(id);else s.favorites.splice(pos,1);saveStore(s);return pos<0;}
function createPublication(value){const s=getStore();const rec={...value,id:uid('p'),status:'待审核（演示）',revision:1,createdAt:new Date().toISOString()};s.publications.unshift(rec);saveStore(s);pushSystem('已保存「'+rec.title+'」。这是本地演示的待审核记录，并未公开发布。');return rec;}
function updatePublication(id,value,expectedRevision){
 const s=getStore();const item=s.publications.find(p=>p.id===id&&p.status==='待审核（演示）');
 if(!item||(item.revision||1)!==expectedRevision||item.type!==value.type)return false;
 Object.assign(item,{title:value.title,detail:value.detail,price:value.price,district:value.district,revision:(item.revision||1)+1});
 saveStore(s);return true;
}
function withdrawPublication(id){const s=getStore();const item=s.publications.find(x=>x.id===id&&x.status==='待审核（演示）');if(!item)return false;item.status='已撤回（演示）';saveStore(s);return true;}
function createBooking(value){const s=getStore();const rec={...value,id:uid('b'),status:'已预约（演示）',createdAt:new Date().toISOString()};s.bookings.unshift(rec);saveStore(s);pushSystem('已创建本地演示预约：'+rec.serviceTitle+'；不会产生真实派单和付款。');return rec;}
function cancelBooking(id){const s=getStore();const b=s.bookings.find(x=>x.id===id);if(b){b.status='已取消';saveStore(s);}return !!b;}
function pushSystem(msg){const s=getStore();const c=s.conversations.find(c=>c.id==='system');c.items.push({id:uid('msg'),text:msg,from:'them',time:'刚刚'});saveStore(s);}
function openConversation(id,title){const s=getStore();let c=s.conversations.find(x=>x.id===id);if(!c){c={id,title,note:'站内演示对话，消息不会发送给其他人',items:[{id:uid('msg'),text:'这是演示会话。消息仅保存在你当前设备。',from:'them',time:'演示'}]};s.conversations.unshift(c);saveStore(s);}return c;}
function sendMessage(id,text){const s=getStore();const c=s.conversations.find(x=>x.id===id);if(!c)return false;c.items.push({id:uid('msg'),text,from:'me',time:'刚刚'});saveStore(s);return true;}
function requestMerchant(value){const s=getStore();s.merchantRequest={...value,submittedAt:new Date().toISOString(),status:'待平台核验（演示）'};saveStore(s);pushSystem('商家入驻申请已保存为本地演示记录，正式环境须由后台核验资料。');}
function saveMerchantNotice(text){const s=getStore();s.merchantNotice=text;saveStore(s);}
function resetDemoData(){wx.setStorageSync(KEY,clone(seed));}
module.exports={ensureDemoData,getStore,saveStore,allItems,getItem,saveFavorite,createPublication,updatePublication,withdrawPublication,createBooking,cancelBooking,pushSystem,openConversation,sendMessage,requestMerchant,saveMerchantNotice,resetDemoData};
