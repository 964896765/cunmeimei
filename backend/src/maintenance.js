'use strict';
const {ApiError}=require('./rules');
function attachMaintenance(repo,pool){
 const jobs={
  contribution_rewards:()=>repo.processContributionRewards(),
  expired_benefits:()=>repo.expireBenefits(),
  expired_industry:()=>repo.expireIndustry(),
  unavailable_industry_bookings:()=>repo.endUnavailableIndustryBookings(),
  expired_points_holds:()=>repo.releaseExpiredPointsHolds(),
  expired_ads:()=>repo.expireAdCampaigns(),
  points_reconciliation:async()=>{const mismatches=await repo.reconcilePoints();if(mismatches.length)throw new ApiError(503,'POINTS_RECONCILIATION_FAILED','积分账本核对异常');return {mismatches:0};}
 };
 repo.runMaintenance=async()=>{
  const results={};
  for(const [name,execute] of Object.entries(jobs)){
   const c=await pool.connect();let locked=false;
   try{
    locked=(await c.query('SELECT pg_try_advisory_lock(hashtext($1)) locked',['maintenance:'+name])).rows[0].locked;
    if(!locked){results[name]={skipped:true};continue;}
    await c.query('INSERT INTO maintenance_jobs(name,started_at) VALUES($1,now()) ON CONFLICT(name) DO UPDATE SET started_at=now(),finished_at=NULL',[name]);
    try{
     const detail=await execute();
     await c.query("UPDATE maintenance_jobs SET finished_at=now(),last_success_at=now(),failures=0,last_error_code='' WHERE name=$1",[name]);
     await c.query("UPDATE operational_alerts SET status='resolved',updated_at=now() WHERE job_name=$1 AND status='pending'",[name]);
     results[name]={ok:true,...detail};
    }catch(e){
     const code=e instanceof ApiError?e.code:'MAINTENANCE_FAILED';
     await c.query('UPDATE maintenance_jobs SET finished_at=now(),failures=failures+1,last_error_code=$2 WHERE name=$1',[name,code]);
     await c.query("INSERT INTO operational_alerts(job_name,code) VALUES($1,$2) ON CONFLICT(job_name) DO UPDATE SET code=$2,status='pending',updated_at=now()",[name,code]);
     results[name]={ok:false,code};
    }
   }finally{try{if(locked)await c.query('SELECT pg_advisory_unlock(hashtext($1))',['maintenance:'+name]);}finally{c.release();}}
  }
  return results;
 };
 repo.operationsHealth=async()=>({jobs:(await pool.query('SELECT name,started_at,finished_at,last_success_at,failures,last_error_code FROM maintenance_jobs ORDER BY name')).rows,alerts:(await pool.query("SELECT id,job_name,code,created_at,updated_at FROM operational_alerts WHERE status='pending' ORDER BY created_at LIMIT 50")).rows});
 return repo;
}
function startMaintenance(repo,{intervalMs=60000,onError=()=>console.error('[maintenance] Database operation failed; retrying on next tick.')}={}){
 let stopped=false,running=null;
 const tick=()=>{if(stopped||running)return running;running=Promise.resolve().then(()=>repo.runMaintenance()).catch(onError).finally(()=>{running=null;});return running;};
 const timer=setInterval(tick,intervalMs);timer.unref?.();tick();
 return async()=>{stopped=true;clearInterval(timer);if(running)await running;};
}
module.exports={attachMaintenance,startMaintenance};
