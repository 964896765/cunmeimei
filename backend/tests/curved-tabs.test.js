'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
function bridge(){const storage=new Map([['city_life_user_id','one'],['city_life_v2_auth_token','one-token']]),sandbox={module:{exports:{}},wx:{getStorageSync:key=>storage.get(key)}};vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/utils/tab-bar.js'),'utf8'),sandbox);return {tabs:sandbox.module.exports,storage};}
test('curved navigation preserves frozen colors, five labels and existing native fallback assets',async()=>{
 const crypto=require('node:crypto'),before=require('../../docs/tab-shape-before.json');
 for(const [file,hash]of Object.entries(before.hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash);
 const app=require('../../miniprogram/app.json');const {custom,...config}=app.tabBar;assert.equal(custom,true);assert.deepEqual(config,before.tabBar);
 const sharp=require('sharp'),{palettes}=require('../../miniprogram/utils/palettes');
 for(const [theme,c]of Object.entries(palettes)){const {data,info}=await sharp(path.join(root,'miniprogram/assets/icons/nav-curve-'+theme+'.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(data[(16*info.width+20)*4+3],0,'curve sides stay transparent above the old edge');const i=(20*info.width+480)*4;assert.equal(data[i+3],255);assert.equal('#'+[...data.subarray(i,i+3)].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase(),c.surface,'raised surface uses the original bar color');}
});
test('message badge and visibility follow the current identity and do not accept a late prior-account count',()=>{
 const {tabs,storage}=bridge(),bar={data:{},setData(v){Object.assign(this.data,v);},syncRoute(route,p,c,count,hidden){this.setData({route,unread:count,hidden});}},page={route:tabs.routes[0],data:{},getTabBar:()=>bar};
 const owner=tabs.context();tabs.setUnread(7,page,owner);assert.equal(bar.data.unread,7);tabs.visibility(page,true);assert.equal(bar.data.hidden,true);
 storage.set('city_life_user_id','two');storage.set('city_life_v2_auth_token','two-token');tabs.sync(page,{},{});assert.equal(bar.data.unread,0);assert.equal(bar.data.hidden,false);
 tabs.setUnread(99,page,owner);assert.equal(bar.data.unread,0,'old account response is ignored');
});
test('tab taps preserve the actual selected route, reject invalid targets and recover after failed navigation',()=>{
 const {tabs}=bridge();let definition;const requests=[],sandbox={Component:v=>definition=v,require:name=>name.endsWith('/tab-bar')?tabs:name.endsWith('/palettes')?require('../../miniprogram/utils/palettes'):{},wx:{switchTab:options=>requests.push(options),showToast(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/custom-tab-bar/index.js'),'utf8'),sandbox);
 const component={data:definition.data};for(const [name,fn]of Object.entries(definition.methods))component[name]=fn.bind(component);
 const tap=route=>component.select({currentTarget:{dataset:{route}}});tap(tabs.routes[0]);tap('pages/unknown/index');assert.equal(requests.length,0);
 tap(tabs.routes[1]);tap(tabs.routes[2]);assert.equal(requests.length,1);assert.equal(component.data.route,tabs.routes[0],'selection waits for a successful page show');requests[0].fail();requests[0].complete();tap(tabs.routes[2]);assert.equal(requests.length,2);
});
