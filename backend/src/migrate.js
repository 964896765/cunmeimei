'use strict';
const {Pool} = require('pg');
const {checkMigrations,applyMigrations} = require('./schema-migrations');
async function main() {
  if(!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
  if(process.env.DATA_DRIVER === 'memory') throw Error('Cannot migrate memory mode');
  const checkOnly=process.argv.includes('--check');
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
  try {
    const result=checkOnly?{status:await checkMigrations(pool),appliedNow:[]}:await applyMigrations(pool);
    console.log(JSON.stringify(result,null,2));
    if(!result.status.ok)process.exitCode=1;
  } finally { await pool.end(); }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
