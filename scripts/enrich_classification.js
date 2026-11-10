'use strict';
// The supplied plan is input data. It does not authorize opening a publication channel.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(root,'miniprogram/data/industry-catalog.json');
const planFile=process.argv[2]||path.join(root,'docs/CLASSIFICATION_418_PLAN.md');
const plan=fs.readFileSync(planFile,'utf8'),data=JSON.parse(fs.readFileSync(file,'utf8'));
const legacySnapshot=require('../docs/classification-legacy-access.json');
const policies={
 USED:{businessCodes:['GOODS'],channel:'resident_publication',publisherRoles:['resident'],reviewPolicy:'standard'},
 PROPERTY:{businessCodes:['PROPERTY'],channel:'property_publication',publisherRoles:['resident','verified_agent'],reviewPolicy:'property_review'},
 PROPERTY_BIZ:{businessCodes:['MERCHANT','SERVICE'],channel:'property_provider',publisherRoles:['verified_merchant'],reviewPolicy:'property_provider_review'},
 SERVICE_PAIR:{businessCodes:['SERVICE','MERCHANT'],channel:'resident_demand_or_verified_service',publisherRoles:['resident_demand','verified_merchant'],reviewPolicy:'separate_demand_and_provider'},
 JOB:{businessCodes:['JOB'],channel:'verified_recruitment',publisherRoles:['verified_employer'],reviewPolicy:'employer_and_job_review'},
 JOB_FILTER:{businessCodes:['JOB'],channel:'employment_intent_selector',publisherRoles:['verified_employer'],reviewPolicy:'employer_and_job_review'},
 MERCHANT:{businessCodes:['MERCHANT'],channel:'merchant_directory',publisherRoles:['verified_merchant'],reviewPolicy:'merchant_verification'},
 MERCHANT_SERVICE:{businessCodes:['SERVICE'],channel:'merchant_service',publisherRoles:['verified_merchant'],reviewPolicy:'merchant_service_review'},
 EVENT:{businessCodes:['EVENT'],channel:'resident_event',publisherRoles:['resident'],reviewPolicy:'event_review'},
 EVENT_BIZ:{businessCodes:['EVENT'],channel:'institution_event',publisherRoles:['verified_institution'],reviewPolicy:'institution_event_review'},
 COMMUNITY:{businessCodes:['PUBLIC'],channel:'resident_community',publisherRoles:['resident'],reviewPolicy:'standard'},
 CURATED_INFO:{businessCodes:['PUBLIC'],channel:'curated_information',publisherRoles:['operator'],reviewPolicy:'source_review'},
 LICENSED_PROVIDER:{businessCodes:['SERVICE'],channel:'licensed_provider',publisherRoles:['licensed_provider'],reviewPolicy:'qualification_review'},
 LICENSED_DIRECTORY:{businessCodes:['MERCHANT'],channel:'licensed_directory',publisherRoles:['verified_institution','operator'],reviewPolicy:'qualification_and_source_review'},
 OFFICIAL_DIRECTORY:{businessCodes:['PUBLIC'],channel:'official_guidance',publisherRoles:['operator'],reviewPolicy:'official_source_review'}
};
const rows=new Map();for(const line of plan.split(/\r?\n/)){
 const parts=line.split('|').map(x=>x.trim());if(!/^C\d{2}G\d{2}S\d{2}$/.test(parts[1]||''))continue;
 if(rows.has(parts[1]))throw Error('Duplicate plan ID '+parts[1]);
 const policy=parts[4]?.replace(/`/g,'');if(!policies[policy])throw Error('Unknown plan policy '+policy);
 rows.set(parts[1],{name:parts[3],policy,flow:parts[5],requirements:parts[6]});
}
if(rows.size!==418)throw Error('Plan must contain exactly 418 stable IDs');
const groups=new Map(data.categories.flatMap(c=>c.groups).map(g=>[g.id,g]));
const aliases=new Map();for(const line of fs.readFileSync(path.join(__dirname,'catalog-aliases.tsv'),'utf8').trim().split(/\r?\n/)){
 const [id,terms]=line.split('\t'),group=groups.get(id);if(!group||aliases.has(id))throw Error('Alias group mismatch '+id);
 const entries=terms.split(';');if(entries.length!==group.items.length)throw Error('Alias count mismatch '+id+': '+entries.length+'/'+group.items.length);
 aliases.set(id,entries.map(value=>value.split('|').map(x=>x.trim())));
}
if(aliases.size!==83)throw Error('Alias manifest must explicitly cover 83 groups');
const identity=()=>data.categories.map(c=>[c.id,c.name,c.groups.map(g=>[g.id,g.name,g.items.map(p=>[p.id,p.name])])]);
const before=JSON.stringify(identity()),changes=[],aliasIndex=new Map();
for(const category of data.categories)for(const group of category.groups)for(const [index,item]of group.items.entries()){
 if(item.id!==group.id+'S'+String(index+1).padStart(2,'0'))throw Error('Alias order changed; review stable-ID binding '+item.id);
 const row=rows.get(item.id);if(!row||row.name!==item.name)throw Error('Plan name/ID mismatch '+item.id);
 const terms=[...new Set(aliases.get(group.id)[index])].filter(x=>x!==item.name);
 if(!terms.length||terms.some(x=>!x||x.length>40))throw Error('Invalid aliases '+item.id);
 item.aliases=terms;
 const legacyKinds=legacySnapshot.filter(x=>x.categoryId===item.id).map(x=>x.kind);
 item.publication={schemaVersion:1,policy:row.policy,enabled:legacyKinds.length>0,legacyKinds};
 changes.push({id:item.id,name:item.name,policy:row.policy,enabled:item.publication.enabled,legacyKinds,aliases:terms,plannedFlow:row.flow,requirements:row.requirements,reviewStatus:'pending_business_review'});
 for(const alias of terms){const word=alias.toLowerCase();if(!aliasIndex.has(word))aliasIndex.set(word,[]);aliasIndex.get(word).push(item.id);}
}
if(JSON.stringify(identity())!==before)throw Error('Category IDs or names changed');
data.publicationConfig={version:1,status:'proposal_with_preserved_legacy_access',policies};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const report={checkedAt:new Date().toISOString(),sourcePlanSha256:sha(plan),stableIdentitySha256:sha(before),categories:27,groups:83,projects:418,aliasCovered:changes.filter(x=>x.aliases.length).length,aliasTerms:changes.reduce((n,x)=>n+x.aliases.length,0),planCovered:changes.length,legacyMapped:changes.filter(x=>x.enabled).length,newChannelsOpened:0,businessReviewComplete:false,aliasReview:'lexical review against each project name and parent group; not business/qualification approval',aliasCollisions:[...aliasIndex].filter(([,ids])=>ids.length>1).map(([alias,ids])=>({alias,ids})),items:changes};
if(report.legacyMapped!==43)throw Error('Existing access changed; expected 43 legacy mappings');
fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
fs.writeFileSync(path.join(root,'docs/CLASSIFICATION_418_PLAN.md'),plan);
fs.writeFileSync(path.join(root,'docs/classification-418-integration-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS 418 aliases and explicit publication plans; 43 existing mappings preserved; zero newly opened channels');
