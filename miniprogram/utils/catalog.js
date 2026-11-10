const groups = [
  { id: 'merchant', name: '本地商家', glyph: '店', desc: '餐饮、购物、生活好店' },
  { id: 'job', name: '招聘求职', glyph: '聘', desc: '本地工作与求职需求' },
  { id: 'housing', name: '租房房产', glyph: '住', desc: '租房、房源及转租' },
  { id: 'used', name: '二手闲置', glyph: '闲', desc: '闲置出售与求购' },
  { id: 'service', name: '生活服务', glyph: '服', desc: '家政、维修、搬家' },
  { id: 'community', name: '邻里社区', glyph: '邻', desc: '互助、动态、本地活动' }
];
const labels = { merchant:'商家', job:'招聘', housing:'租房', used:'二手', service:'服务', community:'社区' };
const glyphs = { merchant:'店', job:'聘', housing:'住', used:'闲', service:'服', community:'邻' };
const groupOptions = [ { id:'all',name:'全部' }, ...groups.map(g => ({id:g.id,name:g.name})) ];
const postTypes = [
  { id:'used',name:'闲置物品',glyph:'闲',hint:'发布个人物品，买卖双方自行沟通' },
  { id:'housing',name:'房屋信息',glyph:'住',hint:'出租、转租、求租' },
  { id:'community',name:'社区动态',glyph:'邻',hint:'本地交流、邻里互助' },
  { id:'service',name:'服务需求',glyph:'服',hint:'保洁、维修、搬家等需求' },
  { id:'job',name:'招聘职位',glyph:'聘',hint:'正式开放须核验经营主体与相关资质', restricted:true }
];
module.exports = {groups, labels, glyphs, groupOptions, postTypes};
