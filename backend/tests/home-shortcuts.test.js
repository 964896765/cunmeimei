'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const registry=require('../../miniprogram/utils/classification'),shortcuts=require('../../miniprogram/utils/shortcuts');
function client(name,nav){let definition;const routes=[],notices=[],store=new Map(),app={globalData:{}};const wx={getStorageSync:k=>store.get(k),setStorageSync:(k,v)=>store.set(k,v),showToast:v=>notices.push(v.title),switchTab:v=>routes.push(v.url),navigateTo:v=>routes.push(v.url),navigateBack:()=>routes.push('back')};const sandbox={wx,getApp:()=>app,getCurrentPages:()=>[{},{}],Page:v=>definition=v,require:n=>n.endsWith('/shortcuts')?shortcuts:n.endsWith('/classification')?registry:n.endsWith('/navigation')?nav:n.endsWith('/api')?{}:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/'+name+'/index.js'),'utf8'),sandbox);const page={data:structuredClone(definition.data),setData:v=>Object.assign(page.data,structuredClone(v))};for(const[k,v]of Object.entries(definition))if(typeof v==='function')page[k]=v.bind(page);return{page,routes,notices,wx,app};}

test('27 industry icons are distinct, complete and use the same line grid in every established palette',()=>{
 const {shapes,svg}=require('../../scripts/build_industry_icons'),{iconPalettes}=require('../../miniprogram/utils/palettes'),items=registry.categoryItems();assert.equal(items.length,27);assert.deepEqual(Object.keys(shapes),items.map(x=>x.id));assert.equal(new Set(Object.values(shapes)).size,27);
 for(const theme of Object.keys(iconPalettes)){const hashes=items.map(x=>{const file=path.resolve(__dirname,'../../miniprogram/assets/icons/'+x.icon+'-'+theme+'.png');return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');});assert.equal(new Set(hashes).size,27);}
 for(const item of items)assert.match(svg(item.id,'#000000'),/viewBox="0 0 24 24".*stroke-width="1.8"/);
});
test('editor plus/minus accepts all 27 choices without navigating and removal still changes the selection',()=>{
 const c=client('categories');c.page.refresh(shortcuts.defaults);assert.equal(c.page.data.options.length,27);assert.equal(c.page.data.selectedIds.length,7);
 c.page.toggle({currentTarget:{dataset:{id:'C27'}}});assert.equal(c.page.data.selectedIds.length,8);assert.equal(c.notices.length,0);assert.equal(c.routes.length,0);
 for(const item of registry.categories)if(!c.page.data.selectedIds.includes(item.id))c.page.toggle({currentTarget:{dataset:{id:item.id}}});assert.equal(c.page.data.selectedIds.length,27);assert.equal(c.page.data.options.filter(x=>x.selected).length,27);
 c.page.toggle({currentTarget:{dataset:{id:'C01'}}});assert.equal(c.page.data.selectedIds.length,26);assert.ok(!c.page.data.selectedIds.includes('C01'));assert.equal(c.routes.length,0);
});

test('complete category directory navigates directly while the editor changes only saved shortcut selections',()=>{
 const calls=[],c=client('categories',{discoverIndustry:id=>calls.push(id)});c.page.refresh(shortcuts.defaults);
 c.page.open({currentTarget:{dataset:{id:'C03'}}});assert.deepEqual(calls,['C03']);assert.equal(c.page.data.editing,false);
 c.page.edit();const count=c.page.data.selectedIds.length;c.page.open({currentTarget:{dataset:{id:'C27'}}});assert.equal(c.page.data.selectedIds.length,count+1);assert.deepEqual(calls,['C03']);
});
test('all home shortcuts use discovery industry navigation and the brand uses recommended discovery',()=>{
 const calls=[],c=client('home',{discoverIndustry:id=>calls.push(['industry',id]),discover:type=>calls.push(['channel',type])});
 for(const category of registry.categoryItems()){c.page.setData({quickItems:[category]});c.page.openQuick({currentTarget:{dataset:{id:category.id}}});}
 assert.deepEqual(calls,registry.categories.map(x=>['industry',x.id]));assert.equal(c.routes.length,0);
 c.page.openGuide({currentTarget:{dataset:{id:'nearby'}}});assert.deepEqual(calls.at(-1),['channel','all']);
 const source=fs.readFileSync(path.resolve(__dirname,'../../miniprogram/utils/navigation.js'),'utf8'),sandbox={module:{exports:{}},getApp:()=>c.app,wx:c.wx,require:name=>name==='./browse-query'?require('../../miniprogram/utils/browse-query'):registry};vm.runInNewContext(source,sandbox);sandbox.module.exports.discoverIndustry('C27');assert.equal(c.app.globalData.exploreCategoryTarget.id,'C27');assert.equal(c.app.globalData.exploreTarget,'all');assert.equal(c.routes.at(-1),'/pages/discover/index');
});
