'use strict';
// WeChat's module loader consumes JavaScript; JSON remains the canonical source.
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../miniprogram/data');
const raw=fs.readFileSync(path.join(base,'industry-catalog.json'),'utf8').replace(/^\uFEFF/,'');const data=JSON.parse(raw);
const cats=data.categories,groups=cats.flatMap(x=>x.groups),items=groups.flatMap(x=>x.items);
if(cats.length!==27||groups.length!==83||items.length!==418||new Set([...cats,...groups,...items].map(x=>x.id)).size!==528)throw Error('Catalog structure or ID mismatch');
const codes=new Set(require('../miniprogram/utils/business-templates').templates.map(x=>x.code));
if(data.publicationConfig?.version!==1)throw Error('Missing publication configuration version');
for(const [id,policy]of Object.entries(data.publicationConfig.policies))if(!policy.businessCodes?.length||policy.businessCodes.some(x=>!codes.has(x))||!policy.publisherRoles?.length||!policy.channel||!policy.reviewPolicy)throw Error('Invalid publication policy '+id);
for(const item of items){
 if(!Array.isArray(item.aliases)||!item.aliases.length||item.aliases.some(x=>typeof x!=='string'||!x.trim()||x.length>40)||new Set(item.aliases).size!==item.aliases.length)throw Error('Missing/invalid aliases '+item.id);
 const config=item.publication;
 if(config?.schemaVersion!==1||typeof config.enabled!=='boolean'||!data.publicationConfig.policies[config.policy]||!Array.isArray(config.legacyKinds)||config.legacyKinds.some(x=>!['used','housing','service','community'].includes(x))||config.enabled!==(config.legacyKinds.length>0))throw Error('Invalid publication plan '+item.id);
}
fs.writeFileSync(path.join(base,'industry-catalog.js'),'// Generated from industry-catalog.json by scripts/build_classification.js.\nmodule.exports = '+JSON.stringify(data)+';\n');
console.log('PASS: canonical 27/83/418 JSON compiled to a native WeChat JavaScript module');
