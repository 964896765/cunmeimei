'use strict';
Component({
 properties:{collapsed:{type:Boolean,value:false},subtitle:{type:String,value:''},align:{type:String,value:'center'},logoSrc:{type:String,value:''},logoOnly:{type:Boolean,value:false},transparent:{type:Boolean,value:false},continuous:{type:Boolean,value:false},nativeBack:{type:Boolean,value:false},backLabel:{type:String,value:'返回上一页'},title:{type:String,value:''},back:{type:Boolean,value:false},largeText:{type:Boolean,value:false},actionText:{type:String,value:''},actionDisabled:{type:Boolean,value:false}},
 data:{statusHeight:0,rowHeight:44,headerHeight:44,titleInset:96},
 lifetimes:{attached(){this.measure();}},
 pageLifetimes:{resize(){this.measure();}},
 methods:{
  measure(){
   let window={},menu={};try{window=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();}catch{}
   try{menu=wx.getMenuButtonBoundingClientRect();}catch{}
   const width=window.windowWidth||375,statusHeight=window.statusBarHeight||0;
   const valid=menu.height>0&&menu.top>=statusHeight&&menu.left>0&&menu.right<=width+1;
   const rowHeight=Math.max(this.properties?.logoSrc&&!this.properties?.logoOnly?60:44,valid?menu.height+2*(menu.top-statusHeight):44);
   const titleInset=valid?Math.ceil(width-menu.left+8):96;
   this.setData({statusHeight,rowHeight,headerHeight:statusHeight+rowHeight,titleInset});
   this.triggerEvent('measure',{height:statusHeight+rowHeight,statusHeight,rowHeight,titleInset});
  },
  goBack(){if(this.properties.nativeBack)wx.navigateBack({delta:1,fail:()=>wx.switchTab({url:'/pages/home/index'})});else this.triggerEvent('back');},
  act(){if(!this.properties.actionDisabled)this.triggerEvent('action');}
 }
});
