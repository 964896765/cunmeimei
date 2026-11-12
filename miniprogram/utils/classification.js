'use strict';
const contract=require('./classification-contract');
const business=require('./business-templates');
const templateCodes=Object.freeze(business.templates.map(x=>x.code));
const channels=business.channels;
const iconTypes={C01:'merchant',C02:'job',C03:'service',C04:'used',C05:'housing',C08:'community'};
function categoryItems(){return contract.categories.map(x=>({id:x.id,name:x.name,icon:'industry-'+x.id,iconType:iconTypes[x.id]||'service',candidate:true}));}
function normalize(value){const text=String(value||'');return (text.normalize?text.normalize('NFKC'):text).toLowerCase().replace(/[\s·•、，,。._\-\/]+/g,'');}
function termScore(project,word){
 const name=normalize(project.name),aliases=project.aliases.map(normalize);
 if(name===word)return 1000;
 if(aliases.includes(word))return 900;
 if(name.startsWith(word))return 800;
 if(aliases.some(x=>x.startsWith(word)))return 750;
 if(name.includes(word))return 700;
 if(aliases.some(x=>x.includes(word)))return 650;
 if(normalize(project.group).includes(word))return 350;
 if(normalize(project.categoryName).includes(word))return 250;
 return 0;
}
function matchScore(project,query){
 const phrase=normalize(query);if(!phrase)return 0;
 const exact=termScore(project,phrase),tokens=String(query).trim().split(/\s+/).map(normalize).filter(Boolean);
 if(exact||tokens.length<2)return exact;
 const scores=tokens.map(word=>termScore(project,word));return scores.every(Boolean)?Math.floor(scores.reduce((sum,x)=>sum+x,0)/scores.length)-20:0;
}
function searchProjects(categoryId,q=''){
 const query=String(q).trim().slice(0,80);let previous='';
 const results=contract.projects.map((project,index)=>({project,index,score:query?matchScore(project,query):0})).filter(x=>query?x.score>0:x.project.categoryId===categoryId);
 if(query)results.sort((a,b)=>b.score-a.score||a.index-b.index);
 return results.map(({project:p,score})=>{const result={...p,matchScore:score,firstOfGroup:!query&&p.groupId!==previous,kinds:contract.kindsFor(p.id)};previous=p.groupId;return result;});
}
module.exports={...contract,templateCodes,channels,categoryItems,searchProjects,matchScore,channelFor:require('./discovery-channels').channelFor};
