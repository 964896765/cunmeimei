'use strict';
const source=require('../data/industry-catalog.js');
const categories=source.categories;
const nodes=new Map(),projects=[];
for(const category of categories){nodes.set(category.id,category);for(const group of category.groups){nodes.set(group.id,group);for(const item of group.items){const project={...item,categoryId:category.id,categoryName:category.name,groupId:group.id,group:group.name,aliases:Array.isArray(item.aliases)?item.aliases:[]};projects.push(project);nodes.set(item.id,project);}}}
function publicationFor(id){const p=nodes.get(id),config=p?.publication,policy=source.publicationConfig?.policies[config?.policy];if(!p?.groupId||config?.schemaVersion!==1||!policy)return null;return {categoryId:id,schemaVersion:config.schemaVersion,...policy,enabled:config.enabled===true,legacyKinds:[...(config.legacyKinds||[])]};}
function kindsFor(id){const config=publicationFor(id);return config?.enabled?config.legacyKinds:[];}
function validateReference(id,version,kind){return typeof id==='string'&&version===source.version&&kindsFor(id).includes(kind);}
module.exports={source,categories,projects,find:id=>nodes.get(id),publicationFor,kindsFor,validateReference};
