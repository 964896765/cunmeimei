'use strict';
const {ApiError,text,uuid}=require('./rules');
const {transaction}=require('./points-repository');
const geography=require('./geography');
const fail=(code,message,status=400)=>{throw new ApiError(status,code,message);};
function sourceUrl(value){
 const input=text(value||'',500);if(!input)return '';
 try{const url=new URL(input),host=url.hostname.toLowerCase();if(url.protocol!=='https:'||url.username||url.password||url.port||!host.includes('.')||require('node:net').isIP(host.replace(/^\[|\]$/g,''))||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host))throw Error();return url.toString();}catch{fail('INVALID_SOURCE','来源须填写公开HTTPS地址，不能含账号密码或本机地址');}
}
function content(v){
 if(!v||!['news','banner','ad'].includes(v.kind))fail('INVALID_HOME_CONTENT','请选择资讯、平台轮播或广告');
 const cityCode=text(v.cityCode||'',6);geography.cityReference(cityCode);
 const title=text(v.title,80,2),summary=text(v.summary||'',240);
 if(v.body!==undefined&&typeof v.body!=='string')fail('INVALID_HOME_BODY','资讯正文格式无效');
 const body=(v.body||'').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').trim();if(body.length>8000)fail('INVALID_HOME_BODY','正文最多8000字');
 const startsAt=new Date(v.startsAt),endsAt=new Date(v.endsAt);
 if(!Number.isFinite(+startsAt)||!Number.isFinite(+endsAt)||endsAt<=startsAt||endsAt-startsAt>366*86400000)fail('INVALID_HOME_SCHEDULE','排期时间无效，单次排期最多366天');
 if(!Number.isSafeInteger(v.priority)||v.priority<0||v.priority>100)fail('INVALID_HOME_PRIORITY','排序应为0至100的整数');
 const targetId=v.targetId||null,imageId=v.imageId||null,advertiserId=v.advertiserId||null;
 if([targetId,imageId,advertiserId].some(x=>x!==null&&!uuid(x)))fail('INVALID_HOME_REFERENCE','引用编号无效');
 const sourceName=text(v.sourceName||'',100),source=sourceUrl(v.sourceUrl);
 if(v.kind==='news'&&(!body||!sourceName||!source))fail('HOME_SOURCE_REQUIRED','资讯必须有正文、来源名称和原始来源地址');
 if(v.kind==='ad'&&(!cityCode||!advertiserId||!targetId||!imageId))fail('AD_REFERENCES_REQUIRED','广告须指定城市、已核验广告主、本人公开信息及其已审核图片');
 if(v.kind==='banner'&&!targetId)fail('BANNER_TARGET_REQUIRED','平台轮播须关联已公开信息');
 return {kind:v.kind,cityCode,title,summary,body,sourceName,sourceUrl:source,targetId,imageId,advertiserId,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),priority:v.priority};
}
const publicEntry=row=>({id:row.id,kind:row.kind,...Object.fromEntries(['cityCode','title','summary','body','sourceName','sourceUrl','targetId','imageId','startsAt','endsAt'].map(k=>[k,row.payload[k]])),label:row.kind==='ad'?'广告':row.kind==='banner'?'平台推荐':'同城资讯',createdAt:row.created_at,revision:row.revision});
function attachHomeContent(repo,pool){
 repo.homeTargets=async({q='',cityCode='',page=1}={})=>{
  geography.cityReference(cityCode);q=text(q,80);
  const rows=(await pool.query(`SELECT p.id,p.title,p.district,p.attributes->>'cityCode' city_code,p.image_ids,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) ORDER BY a.name,a.id) FROM advertisers a WHERE a.user_id=p.user_id AND a.status='verified' AND a.valid_until>clock_timestamp()),'[]'::jsonb) advertisers
   FROM publications p JOIN app_users u ON u.id=p.user_id AND u.status='active' JOIN service_regions r ON r.name=p.district AND r.enabled
   WHERE p.status='published' AND NOT p.is_test AND (p.expires_at IS NULL OR p.expires_at>clock_timestamp())
    AND ($1='' OR p.title ILIKE '%'||$1||'%') AND ($2='' OR p.attributes->>'cityCode'=$2)
   ORDER BY p.created_at DESC,p.id DESC LIMIT 21 OFFSET $3`,[q,cityCode,(page-1)*20])).rows;
  return {items:rows.slice(0,20),hasMore:rows.length>20};
 };
 repo.homeAdvertisers=async(page=1)=>(await pool.query('SELECT id,user_id,name,status,valid_until,revision,evidence_reference FROM advertisers ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $1',[(page-1)*20])).rows;
 async function eligible(c,p){
  if(p.kind==='news')return true;
  const target=(await c.query("SELECT p.* FROM publications p JOIN service_regions r ON r.name=p.district AND r.enabled WHERE p.id=$1 AND p.status='published' AND NOT p.is_test AND (p.expires_at IS NULL OR p.expires_at>clock_timestamp())",[p.targetId])).rows[0];
  if(!target)return false;
  if(p.cityCode&&target.attributes?.cityCode!==p.cityCode)return false;
  if(p.imageId&&!target.image_ids.includes(p.imageId))return false;
  if(p.kind==='ad'&&!(await c.query('SELECT 1 FROM publications p WHERE p.id=$1 AND '+require('./promotion-eligibility').promotionClause('p'),[target.id])).rows.length)return false;
  if(p.kind==='ad')return !!(await c.query("SELECT a.id FROM advertisers a JOIN app_users u ON u.id=a.user_id AND u.status='active' WHERE a.id=$1 AND a.user_id=$2 AND a.status='verified' AND a.valid_until>clock_timestamp()",[p.advertiserId,target.user_id])).rows.length;
  return true;
 }
 const audit=(c,id,action,note)=>c.query("INSERT INTO admin_audit_events(action,target_type,target_id,notes) VALUES($2,'home_content',$1,$3)",[id,'home_'+action,note]);
 repo.saveHomeContent=(id,v,actor)=>transaction(pool,async c=>{
  const p=content(v);let row;
  if(id){if(!uuid(id)||!Number.isSafeInteger(v.revision)||v.revision<1)fail('INVALID_HOME_REVISION','内容编号或版本无效');
   row=(await c.query("UPDATE home_content SET kind=$3,city_code=$4,payload=$5,starts_at=$6,ends_at=$7,priority=$8,status='draft',revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 RETURNING *",[id,v.revision,p.kind,p.cityCode,p,p.startsAt,p.endsAt,p.priority])).rows[0];if(!row)fail('HOME_CONTENT_CHANGED','内容已更新，请重新读取后再修改',409);
  }else row=(await c.query('INSERT INTO home_content(kind,city_code,payload,starts_at,ends_at,priority) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[p.kind,p.cityCode,p,p.startsAt,p.endsAt,p.priority])).rows[0];
  await audit(c,row.id,'draft',actor+': 保存草稿；编辑后须重新审核');return {...row.payload,id:row.id,status:row.status,revision:row.revision};
 });
 repo.reviewHomeContent=(id,v,actor)=>transaction(pool,async c=>{
  if(!uuid(id)||!['published','disabled'].includes(v.status)||!Number.isSafeInteger(v.revision))fail('INVALID_HOME_REVIEW','审核参数无效');
  const note=text(v.reason,500,8),row=(await c.query('SELECT * FROM home_content WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!row||row.revision!==v.revision)fail('HOME_CONTENT_CHANGED','内容已变化，请重新读取',409);
  if(v.status==='published'){
   if(row.kind!=='news'){
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['homeinventory']);
    const slots=(await c.query("SELECT coalesce(sum(CASE WHEN s.enabled THEN s.capacity ELSE (SELECT count(*) FROM ad_reservations r WHERE r.slot_id=s.id AND r.cancelled_at IS NULL) END),0)::int n FROM ad_slots s WHERE ($1='' OR city_code=$1) AND starts_at<$3 AND ends_at>$2",[row.city_code,row.starts_at,row.ends_at])).rows[0].n;
    const manual=(await c.query("SELECT count(*)::int n FROM home_content WHERE id<>$1 AND kind IN ('ad','banner') AND status='published' AND ($2='' OR city_code IN ('',$2)) AND starts_at<$4 AND ends_at>$3",[id,row.city_code,row.starts_at,row.ends_at])).rows[0].n;if(slots+manual>=5)fail('CAROUSEL_CAPACITY','该城市重叠轮播位置已满，请调整排期');
   }
   if(v.textReviewed!==true||row.payload.imageId&&v.imagesReviewed!==true||row.kind==='news'&&v.sourceReviewed!==true||row.kind==='ad'&&v.advertisingReviewed!==true)fail('HOME_CHECKS_REQUIRED','请先完成正文、图片、来源或广告证明检查');
   if(new Date(row.ends_at)<=new Date()||!await eligible(c,row.payload))fail('HOME_TARGET_UNAVAILABLE','排期、目标信息、图片归属或广告主核验已失效',409);
  }
  const updated=(await c.query('UPDATE home_content SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision',[id,v.status])).rows[0];
  await audit(c,id,v.status,actor+': '+note);return {id,status:v.status,revision:updated.revision};
 });
 repo.adminHomeContent=async(page=1)=>({items:(await pool.query('SELECT id,status,revision,payload FROM home_content ORDER BY updated_at DESC,id DESC LIMIT 20 OFFSET $1',[(page-1)*20])).rows.map(r=>({...r.payload,id:r.id,status:r.status,revision:r.revision})),total:(await pool.query('SELECT count(*)::int n FROM home_content')).rows[0].n});
 repo.publicHomeContent=async(cityCode,kind='',page=1)=>{
  geography.cityReference(cityCode);
  const rows=(await pool.query("SELECT * FROM home_content WHERE status='published' AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp() AND (city_code='' OR city_code=$1) AND (kind=$2 OR $2='carousel' AND kind IN ('banner','ad')) ORDER BY priority DESC,starts_at DESC,id DESC LIMIT $4 OFFSET $3",[cityCode,kind,kind==='news'?(page-1)*20:0,kind==='news'?21:100])).rows;
  const items=[];for(const row of rows)if(await eligible(pool,row.payload))items.push(publicEntry(row));
  return {items:items.slice(0,20),hasMore:kind==='news'&&items.length>20};
 };
 repo.publicHomeEntry=async id=>{if(!uuid(id))return null;const row=(await pool.query("SELECT * FROM home_content WHERE id=$1 AND status='published' AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp()",[id])).rows[0];return row&&await eligible(pool,row.payload)?publicEntry(row):null;};
 repo.reportHomeContent=(uid,id,reason)=>transaction(pool,async c=>{
  if(!uuid(id)||!await repo.publicHomeEntry(id))fail('HOME_CONTENT_UNAVAILABLE','该内容已停止展示',404);
  const note=text(reason,500,8);await c.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE',[uid]);
  const old=(await c.query("SELECT id FROM home_content_reports WHERE user_id=$1 AND content_id=$2 AND status='pending'",[uid,id])).rows[0];if(old)return {...old,replayed:true};
  if((await c.query("SELECT count(*)::int n FROM home_content_reports WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[uid])).rows[0].n>=5)fail('HOME_REPORT_LIMIT','提交较频繁，请稍后再试',429);
  return (await c.query('INSERT INTO home_content_reports(user_id,content_id,reason) VALUES($1,$2,$3) RETURNING id',[uid,id,note])).rows[0];
 });
 repo.homeReports=async(page=1)=>({items:(await pool.query("SELECT r.id,r.content_id,r.reason,r.status,r.response,r.revision,r.created_at,c.payload->>'title' title FROM home_content_reports r JOIN home_content c ON c.id=r.content_id ORDER BY (r.status='pending') DESC,r.created_at,r.id LIMIT 20 OFFSET $1",[(page-1)*20])).rows,total:(await pool.query('SELECT count(*)::int n FROM home_content_reports')).rows[0].n});
 repo.resolveHomeReport=(id,v,actor)=>transaction(pool,async c=>{
  if(!uuid(id)||!['resolved','rejected'].includes(v.status)||!Number.isSafeInteger(v.revision))fail('INVALID_HOME_REPORT_REVIEW','纠错处理参数无效');
  const response=text(v.response,800,8),r=(await c.query("UPDATE home_content_reports SET status=$3,response=$4,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 AND status='pending' RETURNING user_id,content_id",[id,v.revision,v.status,response])).rows[0];if(!r)fail('HOME_REPORT_CHANGED','该纠错记录已处理',409);
  await audit(c,r.content_id,'report_'+v.status,actor+': '+response);
  await c.query("INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES($1,'首页内容纠错已有答复',$3,'home-report',$2)",[r.user_id,id,response]);return {ok:true};
 });
 repo.ownHomeReport=async(uid,id)=>(await pool.query('SELECT id,content_id,status,response,reason,created_at FROM home_content_reports WHERE id=$1 AND user_id=$2',[id,uid])).rows[0]||null;
 return repo;
}
module.exports={attachHomeContent,content};
