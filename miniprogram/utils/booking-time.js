'use strict';
function today(now=Date.now()){return new Date(now+8*3600e3).toISOString().slice(0,10);}
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const year=Number(value.slice(0,4)),month=Number(value.slice(5,7)),day=Number(value.slice(8,10));
 return year>=2020&&year<=2100&&month>=1&&month<=12&&day>=1&&day<=31&&new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)===value;
}
function requestedLabel(value){const instant=value?new Date(value).getTime():NaN,date=new Date(instant+8*3600e3);return Number.isFinite(date.getTime())?date.toISOString().slice(0,16).replace('T',' ')+'（北京时间）':'时间待确认';}
function cancellationText(reason) {
 if (reason === 'industry_source_unavailable') {
  return '原服务内容、资质或负责商家状态已变化，待确认预约已由系统取消。原记录保留，可重新查询当前可预约的服务。';
 }
 return '';
}
module.exports={today,validDate,requestedLabel,cancellationText};
