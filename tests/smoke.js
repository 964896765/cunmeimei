'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const store = new Map();
global.wx = {
 getStorageSync: (key) => store.get(key),
 setStorageSync: (key,val) => store.set(key, JSON.parse(JSON.stringify(val)))
};
const db = require('../miniprogram/utils/storage');
db.ensureDemoData();
assert.equal(db.allItems().length,10,'seed content count');
assert.equal(db.allItems().filter(i => i.kind==='merchant').length,2);
assert.equal(db.getItem('l2').type,'housing');
assert.equal(db.saveFavorite('m1'),true);
assert.equal(db.getStore().favorites.length,1);
assert.equal(db.saveFavorite('m1'),false);
assert.equal(db.getStore().favorites.length,0);
const p = db.createPublication({type:'used',title:'本地测试二手书桌',detail:'保养良好，正常使用，自提优先',price:'¥100',district:'中心街道'});
assert.match(p.status,/待审核/);
assert.equal(db.getStore().publications.length,1);
assert.equal(db.allItems().some(i=>i.id===p.id),false,'pending post is NOT public');
const b = db.createBooking({serviceId:'s1',serviceTitle:'演示保洁',date:'2026-11-01',time:'10:00',remark:'demo'});
assert.equal(db.getStore().bookings.length,1);
assert.equal(db.cancelBooking(b.id),true);
assert.equal(db.getStore().bookings[0].status,'已取消');
const conversation=db.openConversation('item-m1','演示店');
assert.equal(db.sendMessage(conversation.id,'hello demo'),true);
assert.equal(db.getStore().conversations.find(x=>x.id===conversation.id).items.at(-1).text,'hello demo');
db.requestMerchant({name:'测试店',category:'餐饮',district:'中心街道'});
assert.equal(db.getStore().merchantRequest.status,'待平台核验（演示）');
db.saveMerchantNotice('休息日公告');
assert.equal(db.getStore().merchantNotice,'休息日公告');
db.resetDemoData();
assert.equal(db.getStore().bookings.length,0);
assert.equal(db.getStore().publications.length,0);
console.log('PASS: seed, favorite, pending content, booking cancel, local chat, merchant request, reset');
