'use strict';
const page=require('./cursor-page'),{ApiError}=require('./rules');
const queries={
 users:`SELECT u.created_at::text AS "_cursorTime",u.id,u.display_name AS name,'unavailable' AS "identityStatus",EXISTS(SELECT 1 FROM app_identities i WHERE i.user_id=u.id AND i.provider='wechat_miniapp') AS "wechatLinked",ph.verified_until>now() AS "phoneVerified",t.revision,ph.masked_number AS "maskedPhone",t.risk_level AS "riskLevel",t.risk_until AS "riskUntil",t.restrict_publish AS "restrictPublish",t.restrict_contact AS "restrictContact" FROM app_users u LEFT JOIN account_trust t ON t.user_id=u.id LEFT JOIN verified_phones ph ON ph.user_id=u.id`,
 qualifications:`SELECT created_at::text AS "_cursorTime",id,user_id AS "userId",scope,status,revision,valid_until AS "validUntil" FROM qualification_checks`,
 risks:`SELECT created_at::text AS "_cursorTime",id,user_id AS "userId",target_type AS "targetType",target_id AS "targetId",signals,status FROM risk_cases WHERE status='pending'`,
 appeals:`SELECT created_at::text AS "_cursorTime",id,user_id AS "userId",reason,status,revision FROM trust_appeals WHERE status='pending'`,
 audit:`SELECT created_at::text AS "_cursorTime",id,user_id AS "userId",action,actor_role AS "actorRole",reason,created_at AS "createdAt" FROM trust_actions`
};
function attachTrustPagination(repo,pool){repo.trustPages=async(opts,section)=>{
 if(section&&!Object.hasOwn(queries,section))throw new ApiError(400,'INVALID_SECTION','未知管理列表');
 const dashboard=Object.fromEntries(Object.keys(queries).map(k=>[k,[]]));dashboard.pagination={};
 await Promise.all((section?[section]:Object.keys(queries)).map(async name=>{const ascending=['risks','appeals'].includes(name),op=ascending?'>':'<',direction=ascending?'ASC':'DESC';const rows=(await pool.query(`SELECT * FROM (${queries[name]}) records WHERE ($1::timestamptz IS NULL OR ("_cursorTime"::timestamptz,id)${op}($1::timestamptz,$2::uuid)) ORDER BY "_cursorTime"::timestamptz ${direction},id ${direction} LIMIT $3`,[opts.before?.t||null,opts.before?.id||null,opts.size+1])).rows;const result=page.pack(rows,opts);dashboard[name]=result.items;dashboard.pagination[name]={hasMore:result.hasMore,nextCursor:result.nextCursor};}));return dashboard;
 };return repo;}
module.exports={attachTrustPagination};
