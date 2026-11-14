'use strict';
const crypto = require('node:crypto');
const notice = require('./publication-notice');
const reviewRules = require('../../miniprogram/utils/publication-review-rules');
const {ApiError} = require('./rules');

function canonical(value) {
 if (Array.isArray(value)) return value.map(canonical);
 if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]));
 return value;
}
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function snapshot(row, contactSettings={}) {
 return {
  type:row.type || 'service',title:row.title,detail:row.description ?? row.detail,
  price:row.price,district:row.district,attributes:row.attributes || {},imageIds:row.image_ids || row.imageIds || [],
  ...(row.merchant_id ? {merchantId:row.merchant_id} : {}),contactSettings
 };
}

function reviewRule(row) {
 const projectId = row.attributes?.categoryId || '';
 const project = require('../../miniprogram/utils/classification-contract').find(projectId);
 return reviewRules.resolve({projectId,type:row.type,policy:project?.publication?.policy});
}

function assertReview(rule, checks) {
 if (rule.checks.some(check => checks[check.key] !== true)) {
  throw new ApiError(400,'CATEGORY_REVIEW_REQUIRED','请逐项完成'+rule.name+'，用户确认记录须与平台审核分别核查。');
 }
}

async function persist(client, uid, row, consent, {kind='publication',contactSettings={}} = {}) {
 const accepted = notice.validate(consent);
 const content = snapshot(row,contactSettings);
 const media = (await client.query('SELECT id,content_sha256 AS hash FROM content_images WHERE id=ANY($1::uuid[]) ORDER BY id',[content.imageIds])).rows;
 content.media = media;
 const revision = row.revision || (await client.query('SELECT coalesce(max(content_revision),0)+1 AS revision FROM publication_confirmations WHERE publication_id=$1 AND target_kind=$2',[row.id,kind])).rows[0].revision;
 await client.query(`INSERT INTO publication_confirmations(user_id,publication_id,target_kind,content_revision,notice_version,notice_hash,notice_content,content_snapshot,content_hash,review_rule)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[uid,row.id,kind,revision,accepted.version,accepted.hash,notice.document().content,content,hash(content),reviewRule(row)]);
}

function attach(repo,pool) {
 repo.publicationRecords = async id => {
  const confirmations = (await pool.query(`SELECT id,user_id AS "userId",publication_id AS "publicationId",target_kind AS kind,
   content_revision AS revision,notice_version AS "noticeVersion",notice_hash AS "noticeHash",notice_content AS "noticeContent",
   confirmed_at AS "confirmedAt",content_snapshot AS content,content_hash AS "contentHash",review_rule AS "reviewRule"
   FROM publication_confirmations WHERE publication_id=$1 ORDER BY confirmed_at,id`,[id])).rows;
  const publication = (await pool.query('SELECT id,user_id AS "userId",status,revision,attributes,type FROM publications WHERE id=$1',[id])).rows[0];
  const service = publication ? null : (await pool.query('SELECT id,status,merchant_id AS "merchantId" FROM service_catalog WHERE id=$1',[id])).rows[0];
  if (!publication && !service) return null;
  const history = (await pool.query(`SELECT id,previous_status AS "previousStatus",status,reason,content_revision AS revision,recorded_at AS "recordedAt"
   FROM publication_status_history WHERE publication_id=$1 ORDER BY recorded_at,id`,[id])).rows;
  const audit = (await pool.query(`SELECT id,action,notes,created_at AS "createdAt" FROM admin_audit_events
   WHERE target_id=$1 OR (target_type='report' AND target_id IN (SELECT id FROM content_reports WHERE target_id=$1))
   OR (target_type='risk' AND target_id IN (SELECT id FROM risk_cases WHERE target_id=$1)) ORDER BY created_at,id`,[id])).rows;
  const reports = (await pool.query('SELECT id,reason,status,reviewer_note AS response,created_at AS "createdAt" FROM content_reports WHERE target_id=$1 ORDER BY created_at,id',[id])).rows;
  const industryReports = (await pool.query('SELECT id,reason,status,response,created_at AS "createdAt" FROM industry_reports WHERE entry_id=$1 ORDER BY created_at,id',[id])).rows;
  const accountActions = publication ? (await pool.query('SELECT id,action,actor_role AS "actorRole",reason,created_at AS "createdAt" FROM trust_actions WHERE user_id=$1 ORDER BY created_at,id',[publication.userId])).rows : [];
  const source=service?(await pool.query('SELECT entry_id AS "entryId",source_revision AS revision FROM industry_service_links WHERE service_id=$1',[id])).rows[0]||null:null;
  return {item:publication || service,reviewRule:publication ? reviewRule(publication) : reviewRules.resolve({}),confirmations,history,audit,reports:[...reports,...industryReports],accountActions,source,legacy:confirmations.length===0};
 };
 return repo;
}

function attachMemory(repo,publications,audits,services=[]) {
 const records = [];
 function retain(uid,row,kind='publication') {
  const document = notice.document();
  const content = snapshot(row,row.contactSettings);
  const revision = row.revision || records.filter(record=>record.publicationId===row.id).length+1;
  records.push({id:crypto.randomUUID(),userId:uid,publicationId:row.id,kind,revision,noticeVersion:document.version,noticeHash:document.hash,noticeContent:document.content,confirmedAt:new Date().toISOString(),content,contentHash:hash(content),reviewRule:reviewRule(row)});
 }
 const create = repo.createPublication;
 repo.createPublication = async (uid,value) => {
  notice.validate(value.publicationConsent);
  const previous = value.clientKey && publications.find(row=>row.userId===uid&&row.clientKey===value.clientKey);
  if(previous){
   if(hash(snapshot(previous,previous.contactSettings))!==hash(snapshot(value,value.contactSettings)))throw new ApiError(409,'REQUEST_KEY_REUSED','提交标识已用于其他内容');
   return JSON.parse(JSON.stringify(previous));
  }
  const {publicationConsent,...content} = value;
  const row = await create(uid,content);retain(uid,row);return row;
 };
 const update = repo.updatePublication;
 repo.updatePublication = async (uid,id,value,revision) => {
  notice.validate(value.publicationConsent);
  const result = await update(uid,id,value,revision);
  if(result?.id)retain(uid,result);return result;
 };
 const createService = repo.createMerchantService;
 if(createService)repo.createMerchantService = async (uid,id,value) => {
  notice.validate(value.publicationConsent);
  const {publicationConsent,...content}=value;
  const row=await createService(uid,id,content);if(row)retain(uid,row,'service');return row;
 };
 const changeService = repo.changeMerchantServiceStatus;
 if(changeService)repo.changeMerchantServiceStatus = async (uid,mid,id,action,consent) => {
  if(action==='resubmit')notice.validate(consent);
  const row=await changeService(uid,mid,id,action);if(row&&action==='resubmit')retain(uid,row,'service');return row;
 };
 repo.assertContentReview = async (id,checks) => {
  const row = publications.find(item=>item.id===id);
  if(row)assertReview(reviewRule(row),checks);
 };
 repo.publicationRecords = async id => {
  const item=publications.find(row=>row.id===id)||services.find(row=>row.id===id);
  if(!item)return null;
  const confirmations=records.filter(row=>row.publicationId===id);
  return JSON.parse(JSON.stringify({item,reviewRule:reviewRule(item),confirmations,history:[],audit:audits.filter(row=>row.id===id),reports:[],accountActions:[],legacy:confirmations.length===0}));
 };
 return repo;
}

module.exports = {snapshot,hash,reviewRule,assertReview,persist,attach,attachMemory};
