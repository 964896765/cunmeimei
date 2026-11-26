'use strict';
Component({
 properties:{docs:Object,busy:Boolean,error:String,needPrivacy:Boolean,reason:String,themeColor:String,iconPalette:{type:String,value:'prism'},largeText:Boolean},
 data:{agreed:false,mode:'wechat'},
 observers:{'docs.hash'(){this.setData({agreed:false});}},
 methods:{
  agreement(e){this.setData({agreed:e.detail.value.includes('consent')});},
  chooseMode(e){if(!this.properties.busy&&this.properties.docs?.smsAvailable)this.setData({mode:e.currentTarget.dataset.mode});},
  login(){if(this.data.agreed&&!this.properties.busy&&!this.properties.needPrivacy&&this.properties.docs?.configured&&this.properties.docs?.wechatAvailable)this.triggerEvent('login');},
  privacyAgreed(){if(this.data.agreed&&!this.properties.busy&&this.properties.docs?.configured&&this.properties.docs?.wechatAvailable)this.triggerEvent('login');},
  smsPrivacyAgreed(){this.triggerEvent('smsprivacy');},
  smsLogin(e){if(this.data.agreed&&!this.properties.busy&&!this.properties.needPrivacy&&this.properties.docs?.smsAvailable)this.triggerEvent('login',{sms:e.detail});},
  guest(){this.triggerEvent('guest');},
  legal(e){this.triggerEvent('legal',{kind:e.currentTarget.dataset.kind});}
 }
});
