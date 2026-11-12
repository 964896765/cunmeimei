Component({
 options:{styleIsolation:'isolated'},
 properties:{variant:{type:String,value:'pill'},value:{type:String,value:'all'},scope:{type:String,value:'feed'},theme:{type:String,value:'prism'},largeText:{type:Boolean,value:false},reduceMotion:{type:Boolean,value:false}},
 data:{channels:require('../../utils/business-templates').channels.filter(x=>x.id!=='all')},
 observers:{scope(){this.sync();}},lifetimes:{attached(){this.sync();}},
 methods:{sync(){const rows=require('../../utils/business-templates').channels;this.setData({channels:this.properties.scope==='map'?rows.filter(x=>['all','merchant','service'].includes(x.id)):rows.filter(x=>x.id!=='all')});},select(e){const type=e.currentTarget.dataset.type;if(this.data.channels.some(x=>x.id===type)&&type!==this.properties.value)this.triggerEvent('change',{type});}}
});
