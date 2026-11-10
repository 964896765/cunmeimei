const api=require('../../utils/api');
Page({data:{merchantId:'',items:[],targetUser:'',roleIndex:1,roles:['manager','staff'],roleNames:['经理','店员']},onLoad(q){this.setData({merchantId:q.merchantId||''});},onShow(){require('../../utils/theme').apply(this);this.load();},
 async load(){try{const r=await api.request('GET','/api/v1/merchants/'+this.data.merchantId+'/members',null,true);this.setData({items:r.items||[]});}catch(e){api.showError(e);}},
 setUser(e){this.setData({targetUser:e.detail.value.trim()});},chooseRole(e){this.setData({roleIndex:Number(e.detail.value)});},
 async add(){try{await api.request('POST','/api/v1/merchants/'+this.data.merchantId+'/members',{userId:this.data.targetUser,role:this.data.roles[this.data.roleIndex]},true);this.setData({targetUser:''});wx.showToast({title:'员工权限已更新'});this.load();}catch(e){api.showError(e);}},
 remove(e){wx.showModal({title:'移除员工权限？',content:'移除后该员工无法继续访问商家业务。',success:async({confirm})=>{if(!confirm)return;try{await api.request('POST','/api/v1/merchants/'+this.data.merchantId+'/members/'+e.currentTarget.dataset.user+'/remove',{},true);this.load();}catch(err){api.showError(err);}}});}
});
