'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const policy=require('../src/admin-permissions');
const source=fs.readFileSync(path.join(__dirname,'../admin/workflows.js'),'utf8');
function render(role,kind,record){
 const buttons=[],calls=[],node=()=>({append(){},prepend(){},replaceChildren(){}});
 const context={adminRole:role,canRole:expected=>policy.hasRole(role,expected),el:()=>({hidden:true}),cell:node,button:(label,run)=>{buttons.push({label,run});return node();},publicationRecordsButton(){},publicationReviewFields:()=>()=>({}),document:{createElement:node},adminPrompt:async()=> '实际核对过原始材料和用户说明',adminConfirm:async()=>true,api:async(...args)=>calls.push(args),reload:async()=>{},crypto:require('node:crypto')};
 vm.createContext(context);vm.runInContext(source,context);context.root=node();context.kind=kind;context.record=record;vm.runInContext('renderWorkflowTask(root,kind,"audit-record",record)',context);
 return {buttons,calls};
}
for(const role of ['operator','verifier','superadmin'])test('workflow actions follow effective role permissions: '+role,async()=>{
 for(const [kind,data,required,count]of [['benefit',{status:'pending',snapshot:{},revision:3},'operator',2],['businesscase',{status:'disputed',events:[],snapshot:{},revision:3},'operator',2],['industry',{status:'pending',payload:{},workflow:{fields:[]},revision:3},'operator',3],['industrycredential',{revision:3},'verifier',3]]){
  const ui=render(role,kind,data),allowed=policy.hasRole(role,required);assert.equal(ui.buttons.length,allowed?count:0,kind);
  if(allowed){await ui.buttons.at(-1).run();assert.equal(ui.calls.length,1);assert.equal(ui.calls[0][2].revision,3);assert.ok(ui.calls[0][2].response);}
 }
});
test('completed benefits expose no duplicate fulfilment action even to superadmin',()=>assert.equal(render('superadmin','benefit',{status:'fulfilled',snapshot:{}}).buttons.length,0));
