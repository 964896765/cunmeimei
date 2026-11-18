'use strict';
const fs=require('node:fs'),path=require('node:path');
const backlog=require('../docs/audit/2026-11-18-phase-a/illustrations-176.json');
// Silhouettes chosen by actual service meaning. No numeric category fallback or random objects.
const designs={
 '商铺租赁':'shop,key','车位租售':'parking,car','房屋托管':'house,key,shield','物业管理':'tower,tools',
 '电影院':'film,ticket','KTV':'mic,headset','清吧酒吧':'bowls,cosmetic','演出剧场':'curtain,mic','艺术展览':'palette,certificate',
 '桌游店':'game,clock','棋牌室':'mahjong,chair','台球厅':'billiards','电玩中心':'arcade,game','VR体验馆':'vr,game',
 '茶馆':'teapot,bowls','足浴按摩':'bath,stones','洗浴汗蒸':'stones,water','游乐场':'slide,balloon','手工DIY':'scissors,brush','轰趴馆':'sofa,balloon,mic',
 '购物中心':'mall,bag','超市便利店':'supermarket,parcel','品牌折扣店':'shop,ticket','服饰鞋包':'shoe,bag','美妆个护':'lipstick,cosmetic','珠宝首饰':'ring,certificate','钟表眼镜':'clock,lens','手机电脑零售':'phone,laptop','家电零售':'screen,water','家居日用品':'sofa,lamp','母婴商品零售':'bottle,bag','运动户外用品':'backpack,racket','图书文具':'open-book,brush','鲜花礼品':'flower,parcel',
 '寻物启事':'magnifier,key','社区互助':'adult,child,heart','志愿服务':'adult,heart,shield','公益求助':'heart,paper','社区公告':'notice,envelope','本地资讯':'news,globe','邻里社群':'adult,adult,envelope','便民通讯录':'addressbook,phone','公共设施指引':'signpost,tower','闲置租借信息':'tools,clock','生活经验分享':'open-book,adult',
 '公交地铁':'subway,ticket','出租车':'car,parking','网约车':'car,phone','共享单车':'bike,phone','共享电动车':'bike,battery','火车出行':'train,case','航空出行':'plane,passport','城际包车':'bus,clock','代驾服务':'car,adult','无障碍出行':'bus,wheelchair',
 '洗车美容':'car,bath','车辆保养':'car,cosmetic','汽车机修':'engine,tools','轮胎电瓶':'tire,battery','汽车贴膜':'car,lens','汽车改装':'car,gear','新能源汽车维修':'engine,battery','充电桩网点':'charge,parking','加油加气站':'fuel,car','道路救援':'truck,tools','车辆年检代办':'car,certificate','汽车配件':'gear,tire','二手车买卖':'car,key','摩托车维修':'bike,engine',
 '理发造型':'hairdryer,scissors','皮肤护理':'cosmetic,flower','男士理容':'razor,comb','美甲':'nail,brush','美睫':'eyelash,lens','纹绣服务':'brow,brush','个人形象设计':'dress,lens','非医疗SPA':'stones,flower','美体护理':'mat,cosmetic',
 '书法培训':'brush,paper','音乐培训':'piano,guitar','舞蹈培训':'adult,hoop','职业技能培训':'tools,certificate','学历提升':'book,certificate','考试培训':'open-book,clock','编程培训':'laptop,code','体育技能教学':'racket,ball',
 '室内设计':'blueprint,sofa','老房翻新':'house,brush','防水补漏':'faucet,shield','门窗安装':'window,tools','地板墙面施工':'tiles,brush','厨房卫浴安装':'faucet,locker','全屋定制':'locker,blueprint','建材销售':'brick,parcel','灯具照明':'lamp,cosmetic',
 '综合医院':'hospital,medical','社区医疗机构':'clinic,adult','中医诊疗':'plant,medical','疫苗接种':'syringe,shield','心理诊疗':'heart,adult','药店药房':'medical,certificate',
 '旅游景区':'mountain,camera','周边短途游':'bus,backpack','乡村旅游':'house,plant','露营营地':'tent,torch','户外徒步':'mountain,shoe','当地导览':'signpost,globe',
 '连锁酒店':'hotel-tall,key','经济酒店':'hotel-small,bed','高端酒店':'hotel-luxury,case',
 '健身俱乐部':'dumbbell,case','普拉提':'mat,hoop','拳击格斗':'boxing,shield','体能训练':'dumbbell,clock','游泳场馆':'swim-lanes,water','篮球场馆':'basketball-court,ball','足球场馆':'football-court,ball','网球场馆':'tennis-court,racket','乒乓球馆':'pingpong,ball','攀岩馆':'climbing,helmet','骑行俱乐部':'bike,backpack','跑步活动':'shoe,clock',
 '婚礼策划':'arch,ring','婚庆主持':'mic,ring','婚宴酒店':'hotel-luxury,cake','婚纱礼服':'dress,flower','喜糖伴手礼':'candy,bag','婚介机构':'adult,adult,ring','婚恋咨询':'heart,headset','相亲活动':'arch,adult,heart',
 '代理记账':'calculator,paper','法律服务':'scales,book','品牌营销':'notice,balloon','印刷制作':'printer,palette','短视频代运营':'video,phone','翻译服务':'globe,open-book','会展服务':'mall,notice',
 '养老院':'house,seated','长者活动中心':'seated,mahjong','上门助浴':'bath,seated','助餐送餐':'meal,bag','失能照护':'bed,wheelchair','护理陪护':'seated,medical','助行辅具租赁':'walker,clock',
 '殡仪馆查询':'memorial-hall,magnifier','遗体接运':'car,lily','遗体存放':'locker,lily','骨灰寄存':'urn,locker','骨灰格位安葬':'niche,urn','公墓安葬':'certificate,lily','海葬服务':'boat,lily','祭扫服务':'candle,lily','殡葬用品':'urn,candle','丧事鲜花布置':'lily,flower','治丧便民指南':'open-book,lily',
 '快递寄件':'parcel,envelope','居民搬家':'truck,house','家具运输':'truck,sofa','仓储服务':'warehouse,parcel','冷链物流':'truck,snowflake',
 '农业种苗':'plant,grain','农机服务':'tractor,tools','农业灌溉':'sprinkler,plant','病虫害防治服务':'plant,shield','畜牧养殖服务':'cow,grain','水产养殖服务':'fish,water','农产品收购':'grain,bag','粮食收购':'grain,warehouse',
 '户籍居住证指引':'idcard,house','不动产登记指引':'house,certificate','生活缴费指引':'calculator,faucet','就业政策指引':'case,open-book',
 '银行营业网点':'bank,parking','保险机构网点':'umbrella,shield','理赔服务网点':'shield,paper','金融消费者权益指引':'scales,shield'
};
// A climbing helmet is distinct from the previously used medical/pet objects.
designs['攀岩馆']='climbing,backpack';
designs['清吧酒吧']='wine,mic';
designs['家电零售']='fridge,kettle';
designs['灯具照明']='lamp,bulb';
designs['艺术展览']='gallery,palette';
designs['品牌营销']='megaphone,paper';
designs['公墓安葬']='memorial-stone,lily';
designs['摩托车维修']='motorcycle,tools';
// A score book survives the 160 px view better than tiny musical glyphs.
designs['舞蹈培训']='dancer,open-book';
const specs=backlog.map(item=>{
 const recipe=designs[item.name];if(!recipe)throw Error('Missing authored recipe: '+item.id+' '+item.name);
 return {id:item.id,name:item.name,parts:recipe.split(',').map((model,i)=>({model,position:i===0?[-.12,.08,0]:i===1?[.65,-.35,.02]:[-.7,-.1,.02],scale:i===0?.95:i===1?.5:.42,...(i===2?{rotation:-.1}:{})}))};
});
if(specs.length!==176||new Set(specs.map(s=>s.id)).size!==176)throw Error('Incomplete completion batch');
fs.writeFileSync(path.join(__dirname,'category-completion-specs.json'),JSON.stringify(specs,null,2)+'\n');
console.log('Authored '+specs.length+' mapped scenes');
