'use strict';

function attachExpiryReminders(repo, pool) {
 repo.sendExpiryReminders = async () => {
  const client = await pool.connect();
  try {
   await client.query('BEGIN');
   await client.query("SET LOCAL statement_timeout='10s'");
   // Lock only a bounded batch. Another worker can process other publications.
   const result = await client.query(`
    WITH candidates AS (
     SELECT p.id,p.user_id,p.expires_at,
      CASE WHEN p.expires_at<=now() THEN 'expired' ELSE 'expiring' END AS stage
     FROM publications p
     WHERE p.status='published' AND p.expires_at<=now()+interval '3 days'
      AND NOT EXISTS (
       SELECT 1 FROM publication_expiry_reminders r
       WHERE r.publication_id=p.id AND r.expires_at=p.expires_at
        AND r.stage=CASE WHEN p.expires_at<=now() THEN 'expired' ELSE 'expiring' END
      )
     ORDER BY p.expires_at,p.id LIMIT 100 FOR UPDATE OF p SKIP LOCKED
    ), recorded AS (
     INSERT INTO publication_expiry_reminders(publication_id,expires_at,stage)
     SELECT id,expires_at,stage FROM candidates ON CONFLICT DO NOTHING
     RETURNING publication_id,stage
    )
    INSERT INTO user_notifications(user_id,title,body,target_kind,target_id)
    SELECT c.user_id,
     CASE WHEN r.stage='expired' THEN '发布的信息已到期' ELSE '发布的信息即将到期' END,
     CASE WHEN r.stage='expired'
      THEN '信息已从公开列表隐藏。请在我的发布中核实内容，编辑后重新提交审核。'
      ELSE '信息将在三天内到期。请在我的发布中核实内容，仍有需要可编辑后重新提交审核。' END,
     'publication-expiry',c.id
    FROM recorded r JOIN candidates c ON c.id=r.publication_id RETURNING id`);
   await client.query('COMMIT');
   return result.rowCount;
  } catch (error) {
   await client.query('ROLLBACK');
   throw error;
  } finally { client.release(); }
 };
 return repo;
}

function startExpiryReminders(repo, { intervalMs=60000, onError=()=>console.error('[expiry-reminders] Database operation failed; retrying next minute.') }={}) {
 let stopped=false, running=null;
 const tick=()=>{
  if(stopped || running) return running;
  running=Promise.resolve().then(()=>repo.sendExpiryReminders()).catch(onError).finally(()=>{running=null;});
  return running;
 };
 const timer=setInterval(tick,intervalMs);
 timer.unref();
 tick();
 return async()=>{stopped=true;clearInterval(timer);if(running)await running;};
}
module.exports={attachExpiryReminders,startExpiryReminders};
