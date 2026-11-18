'use strict';
// Read-only source audit; writes reports only beside this file. Never calls business APIs.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),mini=path.join(root,'miniprogram');
const ts=require('C:/Program Files (x86)/Tencent/微信web开发者工具/resources/vsextensions/node_modules/typescript/lib/typescript.js');
const read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p).replace(/^\uFEFF/,''));
const write=(name,value)=>fs.writeFileSync(path.join(__dirname,name),JSON.stringify(value,null,2)+'\n');
const relative=p=>path.relative(root,p).replaceAll('\\','/');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&e.name!=='node_modules'?files(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]);}
const app=json(path.join(mini,'app.json')),registered=new Set(app.pages);
const sources=files(mini).filter(p=>p.endsWith('.js')&&!p.includes(path.sep+'category-art'+path.sep));
const diagnostics=[],navigation=[],apis=[],objects=new Map();
const key=n=>n?.text||n?.getText();
for(const file of sources){
 const code=read(file),ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 for(const d of ast.parseDiagnostics)diagnostics.push({file:relative(file),line:ast.getLineAndCharacterOfPosition(d.start).line+1,message:ts.flattenDiagnosticMessageText(d.messageText,' ')});
 const info={handlers:new Set(),spreads:[],componentMethods:new Set()};objects.set(file,info);
 const line=n=>ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1;
 function visit(n){
  if(ts.isCallExpression(n)){
   const name=n.expression.getText(ast);
   if(['Page','Component'].includes(name)&&ts.isObjectLiteralExpression(n.arguments[0])){
    for(const p of n.arguments[0].properties){
     if(ts.isSpreadAssignment(p))info.spreads.push(p.expression.getText(ast));
     else if(ts.isMethodDeclaration(p)||ts.isPropertyAssignment(p)&&[ts.SyntaxKind.ArrowFunction,ts.SyntaxKind.FunctionExpression].includes(p.initializer.kind))info.handlers.add(key(p.name));
     else if(key(p.name)==='methods'&&ts.isPropertyAssignment(p)&&ts.isObjectLiteralExpression(p.initializer))for(const m of p.initializer.properties)info.componentMethods.add(key(m.name));
    }
   }
   if(/^wx\.(navigateTo|redirectTo|switchTab|reLaunch|navigateBack)$/.test(name)){
    const arg=n.arguments[0],url=arg&&ts.isObjectLiteralExpression(arg)?arg.properties.find(p=>key(p.name)==='url'):null;
    const expr=url?.initializer,text=expr?.getText(ast)||'';
    let literal=expr&&(ts.isStringLiteral(expr)||ts.isNoSubstitutionTemplateLiteral(expr))?expr.text:null;
    const prefix=(literal||text.match(/^["'`]([^"'`]+)["'`]/)?.[1]||'').split('?')[0];
    navigation.push({file:relative(file),line:line(n),method:name.slice(3),expression:text,literal,routePrefix:prefix,targetRegistered:literal&&prefix.startsWith('/pages/')?registered.has(prefix.slice(1)):null});
   }
   if(/(?:^|\.)request$/.test(name)&&n.arguments.length>1){const a=n.arguments;apis.push({file:relative(file),line:line(n),caller:name,method:a[0]?.getText(ast),path:a[1]?.getText(ast)});}
  }
  ts.forEachChild(n,visit);
 }visit(ast);
}
function includes(file,seen=new Set()){
 if(seen.has(file)||!fs.existsSync(file))return [];seen.add(file);const code=read(file),result=[{file,code}];
 for(const m of code.matchAll(/<include\b[^>]*\bsrc=["']([^"']+)["']/g))result.push(...includes(path.resolve(path.dirname(file),m[1]),seen));return result;
}
const pages=app.pages.map(route=>{
 const file=path.join(mini,route+'.js'),info=objects.get(file)||{handlers:new Set(),spreads:[]};
 const templates=includes(path.join(mini,route+'.wxml')),events=[],missing=[];
 for(const t of templates)for(const m of t.code.matchAll(/\b(?:bind|catch)(?::[\w-]+|[a-z][\w-]*)=["']([^"']+)["']/g)){
  const handler=m[1],event={file:relative(t.file),line:t.code.slice(0,m.index).split('\n').length,handler};events.push(event);
  if(!handler.includes('{{')&&!info.handlers.has(handler))missing.push({...event,reviewOnly:info.spreads.length>0,spreads:info.spreads});
 }
 const pageJson=path.join(mini,route+'.json'),cfg=fs.existsSync(pageJson)?json(pageJson):{};
 return {route,tab:app.tabBar.list.some(t=>t.pagePath===route),navigationStyle:cfg.navigationStyle||app.window.navigationStyle||'default',disableScroll:cfg.disableScroll===true,declaredHandlers:[...info.handlers],spreads:info.spreads,bindingCount:events.length,unresolvedBindings:missing,headerReview:templates.flatMap(t=>[...t.code.matchAll(/<page-header\b[^>]*>/g)].map(m=>({file:relative(t.file),tag:m[0]})))};
});
const components=[];
for(const[file,info]of objects)if(file.includes(path.sep+'components'+path.sep)&&fs.existsSync(file.replace(/\.js$/,'.wxml'))){
 const unresolved=[];for(const t of includes(file.replace(/\.js$/,'.wxml')))for(const m of t.code.matchAll(/\b(?:bind|catch)(?::[\w-]+|[a-z][\w-]*)=["']([^"']+)["']/g))if(!m[1].includes('{{')&&!info.componentMethods.has(m[1]))unresolved.push({file:relative(t.file),handler:m[1]});
 components.push({file:relative(file),methods:[...info.componentMethods],unresolved});
}
const catalog=require(path.join(mini,'utils/classification-contract')),flows=require(path.join(mini,'utils/industry-workflows')),journeys=require(path.join(mini,'utils/project-journeys')),art=require(path.join(mini,'utils/category-art')),schemas=require(path.join(mini,'utils/publication-schemas')),review=require(path.join(mini,'utils/publication-review-rules')),channels=require(path.join(mini,'utils/discovery-channels'));
const manifest=json(path.join(root,'docs/design/category-resources-2026-11-15/source-manifest.json')),overrides=new Set(manifest.existingHousingOverrides);
const counts=(values)=>values.reduce((a,v)=>(a[v]=(a[v]||0)+1,a),{});
const mapping=catalog.projects.map(p=>{
 const pub=catalog.publicationFor(p.id),j=journeys.journey(p.id),w=flows.workflow(p.id),a=art.describe(p.id),legacy=catalog.kindsFor(p.id),absolute=path.join(mini,a.path);
 return {id:p.id,name:p.name,industryId:p.categoryId,industry:p.categoryName,groupId:p.groupId,group:p.group,channel:channels.channelFor(p.id),policy:p.publication.policy,route:j?.route||'missing',capabilities:pub?.capabilities,residentKinds:legacy,template:legacy.length?legacy.map(k=>({kind:k,code:schemas.get(k)?.businessCode,version:schemas.formVersion,fields:schemas.fieldsFor(k,{categoryId:p.id,templateVersion:String(schemas.formVersion)})})):w?{code:w.policy,fields:w.fields}:null,validationSource:legacy.length?['miniprogram/utils/publication-schemas.js','backend/src/rules.js']:w?['backend/src/industry.js']:[],reviewRule:review.resolve({projectId:p.id,type:legacy[0]||'',policy:p.publication.policy}),detailPage:j?.route==='resident'?'pages/detail/index':j?.route==='industry'?'pages/industry/index?id=':null,search:{channel:channels.channelFor(p.id),filterCategoryId:p.id,sharedPublicFeed:j?.route!=='closed',codeCoverageOnly:true},expiry:{applicable:j?.route!=='closed',defaultDays:j?.route==='closed'?null:60,eventEndOverrides:!!w?.fields.some(f=>f.key==='endsAt'),source:'backend/src/product-repository.js; backend/src/industry.js',runtimeValidatedThisAudit:false},steps:j?.steps||[],art:{...a,visibleHousingOverride:overrides.has(p.id),exists:fs.existsSync(absolute),sha256:fs.existsSync(absolute)?crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'):null},coverageEvidence:'source mapping; not a live submission or qualification approval'};
});
const backlog=mapping.filter(p=>p.art.stage==='placeholder'&&!p.art.visibleHousingOverride).map(p=>({id:p.id,name:p.name,industryId:p.industryId,industry:p.industry,groupId:p.groupId,group:p.group,path:p.art.path,requirement:'独立业务语义、柔和3D、透明背景、融入既有卡片；替换后校验去重/加载/包体'}));
const summary={checkedAt:new Date().toISOString(),scope:'read-only source inventory',pageCount:pages.length,tabCount:app.tabBar.list.length,channelCount:channels.definitions.length,industries:catalog.categories.length,groups:catalog.categories.reduce((n,c)=>n+c.groups.length,0),projects:mapping.length,uniqueIds:new Set(mapping.map(p=>p.id)).size,journeys:counts(mapping.map(p=>p.route)),policyCounts:counts(mapping.map(p=>p.policy)),reviewCounts:counts(mapping.map(p=>p.reviewRule.code)),visiblePlaceholderCount:backlog.length,artStageCounts:counts(mapping.map(p=>p.art.stage)),missingArt:mapping.filter(p=>!p.art.exists).map(p=>p.id),duplicateImageHashes:Object.values(Object.groupBy?Object.groupBy(mapping,p=>p.art.sha256):mapping.reduce((a,p)=>((a[p.art.sha256]||=[]).push(p),a),{})).filter(v=>v.length>1).map(v=>v.map(p=>p.id)),parseDiagnostics:diagnostics,unresolvedPageBindings:pages.flatMap(p=>p.unresolvedBindings),unresolvedComponentBindings:components.flatMap(c=>c.unresolved),invalidLiteralRoutes:navigation.filter(n=>n.targetRegistered===false),apiCallsites:apis.length,limitations:['AST identifies declared handlers; spread/mixin results require manual review.','Dynamic URLs, auth gates, external callbacks and return-stack behavior need runtime tests.','All 418 configured routes are not proof of 418 production-qualified open services.','Image hash uniqueness is not semantic 3D originality or visual approval.']};
write('source-summary.json',summary);write('pages-and-bindings.json',{pages,components});write('navigation-and-api.json',{navigation,apis});write('classification-418.json',mapping);write('illustrations-176.json',backlog);
function csv(name,columns,rows){const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';fs.writeFileSync(path.join(__dirname,name),'\uFEFF'+[columns.map(quote).join(','),...rows.map(row=>columns.map(c=>quote(row[c])).join(','))].join('\r\n')+'\r\n');}
csv('illustrations-176.csv',['id','name','industryId','industry','groupId','group','path','requirement'],backlog);
csv('classification-418.csv',['id','name','industry','group','channel','policy','route','residentPublishingAllowed','merchantRequired','qualificationRequired','bookingAllowed','publicDisplayAllowed','reviewRule','template','detail','artStage','housingOverride'],mapping.map(p=>({...p,...p.capabilities,reviewRule:p.reviewRule.name,template:Array.isArray(p.template)?p.template.map(t=>t.code).join('|'):p.template?.code,detail:p.detailPage,artStage:p.art.stage,housingOverride:p.art.visibleHousingOverride})));
// Exercise actual admin rendering with a minimal DOM; callbacks are never invoked.
const source=read(path.join(root,'backend/admin/workflows.js')),reproductions=[];
for(const role of ['operator','verifier','superadmin']){
 const stub=()=>({append(){},prepend(){},replaceChildren(){}}),buttons=[];
 const sandbox={adminRole:role,canRole:expected=>role===expected||role==='superadmin',el:()=>({hidden:true}),cell:()=>stub(),button:(label,callback)=>{buttons.push(label);return stub();},publicationRecordsButton(){},publicationReviewFields(){return ()=>({});},checks:()=>()=>({}),document:{createElement:()=>stub()}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox,{timeout:2000});
 for(const[kind,d]of [['benefit',{status:'pending',snapshot:{title:'audit'},revision:1}],['businesscase',{status:'disputed',events:[],snapshot:{}}],['industrycredential',{revision:1}],['industry',{status:'pending',payload:{},workflow:{fields:[]}}]]){
  buttons.length=0;sandbox.root=stub();sandbox.kind=kind;sandbox.record=d;vm.runInContext('renderWorkflowTask(root,kind,"read-only-audit",record)',sandbox,{timeout:2000});reproductions.push({role,kind,buttons:[...buttons],count:buttons.length});
 }
}
write('admin-render-reproduction.json',{checkedAt:new Date().toISOString(),scope:'actual source rendered in VM with minimal DOM; no login/API/DB writes; no button callbacks executed',results:reproductions});
const raw=fs.readFileSync('C:/Users/chejun/.codex/backups/city-life-miniapp/phase-a-npm-audit-2026-11-18.json');
const audit=JSON.parse((raw[0]===255&&raw[1]===254?raw.toString('utf16le'):raw.toString('utf8')).replace(/^\uFEFF/,''));
write('dependency-audit.json',{checkedAt:new Date().toISOString(),registry:'https://registry.npmjs.org',exitCode:0,counts:audit.metadata?.vulnerabilities,dependencies:audit.metadata?.dependencies,vulnerabilities:audit.vulnerabilities,limitations:'Registry advisory result only; not proof of application or production security.'});
console.log(JSON.stringify({pages:summary.pageCount,industries:summary.industries,groups:summary.groups,projects:summary.projects,routes:summary.journeys,backlog:backlog.length,unresolvedBindings:summary.unresolvedPageBindings.length,invalidRoutes:summary.invalidLiteralRoutes.length,parseErrors:diagnostics.length,adminRender:reproductions},null,2));


