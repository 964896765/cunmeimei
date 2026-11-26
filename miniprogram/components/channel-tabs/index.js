const channels=require('../../utils/discovery-channels').definitions;
Component({
 options:{styleIsolation:'isolated'},
 properties:{variant:{type:String,value:'pill'},value:{type:String,value:'all'},theme:{type:String,value:'prism'},largeText:{type:Boolean,value:false},reduceMotion:{type:Boolean,value:false}},
 data:{channels},
 methods:{
  select(e){const type=e.currentTarget.dataset.type;if(channels.some(x=>x.id===type)&&type!==this.properties.value)this.triggerEvent('change',{type});}
 }
});
