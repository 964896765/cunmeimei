'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const registry=require('../../miniprogram/utils/classification'),schemas=require('../../miniprogram/utils/publication-schemas');
test('all 418 explicit plans and reviewed aliases preserve the 40 retained access mappings',()=>{
 const previous=require('../../docs/classification-legacy-access.json'),expected=new Map(previous.filter(x=>!require('../../miniprogram/utils/product-scope').isForumProject(x.categoryId)).map(x=>[x.categoryId,[x.kind]]));
 const {publicationExtras}=require('../src/product-repository'),{validateDraft}=require('../src/account-drafts');
 for(const item of registry.projects){
  assert.ok(item.aliases.length>0,item.id);assert.ok(registry.publicationFor(item.id),item.id);
  assert.deepEqual(registry.kindsFor(item.id),expected.get(item.id)||[],item.id);
  for(const alias of item.aliases)assert.ok(registry.searchProjects('',alias).some(x=>x.id===item.id),'alias resolves '+item.id+': '+alias);
  for(const kind of schemas.kinds){
   const schema=schemas.get(kind),attributes={categoryId:item.id,categoryVersion:registry.source.version,templateCode:schema.businessCode,templateVersion:'1'};
   const publication=()=>publicationExtras({type:kind,attributes}),draft=()=>validateDraft({kind,title:'',detail:'',price:'',district:'',attributes,imageIds:[],clientKey:'catalog_permission_matrix_123'});
   if((expected.get(item.id)||[]).includes(kind)){
    assert.deepEqual(publication().attributes,attributes);assert.deepEqual(draft().attributes,attributes);
    // Check all 40 current-version forms against both client and server validation.
    const current={...attributes,templateVersion:'3',cityCode:'310100',districtCode:'310101',...(kind==='community'?{}:{priceMode:'amount'}),...(kind==='used'?{condition:'正常使用'}:{}),...(kind==='housing'?{intent:'出租',area:'80',layout:'两室一厅'}:{})};
    const value={type:kind,title:'隔离验收发布项目',detail:'明确标记的隔离验收描述，不是真实业务供给。',price:kind==='community'?'':'100',attributes:current,imageIds:kind==='used'?['00000000-0000-4000-8000-000000000001']:[]};
    assert.equal(schemas.formError(kind,value),'',item.id);assert.deepEqual(publicationExtras(value).attributes,current,item.id);
   }
   else{assert.throws(publication,e=>e.code==='CATEGORY_NOT_READY',item.id+': '+kind);assert.throws(draft,e=>e.code==='CATEGORY_NOT_READY',item.id+': draft '+kind);}
  }
 }
 assert.equal(registry.projects.length,418);assert.equal(registry.projects.filter(x=>registry.kindsFor(x.id).length).length,40);
 for(const id of ['C02G01S01','C15G01S01','C23G01S01','C26G01S01','C27G01S01'])for(const kind of schemas.kinds)assert.equal(registry.validateReference(id,registry.source.version,kind),false,'regulated/unimplemented category remains closed');
});
test('search ranks exact names and actual aliases, normalizes case/width and combines tokens',()=>{
 for(const [q,id]of [['二手手机','C04G01S01'],['笔记本','C04G01S02'],['空调维修','C03G02S01'],['ＫＴＶ','C06G01S02'],['维修 空调','C03G02S01']])assert.equal(registry.searchProjects('',q)[0]?.id,id,q);
 assert.equal(registry.searchProjects('C04','not_a_real_project_987').length,0);
 assert.ok(registry.searchProjects('C04',' ').every(x=>x.categoryId==='C04'));
 const results=registry.searchProjects('C04','维修');assert.ok(results.every((x,i)=>!i||results[i-1].matchScore>=x.matchScore));assert.ok(results.every(x=>!x.firstOfGroup),'ranked results do not depend on grouped directory order');
});
test('schema versions are enforced by both final publication and account draft validation',()=>{
 const {publicationExtras}=require('../src/product-repository'),{validateDraft}=require('../src/account-drafts');
 for(const kind of schemas.kinds){const schema=schemas.get(kind),attributes={templateCode:schema.businessCode,templateVersion:'1'};
  assert.deepEqual(publicationExtras({type:kind,attributes}).attributes,attributes);
  const draft={kind,title:'',detail:'',price:'',district:'',attributes,imageIds:[],clientKey:'schema_version_test_123'};assert.deepEqual(validateDraft(draft).attributes,attributes);
  for(const bad of [{...attributes,templateVersion:'99'},{...attributes,templateCode:'JOB'}]){assert.throws(()=>publicationExtras({type:kind,attributes:bad}));assert.throws(()=>validateDraft({...draft,attributes:bad}));}
 }
 assert.equal(schemas.get('job'),null);assert.equal(schemas.get('event'),null);
});
function publish(draftRead=async()=>0){
 let definition;const store={},app={globalData:{}},modals=[],routes=[];
 const sandbox={Page:value=>definition=value,getApp:()=>app,wx:{navigateTo:value=>routes.push(value.url),showModal:value=>modals.push(value),getStorageSync:key=>store[key],setStorageSync:(key,value)=>{store[key]=value;}},require:name=>name.endsWith('/draft-summary')?{read:draftRead}:name.endsWith('/tab-bar')?{context:()=>store.owner||'guest'}:name.endsWith('/publication-readiness')?require('../../miniprogram/utils/publication-readiness'):name.endsWith('/verification')?{selectProject:async id=>routes.push('/pages/publish-form/index?categoryId='+id)}:name.endsWith('/classification')?registry:name.endsWith('/geography')?require('../../miniprogram/utils/geography'):name.endsWith('/publication-schemas')?schemas:name.endsWith('/catalog')?{postTypes:[]}:name.endsWith('/api')?{online:()=>true,request:async()=>({areas:[],categories:['used','housing','service','community'].map(id=>({id,enabled:true,restricted:false})),features:{}}),showError(){}}:{} };
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/publish/index.js'),'utf8'),sandbox);
 const page={data:structuredClone(definition.data),setData(value,done){Object.assign(this.data,value);done?.();}};for(const [key,value]of Object.entries(definition))if(typeof value==='function')page[key]=value.bind(page);return {page,modals,store,routes};
}
test('expanded search restores directory positions, clears and picks the exact matching project',async()=>{
 const {page,routes}=publish();page._projectOffset=180;page._industryOffset=95;page.toggleProjectSearch();assert.equal(page.data.projectSearchOpen,true);
 page.searchProjects({detail:{value:'笔记本'}});assert.equal(page.data.searchHasQuery,true);assert.equal(page.data.projects[0].id,'C04G01S02');
 page.clearProjectSearch();assert.equal(page.data.searchHasQuery,false);assert.equal(page.data.projectScrollTop,180);assert.equal(page.data.industryScrollTop,95);
 page.searchProjects({detail:{value:'空调维修'}});page.closeProjectSearch();assert.equal(page.data.selectedCategory,'C04');assert.equal(page.data.projectScrollTop,180);assert.equal(page.data.projectSearchOpen,false);
 page.toggleProjectSearch();page.searchProjects({detail:{value:'空调维修'}});await page.chooseProject({currentTarget:{dataset:{id:'C03G02S01'}}});
 assert.equal(routes[0],'/pages/publish-form/index?categoryId=C03G02S01');assert.equal(page.data.selectedCategory,'C03');assert.equal(page.data.projectSearchOpen,false);assert.equal(page.data.industryAnchor,'industry-C03');
});
test('a blocked search result keeps the query and does not open a fallback form',async()=>{
 const {page,modals}=publish();page.toggleProjectSearch();page.searchProjects({detail:{value:'殡仪馆'}});await page.chooseProject({currentTarget:{dataset:{id:'C23G01S01'}}});assert.equal(page.data.showForm,undefined);assert.equal(page.data.projectSearchOpen,true);assert.equal(page.data.projectQuery,'殡仪馆');assert.ok(modals[0].content.includes('不接受个人代办发布'));
});

test('directory keeps all 27 categories / 83 groups / 418 projects',()=>{
 const {page}=publish();let groupCount=0,projectCount=0;
 assert.equal(page.data.categories.length,27);
 for(const category of page.data.categories){
  page.selectCategory({currentTarget:{dataset:{id:category.id}}});
  groupCount+=page.data.groups.length;projectCount+=page.data.groups.reduce((n,x)=>n+x.items.length,0);
  assert.equal(page.data.projectScrollTop,0);
  const first=page.data.groups.find(x=>x.availableCount)||page.data.groups[0];assert.equal(page.data.expandedGroupId,category.id==='C23'?'':first.id);
  for(const group of page.data.groups){let closed=false;for(const item of group.items){if(!item.kinds.length)closed=true;else assert.equal(closed,false,'available items precede closed ones');assert.deepEqual(item.kinds,registry.kindsFor(item.id));}}
 }
 assert.equal(groupCount,83);assert.equal(projectCount,418);
});

test("publish opens the existing map as a page that can return to the category browser", () => {
 const {page,routes}=publish();
 page.openMap();
 assert.deepEqual(routes, ["/pages/map/index"]);
 assert.equal(page.data.selectedCategory, "C04");
});

test('all three funeral groups open by default and can be closed independently',()=>{
 const {page}=publish();
 const select=id=>page.selectCategory({currentTarget:{dataset:{id}}});
 select('C23');
 const ids=page.data.groups.map(group=>group.id);
 assert.deepEqual(Array.from(ids),['C23G01','C23G02','C23G03']);
 assert.equal(page.data.funeralGroupsOpen,true);
 assert.ok(ids.every(id=>!page.data.collapsedFuneralGroups[id]));
 page.toggleGroup({currentTarget:{dataset:{id:ids[1]}}});
 assert.deepEqual(Array.from(ids.filter(id=>page.data.collapsedFuneralGroups[id])),[ids[1]]);
 page.toggleProjectSearch();page.closeProjectSearch();
 assert.equal(page.data.collapsedFuneralGroups[ids[1]],true);
 page.toggleFuneralGroups();
 assert.equal(page.data.funeralGroupsOpen,false);
 select('C04');select('C23');
 assert.equal(page.data.funeralGroupsOpen,true);
 assert.ok(ids.every(id=>!page.data.collapsedFuneralGroups[id]));
});

test('group headings only toggle the single expansion and search dismissal restores the selected group',()=>{
 const {page,routes}=publish(),group=page.data.groups[1];page.toggleGroup({currentTarget:{dataset:{id:group.id}}});assert.equal(page.data.expandedGroupId,group.id);assert.equal(routes.length,0);
 page.toggleProjectSearch();page.searchProjects({detail:{value:'维修'}});page.closeProjectSearch();assert.equal(page.data.expandedGroupId,group.id);
 page.toggleGroup({currentTarget:{dataset:{id:group.id}}});assert.equal(page.data.expandedGroupId,'');
 page.toggleProjectSearch();page.closeProjectSearch();assert.equal(page.data.expandedGroupId,'');
});


test('publish draft count rejects stale reloads and account-switched results',async()=>{
 const pending=[];
 const {page,store}=publish(()=>new Promise((resolve,reject)=>pending.push({resolve,reject})));
 const first=page.loadDraftCount(),second=page.loadDraftCount();
 pending[1].resolve(2);await second;pending[0].resolve(4);await first;
 assert.equal(page.data.draftCount,2);
 const third=page.loadDraftCount();store.owner='another-account';pending[2].resolve(8);await third;
 assert.equal(page.data.draftCount,null);
 const failed=page.loadDraftCount();pending[3].reject(Error('offline'));await failed;
 assert.equal(page.data.draftCount,null);
});

test('vertical browse gestures collapse the hero and restore it only at the active column top',()=>{
 const {page}=publish();
 const touch=(region,x,y)=>({currentTarget:{dataset:{region}},touches:[{clientX:x,clientY:y}]});
 page.onBrowseTouchStart(touch('project',100,400));
 page.onBrowseTouchMove(touch('project',102,350));
 assert.equal(page.data.heroCollapsed,true);
 page._projectOffset=100;
 page.onBrowseTouchStart(touch('project',100,300));
 page.onBrowseTouchMove(touch('project',101,350));
 assert.equal(page.data.heroCollapsed,true);
 page.onProjectScroll({detail:{scrollTop:0}});
 assert.equal(page.data.heroCollapsed,false);
 page.onBrowseTouchStart(touch('industry',100,300));
 page.onBrowseTouchMove(touch('industry',180,305));
 assert.equal(page.data.heroCollapsed,false);
 page.onBrowseTouchMove(touch('industry',101,250));
 assert.equal(page.data.heroCollapsed,true);
});

test('search restores hero state while tool menu opening preserves directory space',()=>{
 const {page}=publish();
 page.toggleTools();assert.equal(page.data.toolsOpen,true);assert.equal(page.data.heroCollapsed,false);
 page.closeTools();assert.equal(page.data.toolsOpen,false);
 page.toggleProjectSearch();assert.equal(page.data.heroCollapsed,true);
 page.setHeroCollapsed(false);assert.equal(page.data.heroCollapsed,true);
 page.closeProjectSearch();assert.equal(page.data.heroCollapsed,false);
 page.setHeroCollapsed(true);page.toggleProjectSearch();page.closeProjectSearch();
 assert.equal(page.data.heroCollapsed,true);
});
