'use strict';
class ApiError extends Error { constructor(status, code, message) {super(message);this.status=status;this.code=code;} }
const bad=(code,msg,status=400)=>{throw new ApiError(status,code,msg);};
function text(value,max,min=0){if(typeof value!=='string')bad('INVALID_FIELD','字段类型错误');const t=value.trim().replace(/[\u0000-\u001F\u007F]/g,' ');if(t.length<min||t.length>max)bad('INVALID_FIELD',`字段长度必须为 ${min}-${max} 字`);return t;}
const allowed = new Set(require('../../miniprogram/utils/publication-schemas').kinds);
function publication(input,areas){const type=text(input.type,32,1);if(!allowed.has(type))bad('CATEGORY_CLOSED','此业务暂未开放发布');const district=text(input.district,80,1);if(!areas.includes(district))bad('INVALID_AREA','地区未开放');return {type,district,title:text(input.title,100,4),description:text(input.detail,5000,10),price:text(input.price||'',80)};}
function merchant(input,areas){const district=text(input.district,80,1);if(!areas.includes(district))bad('INVALID_AREA','地区未开放');return {district,name:text(input.name,100,2),category:text(input.category,40,1)};}
// Reject normalized invalid dates such as 2027-02-30 before computing UTC+8 slot instants.
function validCalendarDate(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const year=Number(date.slice(0,4)),month=Number(date.slice(5,7)),day=Number(date.slice(8,10));
 if(year<2020||year>2100||month<1||month>12||day<1||day>31)return false;
 const d=new Date(Date.UTC(year,month-1,day));
 return d.toISOString().slice(0,10)===date;
}
function booking(input){
 const keyed=input.clientKey!==undefined;
 if(keyed&&(typeof input.clientKey!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(input.clientKey)))bad('INVALID_REQUEST_KEY','预约申请标识无效');
 if(!/^[0-9a-f-]{36}$/i.test(input.serviceId||''))bad('INVALID_SERVICE','服务标识无效');
 const date=text(input.date,10,10),time=text(input.time,5,5);
 if(!validCalendarDate(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))bad('INVALID_TIME','预约时间无效');
 const d=new Date(date+'T'+time+':00+08:00');
 // Keyed retries may read a past outcome. The repository still rejects every
 // new claim at/after the ten-minute cutoff using the final database clock.
 if(!Number.isFinite(d.valueOf())||(!keyed&&d.valueOf()<Date.now()+10*60*1000))bad('INVALID_TIME','请选择有效的未来日期和时间');
 if(!/^((09|1[0-8]):00)$/.test(time))bad('INVALID_SLOT','当前仅支持 09:00–18:00 整点预约');
 return {serviceId:input.serviceId,requestedAt:d.toISOString(),remark:text(input.remark||'',300),...(keyed?{clientKey:input.clientKey}:{})};
}
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function evidence(v){return {registrationCode:text(v.registrationCode,40,15),licenseHolder:text(v.licenseHolder,120,2),evidenceReference:text(v.evidenceReference,200,6)};}
function service(v){
 const result={title:text(v.title,100,4),description:text(v.description,1200,10),price:text(v.price,80,1)};
 if(v.imageIds!==undefined){if(!Array.isArray(v.imageIds)||v.imageIds.length>6||v.imageIds.some(x=>!uuid(x))||new Set(v.imageIds).size!==v.imageIds.length)bad('INVALID_IMAGES','最多添加六张不同图片');result.imageIds=v.imageIds;}
 return result;
}
function report(v){if(!['publication','service','user','message'].includes(v.targetType)||!uuid(v.targetId))bad('INVALID_TARGET','举报目标无效');if(!['false_info','spam','unsafe','other'].includes(v.reason))bad('INVALID_REASON','举报原因无效');return {targetType:v.targetType,targetId:v.targetId,reason:v.reason,description:text(v.description||'',500)};}
module.exports={ApiError,bad,text,publication,merchant,booking,evidence,service,report,uuid,validCalendarDate};
