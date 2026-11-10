'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {assertIsolatedDatabase}=require('../src/test-database-guard');
test('V0.9 integration tests reject production and remote database targets',()=>{
 assert.equal(assertIsolatedDatabase('postgres://citylife_test:password@127.0.0.1:55432/citylife_test').database,'citylife_test');
 for(const uri of ['postgres://citylife:pwd@127.0.0.1:5432/citylife','postgres://postgres:pwd@127.0.0.1:5432/citylife_test','postgres://test:pwd@db.company.cn:5432/citylife_test','http://test:pwd@127.0.0.1:5432/citylife_test'])assert.throws(()=>assertIsolatedDatabase(uri));
});
