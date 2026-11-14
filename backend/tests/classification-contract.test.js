'use strict';
const {acceptedConsent}=require('./helpers/publication-confirmation');
const test=require('node:test'),assert=require('node:assert/strict');
const contract=require('../../miniprogram/utils/classification-contract');
const {publicationExtras}=require('../src/product-repository');
const {validateDraft}=require('../src/account-drafts');
test('imported candidate catalog has complete unique 27/83/418 IDs and stable seven template codes',()=>{
 const cats=contract.categories,groups=cats.flatMap(c=>c.groups),items=groups.flatMap(g=>g.items);
 assert.deepEqual([cats.length,groups.length,items.length],[27,83,418]);
 assert.equal(new Set([...cats,...groups,...items].map(x=>x.id)).size,528);
 assert.equal(new Set(items.map(x=>x.name)).size,418);
 assert.equal(contract.source.version,'2.0-audit');
 assert.deepEqual(contract.source,require('../../miniprogram/data/industry-catalog.json'),'native generated module matches the canonical import');
 assert.deepEqual(require('../../miniprogram/utils/classification').templateCodes,['JOB','PROPERTY','GOODS','MERCHANT','SERVICE','EVENT','PUBLIC']);
});
test('category references do not open regulated or unmapped templates and remain draft compatible',()=>{
 const reference={categoryId:'C04G01S01',categoryVersion:'2.0-audit'};
 assert.deepEqual(publicationExtras({type:'used',attributes:reference}).attributes,reference);
 for(const attrs of [{...reference,categoryVersion:'future'},{categoryId:reference.categoryId},{...reference,categoryId:'C23G01S01'}]) assert.throws(()=>publicationExtras({type:'used',attributes:attrs}));
 assert.throws(()=>publicationExtras({type:'service',attributes:reference}));
 const draft={kind:'used',title:'',detail:'',price:'',district:'',attributes:reference,imageIds:[],clientKey:'draft_classification_123'};
 assert.deepEqual(validateDraft(draft).attributes,reference);
 assert.throws(()=>validateDraft({...draft,attributes:{...reference,categoryVersion:'invalid'}}));
 assert.deepEqual(publicationExtras({type:'used',attributes:{}}).attributes,{},'existing records need not be reclassified');
});
test('memory feed category filtering precedes pagination and never includes another category or pending publication',async()=>{
 const repo=require('../src/memory-repository').createMemoryRepository();await repo.seedRegions(['中心街道']);
 for(const [categoryId,status]of [['C04G01S01','published'],['C04G01S02','published'],['C04G01S01','pending']]){
 const row=await repo.createPublication('owner',{publicationConsent:acceptedConsent(),type:'used',title:'目录过滤验证',description:'公开信息分类验证',district:'中心街道',attributes:{categoryId,categoryVersion:'2.0-audit'}});
 repo.__publications.find(x=>x.id===row.id).status=status;
 }
 assert.equal((await repo.listFeed({categoryId:'C04G01S01',limit:1})).length,1);
 assert.equal((await repo.listFeed({categoryId:'C04',limit:20})).length,2);
 assert.equal((await repo.listFeed({categoryId:'C23',limit:20})).length,0);
});

test('encoded Chinese search and region parameters decode once without breaking malformed input',()=>{
 const {decodeQuery}=require('../../miniprogram/utils/route-query');
 for(const q of ['家电维修','中心街道','50%折扣','C03G02S01'])assert.equal(decodeQuery(encodeURIComponent(q)),q);
 assert.equal(decodeQuery('%broken'),'%broken');assert.equal(decodeQuery(undefined),'');
 assert.equal(decodeQuery(encodeURIComponent('房'.repeat(100))).length,80);
});
