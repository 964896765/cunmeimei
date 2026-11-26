const {iconPalettes}=require('../../utils/palettes');
Component({
 properties:{item:Object,layout:{type:String,value:'card'},compact:{type:Boolean,value:false},theme:{type:String,value:'prism'},iconPalette:{type:String,value:'prism'}},
 data:{placeholderIcon:'/assets/icons/type-service-prism.png',coverFailed:false},
 observers:{'item, iconPalette'(item,iconPalette){
  const match=/^\/assets\/icons\/type-(merchant|job|housing|used|service|community)\.png$/.exec(item?.icon||'');
  const name=match?match[1]:'service';
  const attributes=item?.attributes||{};
  const project=require('../../utils/classification').find(attributes.categoryId);
  const listingCategory=project?.categoryName||project?.name||item?.category||'';
  const fields=attributes.industryFields||attributes;
  const benefits=item?.type==='job'&&typeof fields.benefits==='string'
   ? fields.benefits.split(/[、，,；;]+/).map(value=>value.trim()).filter(value=>value&&value.length<=12)
   : [];
  const listingTags=[...new Set([...benefits,fields.employment,attributes.intent,attributes.layout,attributes.condition,attributes.brand].filter(Boolean))].slice(0,3);
  const min=Number(fields.salaryMin),max=Number(fields.salaryMax);
  const salary=item?.type==='job'&&min>0&&max>=min ? '¥'+(min===max?min:min+'–'+max)+'/月' : '';
  const published=Date.parse(item?.createdAt);
  const minutes=Math.floor((Date.now()-published)/60000);
  let publicationTime=item?.dateText||'';
  if(Number.isFinite(published)&&minutes>=0&&minutes<60)publicationTime=minutes===0?'刚刚':minutes+'分钟前';
  else if(Number.isFinite(published)&&minutes>=60&&minutes<1440)publicationTime=Math.floor(minutes/60)+'小时前';
  this.setData({placeholderIcon:'/assets/icons/type-'+name+'-'+(iconPalettes[iconPalette]?iconPalette:'prism')+'.png',coverFailed:false,distanceText:Number.isFinite(item?.distanceKm)?'距您 '+item.distanceKm.toFixed(1)+'km':'',listingCategory,listingTags,salary,publicationTime});
 }},
 methods:{open(){this.triggerEvent('open',{id:this.data.item.id});},favorite(){this.triggerEvent('favorite',{id:this.data.item.id});},imageError(){this.setData({coverFailed:true});},preview(){const urls=this.data.item.images||[];if(urls.length)wx.previewImage({current:urls[0],urls});}}
});
