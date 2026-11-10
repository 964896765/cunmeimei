const api=require('../../utils/api');
const owner=()=>wx.getStorageSync('city_life_user_id')||'';
Page({
 data:{id:'',cityCode:'',item:null,report:null,items:[],page:0,hasMore:false,loading:false,busy:false,error:'',feedback:''},
 onLoad(q={}){this.setData({id:q.id||'',reportId:q.reportId||'',cityCode:q.cityCode||require('../../utils/geo-context').current().cityCode||''});return this.load(true);},
 onShow(){this.disposed=false;require('../../utils/theme').apply(this);if(this.actionOwner!==undefined&&owner()!==this.actionOwner){this._reportTask=null;this.setData({busy:false,feedback:''});}this.actionOwner=owner();if(this.data.reportId&&this.reportOwner!==undefined&&owner()!==this.reportOwner){this.version=(this.version||0)+1;this.setData({report:null,feedback:'',loading:false});this.load(true);}},onUnload(){this.disposed=true;this._reportTask=null;this.version=(this.version||0)+1;},
 onPullDownRefresh(){return this.load(true).finally(()=>wx.stopPullDownRefresh());},retry(){return this.load(true);},more(){return this.load(false);},
 async load(reset=true){if(this.data.loading)return;const version=this.version=(this.version||0)+1;this.setData({loading:true,error:''});
  try{
   if(this.data.reportId){if(!api.hasSession())await api.login();const uid=owner();this.reportOwner=uid;const r=await api.request('GET','/api/v1/me/home-reports/'+encodeURIComponent(this.data.reportId),null,true,uid);if(this.disposed||uid!==owner()||version!==this.version)return;this.setData({report:r.report});}
   else if(this.data.id){const r=await api.request('GET','/api/v1/home/content/'+encodeURIComponent(this.data.id));if(this.disposed||version!==this.version)return;if(r.item.kind!=='news')throw Error('该内容不是资讯，请返回首页查看。');this.setData({item:r.item});}
   else{const page=reset?1:this.data.page+1,r=await api.request('GET','/api/v1/home/news?cityCode='+encodeURIComponent(this.data.cityCode)+'&page='+page);if(this.disposed||version!==this.version)return;const rows=new Map((reset?[]:this.data.items).map(x=>[x.id,x]));for(const item of r.items||[])rows.set(item.id,item);this.setData({items:[...rows.values()],page,hasMore:!!r.hasMore});}
  }catch(e){if(!this.disposed&&version===this.version)this.setData({item:null,error:e.message||'资讯暂时无法读取。'});}finally{if(!this.disposed&&version===this.version)this.setData({loading:false});}
 },
 open(e){wx.navigateTo({url:'/pages/information/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});},
 goBack(){if(getCurrentPages().length>1)wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/home/index'})});else wx.switchTab({url:'/pages/home/index'});},
 copySource(){if(this.data.item?.sourceUrl)wx.setClipboardData({data:this.data.item.sourceUrl});},
 async report(){if(this.data.busy||!this.data.item)return;const task=this._reportTask={};this.setData({busy:true,feedback:''});let uid=owner();this.actionOwner=uid;const id=this.data.item.id;
  try{if(!api.hasSession())await api.login();if(this.disposed||task!==this._reportTask)return;uid=owner();this.actionOwner=uid;const answer=await new Promise(resolve=>wx.showModal({title:'资讯纠错或举报',content:'',editable:true,placeholderText:'说明问题和依据，至少8字，勿填写电话或证件号',success:resolve,fail:()=>resolve({confirm:false})}));if(!answer.confirm||this.disposed||uid!==owner()||task!==this._reportTask)return;const r=await api.request('POST','/api/v1/home/content/'+id+'/reports',{reason:answer.content||''},true,uid);if(this.disposed||uid!==owner()||task!==this._reportTask)return;this.setData({feedback:'已提交，处理答复将通过消息通知。编号：'+r.id});}
  catch(e){if(!this.disposed&&uid===owner()&&task===this._reportTask)this.setData({feedback:e.message||'提交未完成，请重试。'});}finally{if(!this.disposed&&uid===owner()&&task===this._reportTask){this._reportTask=null;this.setData({busy:false});}}
 }
});
