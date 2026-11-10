'use strict';
// Guard the opt-in integration suite: it creates and drops a random test schema.
// It MUST NOT run against a shared or production database.
function assertIsolatedDatabase(url){
 let parsed;
 try{parsed=new URL(url);}catch{throw Error('PG_TEST_DATABASE_URL must be a valid PostgreSQL URI');}
 const db=decodeURIComponent(parsed.pathname||'').replace(/^\//,'');
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||
    !['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||
    !/^([a-z0-9_]*_test|test_[a-z0-9_]+)$/i.test(db)||
    ['postgres','root','admin'].includes(decodeURIComponent(parsed.username||'').toLowerCase())){
  throw Error('Integration tests require a loopback PostgreSQL URI, a *_test/test_* database name, and a non-superuser test account');
 }
 return {database:db,host:parsed.hostname};
}
module.exports={assertIsolatedDatabase};
