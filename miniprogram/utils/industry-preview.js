'use strict';
const geography=require('./geography');
function error(w,form,areas){
 if(!w)return '请重新读取当前分类';
 if((form.title||'').trim().length<4)return '标题至少填写4个字';
 if((form.detail||'').trim().length<10)return '详细说明至少填写10个字';
 if(!geography.findCity(form.cityCode)||geography.findDistrict(form.districtCode)?.cityCode!==form.cityCode)return '请选择有效城市和区县或镇街';
 if(!areas.includes(form.district))return '请选择已开放的服务地区';
 for(const f of w.fields){const value=form.fields[f.key];if(f.required&&(value===undefined||value===''||f.type==='confirm'&&value!==true))return '请填写或确认：'+f.label;
  if(value===undefined||value==='')continue;
  if(f.type==='select'&&!f.options.includes(value))return '请选择：'+f.label;
  if(f.type==='number'&&(!/^\d{1,8}$/.test(String(value))||Number(value)<1)||f.type==='decimal'&&(!/^\d{1,6}(\.\d{1,2})?$/.test(String(value))||Number(value)<=0))return '请填写有效数值：'+f.label;
  if(f.type==='url'&&!/^https:\/\/[^\s]+$/i.test(String(value)))return '请填写HTTPS来源：'+f.label;
  if(['date','datetime'].includes(f.type)&&!Number.isFinite(Date.parse(value)))return '请填写有效日期：'+f.label;
 }
 if(Number(form.fields.salaryMin)>Number(form.fields.salaryMax))return '薪资下限不能高于上限';
 if(w.response==='event'&&(Date.parse(form.fields.endsAt)<=Date.now()||Date.parse(form.fields.endsAt)<=Date.parse(form.fields.startsAt)))return '活动结束时间须晚于开始时间，且尚未过期';
 return '';
}
function fields(w,form){return w.fields.filter(f=>form.fields[f.key]!==undefined&&form.fields[f.key]!=='').map(f=>({key:f.key,label:f.label,value:f.type==='confirm'?'已确认':String(form.fields[f.key])}));}
module.exports={error,fields};
