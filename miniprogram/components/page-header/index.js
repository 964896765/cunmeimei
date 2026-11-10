'use strict';
Component({
 properties:{transparent:{type:Boolean,value:false},continuous:{type:Boolean,value:false},backLabel:{type:String,value:'返回个人中心'},title:{type:String,value:''},back:{type:Boolean,value:false},largeText:{type:Boolean,value:false},actionText:{type:String,value:''},actionDisabled:{type:Boolean,value:false}},
 data:{statusHeight:0,rowHeight:44,headerHeight:44,titleInset:96},
 lifetimes:{attached(){this.measure();}},
 pageLifetimes:{resize(){this.measure();}},
 methods:{
  measure(){
   let window={},menu={};try{window=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();}catch{}
   try{menu=wx.getMenuButtonBoundingClientRect();}catch{}
   const width=window.windowWidth||375,statusHeight=window.statusBarHeight||0;
   const valid=menu.height>0&&menu.top>=statusHeight&&menu.left>0&&menu.right<=width+1;
   const rowHeight=valid?Math.max(44,menu.height+2*(menu.top-statusHeight)):44;
   const titleInset=valid?Math.ceil(width-menu.left+8):96;
   this.setData({statusHeight,rowHeight,headerHeight:statusHeight+rowHeight,titleInset});
   this.triggerEvent('measure',{height:statusHeight+rowHeight});
  },
  goBack(){this.triggerEvent('back');},
  act(){if(!this.properties.actionDisabled)this.triggerEvent('action');}
 }
});
