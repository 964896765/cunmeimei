const api = require('../../utils/api');
Component({
 options:{styleIsolation:'apply-shared'},
 properties:{revision:{type:Number,value:0,observer:'reset'},disabled:Boolean,largeText:Boolean,color:{type:String,value:'#973454'}},
 data:{checked:false,document:null,loading:true,error:''},
 lifetimes:{attached(){this.load();},detached(){this.disposed=true;}},
 methods:{
  reset(){this.setData({checked:false});this.triggerEvent('change',{consent:null});},
  async load(){
   this.reset();this.setData({loading:true,error:''});
   try{
    const document = await api.request('GET','/api/v1/publication-notice');
    if(!document.version||!document.hash||!document.content)throw Error('发布须知暂不可用，请重新读取。');
    if(!this.disposed)this.setData({document});
   }catch(error){if(!this.disposed)this.setData({document:null,error:error.message});}
   finally{if(!this.disposed)this.setData({loading:false});}
  },
  change(event){
   if(this.data.disabled||this.data.loading||!this.data.document)return;
   const checked = event.detail.value.includes('publication');
   this.setData({checked});
   const document = this.data.document;
   this.triggerEvent('change',{consent:checked?{accepted:true,version:document.version,hash:document.hash}:null});
  },
  read(){wx.navigateTo({url:'/pages/legal/index?kind=publication'});}
 }
});
