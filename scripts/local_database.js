'use strict';
const {execFileSync}=require('node:child_process');
function resolveLocalDatabase(){
 if(process.env.NODE_ENV!=='development'||process.env.DATA_DRIVER!=='postgres')throw Error('Local development PostgreSQL configuration required');
 const url=new URL(process.env.DATABASE_URL||'');
 if(url.hostname!=='127.0.0.1'||url.pathname!=='/citylife_dev')throw Error('Expected only the project loopback citylife_dev database');
 const container='citylife-local-dev-postgres-1';
 const project=execFileSync('docker',['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container],{encoding:'utf8',windowsHide:true}).trim();
 if(project!=='citylife-local-dev')throw Error('Unexpected development container ownership');
 const port=execFileSync('docker',['port',container,'5432/tcp'],{encoding:'utf8',windowsHide:true}).trim();const match=/^127\.0\.0\.1:(\d+)$/.exec(port);if(!match)throw Error('Expected a single loopback database port');
 url.port=match[1];return {dsn:url.toString(),container,port:Number(match[1])};
}
if(require.main===module)(async()=>{
 const target=resolveLocalDatabase(),{Pool}=require('../backend/node_modules/pg'),pool=new Pool({connectionString:target.dsn,connectionTimeoutMillis:5000,max:1});
 try{await pool.query('BEGIN READ ONLY');const status=await require('../backend/src/schema-migrations').checkMigrations(pool);await pool.query('ROLLBACK');console.log(JSON.stringify({database:'citylife_dev',loopbackPort:target.port,migrations:status}));}finally{await pool.end();}
})().catch(()=>{console.error('Local database inspection failed; connection details withheld.');process.exitCode=1;});
module.exports={resolveLocalDatabase};
