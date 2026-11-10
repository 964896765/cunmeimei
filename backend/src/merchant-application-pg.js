'use strict';
// Serialize merchant application creation per user; otherwise simultaneous
// first-time submissions can pass the SELECT check and insert duplicates.
// This lock is transaction-scoped and works across PostgreSQL connections.
async function createMerchantApplication(pool,userId,input,mapRow=x=>x){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['city-life-merchant-application:'+userId]);
  const existing=(await c.query("SELECT * FROM merchant_applications WHERE user_id=$1 AND status IN ('pending','in_review','needs_documents') ORDER BY created_at DESC LIMIT 1",[userId])).rows[0];
  const result=existing||(await c.query(
   'INSERT INTO merchant_applications(user_id,name,category,district) VALUES($1,$2,$3,$4) RETURNING *',
   [userId,input.name,input.category,input.district]
  )).rows[0];
  await c.query('COMMIT');
  return mapRow(result);
 }catch(e){
  await c.query('ROLLBACK');
  throw e;
 }finally{c.release();}
}
module.exports={createMerchantApplication};
