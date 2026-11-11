'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('theme navigation waits until after page show and does not rebuild native tabs on every route',()=>{
 const storage=new Map(),timers=new Map(),calls=[];let timerId=0;
 const context={module:{exports:{}},require:name=>name==='./page-accent-route'?require('../../miniprogram/utils/page-accent-route'):name==='./design-system'?require('../../miniprogram/utils/design-system'):name==='./palettes'?require('../../miniprogram/utils/palettes'):({online:()=>false,hasSession:()=>false}),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),wx:{getStorageSync:k=>storage.get(k)||'',setStorageSync:(k,v)=>storage.set(k,v),setNavigationBarColor:x=>calls.push(['nav',x]),setBackgroundColor:()=>{},setTabBarItem:x=>calls.push(['tab',x]),setTabBarStyle:x=>calls.push(['bar',x])}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../miniprogram/utils/theme.js'),'utf8'),context);
 const theme=context.module.exports,run=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());};
 let rendered;const page={setData(value){rendered=value;}};
 theme.apply(page);theme.apply(page);assert.equal(calls.length,0,'native changes must not occur within onShow');run();
 assert.equal(calls.filter(x=>x[0]==='tab').length,5);
 assert.equal(calls.find(x=>x[0]==='bar')[1].selectedColor,theme.palettes.prism.link);
 assert.equal(rendered.themeColor,theme.palettes.prism.action);
 assert.ok(rendered.themeStyle.includes('--brand:'+theme.palettes.prism.brand));
 theme.apply(page);run();assert.equal(calls.filter(x=>x[0]==='tab').length,5,'same palette must not rebuild TabBar on a new route');
 const palette=require('../../miniprogram/utils/palettes');
 const selected=[];
 for(const route of ['home','discover','publish','messages','me']){
  page.route='pages/'+route+'/index';theme.apply(page);run();
  selected.push(calls.filter(x=>x[0]==='bar').slice(-1)[0][1].selectedColor);
  assert.equal(selected.at(-1),palette.resolvePalette('prism',page.route).link);
 }
 assert.deepEqual([...new Set(selected)],[theme.palettes.prism.link],'five tabs share the Pearl Sunset active text color');
 assert.equal(calls.filter(x=>x[0]==='tab').length,5,'route accents must not reconstruct native tab items');
 theme.store({...theme.defaults,theme:'dark'});theme.apply(page);run();assert.equal(calls.filter(x=>x[0]==='tab').length,10);
 assert.ok(calls.filter(x=>x[0]==='tab').slice(5).every(x=>x[1].selectedIconPath.endsWith('-dark.png')));
});
test('care material follows the resident form category and preserves clear reading preference', () => {
 const {materialFor}=require('../../miniprogram/utils/design-system');
 for(const categoryId of ['C03G01S01','C12G01S01','C22G01S01']){
  assert.equal(materialFor({route:'pages/publish-form/index',_options:{categoryId}},{theme:'prism'}),'warm');
 }
 assert.equal(materialFor({route:'pages/industry/index',options:{projectId:'C22G01S01'}},{theme:'clear'}),'clear');
});
