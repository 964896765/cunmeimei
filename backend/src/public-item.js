'use strict';
// Publishing a service *request* is different from offering a bookable catalog service.
// Never decide booking/report permissions solely from the `type` string.
function toPublicItem(record, origin) {
 if (!record || !['publication','catalog','merchant'].includes(origin)) throw Error('Invalid public item origin');
 const isCatalog = origin === 'catalog';
 return {
  id:record.id,
  kind:origin==='merchant'?'merchant':isCatalog?'service':record.type==='community'?'post':'listing',
  type:record.type,
  title:record.title,
  district:record.district,
  price:record.price,
  description:record.description,
  desc:record.description,
  detail:record.description,
  category:isCatalog?'生活服务':({merchant:'本地商家',used:'二手闲置',housing:'房屋信息',community:'邻里社区',service:'服务需求'}[record.type]||'同城信息'),
  createdAt:record.created_at,
  glyph:isCatalog?'服':'同'
 };
}
module.exports={toPublicItem};
