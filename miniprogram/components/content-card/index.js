const {iconPalettes}=require('../../utils/palettes');
Component({
 properties:{item:Object,layout:{type:String,value:'card'},compact:{type:Boolean,value:false},theme:{type:String,value:'prism'},iconPalette:{type:String,value:'prism'}},
 data:{placeholderIcon:'/assets/icons/type-service-prism.png',coverFailed:false},
 observers:{'item, iconPalette'(item,iconPalette){
  const match=/^\/assets\/icons\/type-(merchant|job|housing|used|service|community)\.png$/.exec(item?.icon||'');
  const name=match?match[1]:'service';
  this.setData({placeholderIcon:'/assets/icons/type-'+name+'-'+(iconPalettes[iconPalette]?iconPalette:'prism')+'.png',coverFailed:false,distanceText:Number.isFinite(item?.distanceKm)?'距您 '+item.distanceKm.toFixed(1)+'km':''});
 }},
 methods:{open(){this.triggerEvent('open',{id:this.data.item.id});},favorite(){this.triggerEvent('favorite',{id:this.data.item.id});},imageError(){this.setData({coverFailed:true});},preview(){const urls=this.data.item.images||[];if(urls.length)wx.previewImage({current:urls[0],urls});}}
});
