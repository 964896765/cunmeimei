'use strict';
const api=require('../../utils/api');
const empty=()=>({phone:'',code:'',challengeId:'',expiresAt:0,retryAt:0,remaining:0});
const validPhone=value=>/^1[3-9]\d{9}$/.test(value);
const validCode=value=>/^\d{6}$/.test(value);

Component({
 properties:{purpose:{type:String,value:'bind'},change:Boolean,enabled:Boolean,busy:Boolean,docs:Object,largeText:Boolean},
 data:{fields:{current:empty(),previous:empty()},sending:'',message:'',isError:false},
 lifetimes:{
  attached(){this._live=true;this._cooldowns=new Map();this._clock=setInterval(()=>this.updateCountdown(),1000);},
  detached(){this._live=false;clearInterval(this._clock);this._cooldowns.clear();}
 },
 methods:{
  cooldownKey(field,phone){return (field==='previous'?'change_old':this.properties.purpose)+':'+phone;},
  updateCountdown(){
   const updates={};
   for(const key of ['current','previous']){
    const field=this.data.fields[key],remaining=Math.max(0,Math.ceil((field.retryAt-Date.now())/1000));
    if(remaining!==field.remaining)updates[`fields.${key}.remaining`]=remaining;
   }
   if(Object.keys(updates).length)this.setData(updates);
  },
  input(event){
   const {field:key,name}=event.currentTarget.dataset;
   const value=event.detail.value.replace(/\D/g,'').slice(0,name==='phone'?11:6);
   const field=this.data.fields[key];
   const retryAt=this._cooldowns.get(this.cooldownKey(key,value))||0;
   const update=name==='phone'&&field.phone!==value
    ? {...empty(),phone:value,retryAt,remaining:Math.max(0,Math.ceil((retryAt-Date.now())/1000))}
    : {...field,[name]:value};
   this.setData({[`fields.${key}`]:update,message:''});
   return value;
  },
  consent(){
   const {docs,purpose}=this.properties;
   return purpose==='signin'?{consent:true,termsVersion:docs.termsVersion,privacyVersion:docs.privacyVersion,legalHash:docs.hash}:{phoneConsent:true};
  },
  message(text,isError=true){this.setData({message:text,isError});},
  async send(event){
   const {field:key}=event.currentTarget.dataset;
   const {phone,retryAt}=this.data.fields[key];
   if(this.properties.busy||this.data.sending||!this.properties.enabled||retryAt>Date.now())return;
   if(!validPhone(phone)){this.message('请输入有效的 11 位手机号');return;}
   this.setData({sending:key,message:''});
   try{
    const result=await api.sendSmsCode({phone,purpose:key==='previous'?'change_old':this.properties.purpose,...this.consent()});
    if(!this._live||this.data.fields[key].phone!==phone)return;
    const nextRetry=Date.now()+result.retryAfter*1000;
    this._cooldowns.set(this.cooldownKey(key,phone),nextRetry);
    this.setData({[`fields.${key}`]:{phone,code:'',challengeId:result.challengeId,
     expiresAt:Date.now()+result.expiresIn*1000,retryAt:nextRetry,remaining:result.retryAfter}});
    this.message(result.delivery==='unknown'?'发送状态待确认，如已收到短信可直接填写。':'验证码已发出，5 分钟内有效。',false);
   }catch(error){if(this._live)this.message(error.message);}
   finally{if(this._live)this.setData({sending:''});}
  },
  confirm(){
   if(this.properties.busy||this.data.sending||!this.properties.enabled)return;
   const {current,previous}=this.data.fields;
   const fields=this.properties.change?[previous,current]:[current];
   if(fields.some(field=>!validPhone(field.phone)||!field.challengeId||!validCode(field.code))){
    this.message('请先获取短信并填写 6 位验证码');return;
   }
   if(fields.some(field=>field.expiresAt<=Date.now())){this.message('验证码已过期，请重新获取');return;}
   if(this.properties.change&&previous.phone===current.phone){this.message('新手机号需与原手机号不同');return;}
   const payload=({phone,code,challengeId})=>({phone,code,challengeId});
   this.message('',false);
   this.triggerEvent('confirm',{...payload(current),...(this.properties.change?{previous:payload(previous)}:{})});
  }
 }
});
