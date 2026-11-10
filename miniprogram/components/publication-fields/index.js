'use strict';
const schemas=require('../../utils/publication-schemas');
Component({
 options:{styleIsolation:'apply-shared'},
 properties:{kind:String,attributes:Object,disabled:Boolean,readOnly:Boolean,appearance:String},
 data:{fields:[],notice:''},
 observers:{'kind, attributes'(kind,attributes){const schema=schemas.get(kind);this.setData({fields:schemas.fieldsFor(kind,attributes).map(x=>({...x,maxLength:x.maxLength||80,value:attributes?.[x.key]||''})),notice:schema?.notice||''});}},
 methods:{
  inputField(e){this.emit(e.currentTarget.dataset.field,e.detail.value);},
  focusField(e){this.setData({focusedField:e.currentTarget.dataset.field});},blurField(){this.setData({focusedField:''});},
  selectField(e){const field=schemas.fieldsFor(this.data.kind,this.data.attributes).find(x=>x.key===e.currentTarget.dataset.field);if(field?.options)this.emit(field.key,field.options[Number(e.detail.value)]);},
  emit(key,value){if(this.data.disabled||this.data.readOnly||!schemas.keys(this.data.kind).includes(key)||typeof value!=='string')return;this.triggerEvent('change',{field:key,value});}
 }
});
