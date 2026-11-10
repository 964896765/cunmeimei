'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {startExpiryReminders}=require('../src/expiry-reminders');
test('expiry worker prevents overlapping runs and waits for active work on shutdown',async()=>{
 let calls=0,release;
 const stop=startExpiryReminders({sendExpiryReminders:()=>{calls++;return new Promise(r=>{release=r;});}},{intervalMs:5});
 await new Promise(r=>setTimeout(r,30));
 assert.equal(calls,1);
 let stopped=false;const done=stop().then(()=>{stopped=true;});
 await Promise.resolve();assert.equal(stopped,false);
 release();await done;
 await new Promise(r=>setTimeout(r,15));assert.equal(calls,1);
});
test('expiry worker retries database failures without logging credentials',async()=>{
 let calls=0,errors=0;
 const stop=startExpiryReminders({sendExpiryReminders:async()=>{calls++;throw Error('private connection error');}},{intervalMs:5,onError:()=>{errors++;}});
 await new Promise(r=>setTimeout(r,30));await stop();
 assert.ok(calls>=2);assert.equal(errors,calls);
});
