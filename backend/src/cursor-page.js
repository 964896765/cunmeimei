'use strict';
const {ApiError,uuid,validCalendarDate}=require('./rules');
const invalid=()=>{throw new ApiError(400,'INVALID_CURSOR','分页参数无效，请重新读取第一页');};
function decode(raw){
 if(!raw)return null;if(typeof raw!=='string'||raw.length>400||!/^[A-Za-z0-9_-]+$/.test(raw))return invalid();
 try{const value=JSON.parse(Buffer.from(raw,'base64url').toString());if(typeof value.t!=='string'||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value.t)||!validCalendarDate(value.t.slice(0,10))||!Number.isFinite(Date.parse(value.t))||!uuid(value.id))return invalid();return {t:value.t,id:value.id};}catch(e){if(e instanceof ApiError)throw e;return invalid();}
}
function encode(row){return Buffer.from(JSON.stringify({t:row._cursorTime||row.createdAt||row.created_at,id:row.id})).toString('base64url');}
function options(url,defaultSize=20){const raw=url.searchParams.get('limit');if(raw!==null&&(!/^\d{1,3}$/.test(raw)||Number(raw)<1||Number(raw)>100))return invalid();return {size:raw===null?defaultSize:Number(raw),before:decode(url.searchParams.get('cursor'))};}
function pack(rows,opts){const hasMore=rows.length>opts.size,visible=rows.slice(0,opts.size),last=visible.at(-1);return {items:visible.map(({_cursorTime,...safe})=>safe),hasMore,nextCursor:hasMore&&last?encode(last):null};}
function memory(rows,opts){if(!opts)return rows;const sorted=rows.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||b.id.localeCompare(a.id));return sorted.filter(r=>!opts.before||Date.parse(r.createdAt)<Date.parse(opts.before.t)||Date.parse(r.createdAt)===Date.parse(opts.before.t)&&r.id<opts.before.id).slice(0,opts.size+1);}
module.exports={decode,encode,options,pack,memory};
