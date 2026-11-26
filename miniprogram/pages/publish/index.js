const layout=require('../../utils/page-layout');
const registry=require('../../utils/classification');
const api=require('../../utils/api');
const readiness=require('../../utils/publication-readiness');
const projectVisuals={
 C05G01S01:{summary:'一手房、新建住宅'},
 C05G01S02:{summary:'二手房、存量住宅'},
 C05G01S03:{summary:'整租、整套出租'},
 C05G01S04:{summary:'合租、房间出租'},
 C05G01S05:{summary:'公寓出租、租公寓'},
 C04G01S01:{icon:'project-phone',summary:'手机、配件、周边'},
 C04G01S02:{icon:'project-laptop',summary:'笔记本、台式机等'},
 C04G01S03:{icon:'project-tablet',summary:'iPad、平板电脑等'},
 C04G01S04:{icon:'project-headphones',summary:'耳机、充电器、配件等'}
};
function projectItems(items, categories, features) {
 return readiness.decorate(items, categories, features).map(project => ({
  ...project,
  icon:'industry-' + project.categoryId,
  summary:project.aliases.slice(0,2).join('、'),
  ...projectVisuals[project.id]
 }));
}
function publicationCategories(settings) {
 const items = registry.categoryItems(settings);
 const finalCategories = ['C08', 'C09', 'C10', 'C23'];
 return items.filter(item => !finalCategories.includes(item.id))
  .concat(finalCategories.map(id => items.find(item => item.id === id)).filter(Boolean));
}
function directory(categoryId, preferredGroup = '', settings = {}) {
 const projects = projectItems(registry.searchProjects(categoryId), settings.categories, settings.features);
 const groups = [];
 for (const project of projects) {
  let group = groups.find(item => item.id === project.groupId);
  if (!group) {
   group = {id:project.groupId, name:project.group, items:[], availableCount:0};
   groups.push(group);
  }
  group.items.push(project);
  if (project.readiness.canStart) group.availableCount++;
 }

 for (const group of groups) group.items.sort((a,b) => Number(b.readiness.canStart) - Number(a.readiness.canStart));
 const expandedGroupId = groups.some(group => group.id === preferredGroup)
  ? preferredGroup
  : categoryId === 'C23' ? '' : (groups.find(group => group.availableCount) || groups[0])?.id || '';
 return {projects,groups,expandedGroupId};
}
Page({
 data:{layoutStyle:'',heroCollapsed:false,toolsOpen:false,funeralGroupsOpen:true,collapsedFuneralGroups:{},draftCount:null,projectCount:registry.projects.length,configLoading:true,configReady:false,focusedProjectId:'',memorialPublic:false,categories:publicationCategories(),selectedCategory:'C04',projectScrollTop:0,industryScrollTop:0,industryAnchor:'',projectSearchOpen:false,projectSearchFocused:false,searchHasQuery:false,searchScrollTop:0,projectQuery:'',...directory('C04'),districts:[],error:'',online:api.online()},
 onShow(){this._disposed=false;this._hidden=false;this._browseGesture=null;layout.show(this,{tabBar:true});require('../../utils/theme').apply(this);this.loadDraftCount();const target=getApp().globalData.publishTarget;delete getApp().globalData.publishTarget;const node=registry.find(target?.id);if(node){const project=registry.projects.find(x=>x.id===node.id),categoryId=project?.categoryId||registry.categories.find(c=>c.id===node.id||c.groups.some(g=>g.id===node.id))?.id;if(categoryId)this.setData({selectedCategory:categoryId,funeralGroupsOpen:true,collapsedFuneralGroups:{},focusedProjectId:project?.id||'',industryAnchor:'industry-'+categoryId,...directory(categoryId,project?.groupId||node.id,this._availability)});}return this.loadConfig();},
 onReady(){layout.measure(this);},
 onResize(){layout.measure(this);},
 headerMeasured(e){layout.header(this,e);},
 setHeroCollapsed(collapsed) {
  if (this.data.projectSearchOpen && !collapsed) return;
  if (this.data.heroCollapsed !== collapsed) this.setData({heroCollapsed:collapsed});
 },
 onBrowseTouchStart(e) {
  const point = e.touches?.[0];
  this._browseGesture = point && e.touches.length === 1
   ? {region:e.currentTarget.dataset.region, x:point.clientX, y:point.clientY, direction:0, endedAt:0}
   : null;
 },
 onBrowseTouchMove(e) {
  const gesture = this._browseGesture, point = e.touches?.[0];
  if (!gesture || !point || e.touches.length !== 1) return;
  const dy = point.clientY - gesture.y, dx = point.clientX - gesture.x;
  if (Math.abs(dy) < 20 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
  gesture.direction = dy < 0 ? -1 : 1;
  if (dy < 0) this.setHeroCollapsed(true);
  else {
   const top = gesture.region === 'industry' ? this._industryOffset : this._projectOffset;
   if (gesture.region === 'hero' || (top || 0) <= 2) this.setHeroCollapsed(false);
  }
 },
 onBrowseTouchEnd(){if(this._browseGesture)this._browseGesture.endedAt=Date.now();},
 onBrowseTouchCancel(){this._browseGesture=null;},
 updateHeroFromScroll(region, top) {
  const gesture = this._browseGesture;
  if (!gesture || gesture.region !== region || (gesture.endedAt && Date.now() - gesture.endedAt > 700)) return;
  if (gesture.direction < 0 && top > 0) this.setHeroCollapsed(true);
  if (gesture.direction > 0 && top <= 2) this.setHeroCollapsed(false);
 },
 async loadDraftCount() {
  const tabs = require('../../utils/tab-bar');
  const owner = tabs.context();
  const version = this._draftVersion = (this._draftVersion || 0) + 1;
  this.setData({draftCount:null});
  try {
   const count = await require('../../utils/draft-summary').read();
   if (!this._disposed && !this._hidden && version === this._draftVersion && owner === tabs.context()) this.setData({draftCount:count});
  } catch {
   if (!this._disposed && !this._hidden && version === this._draftVersion && owner === tabs.context()) this.setData({draftCount:null});
  }
 },
 async loadConfig(){this.setData({configLoading:true});const version=this._configVersion=(this._configVersion||0)+1;try{const c=await api.request('GET','/api/v1/config');if(this._disposed||version!==this._configVersion)return;this._availability=c;this.setData({configReady:true,memorialPublic:c.features?.memorialPublic===true,categories:publicationCategories(c.categories),districts:c.areas||[],...directory(this.data.selectedCategory,this.data.expandedGroupId,c),...(this.data.searchHasQuery?{projects:projectItems(registry.searchProjects(this.data.selectedCategory,this.data.projectQuery),c.categories,c.features)}:{}),error:''});}catch(e){if(!this._disposed&&version===this._configVersion)this.setData({configReady:false,error:e.message});}finally{if(!this._disposed&&version===this._configVersion)this.setData({configLoading:false});}},
 onHide(){if(this.data.toolsOpen)this.setData({toolsOpen:false});this._hidden=true;this._browseGesture=null;layout.hide(this);},
 onUnload(){layout.hide(this);this._disposed=true;this._configVersion=(this._configVersion||0)+1;},
 showHelp(){this.setData({toolsOpen:false});wx.showModal({title:'发布常见问题',content:'选择行业后查看细分类目和发布条件。居民信息提交后由平台审核，企业招聘和专项服务需要主体或资质核验。未完成的内容可保存到草稿箱，审核进度可在发布进度中查询。',showCancel:false,confirmText:'知道了'});},
 selectCategory(e){this._browseGesture=null;const selectedCategory=e.currentTarget.dataset.id,category=this.data.categories.find(x=>x.id===selectedCategory);if(!category||selectedCategory===this.data.selectedCategory)return;this._projectOffset=0;this.setData({selectedCategory,funeralGroupsOpen:true,collapsedFuneralGroups:{},projectQuery:'',...directory(selectedCategory,'',this._availability),projectScrollTop:1},()=>{this.setData({projectScrollTop:0});this.getTabBar?.()?.refresh?.();});},
 openMap(){wx.navigateTo({url:"/pages/map/index"});},
 toggleFuneralGroups(){this.setData({funeralGroupsOpen:!this.data.funeralGroupsOpen});},
 toggleGroup(e){
  this._browseGesture=null;
  const id=e.currentTarget.dataset.id;
  if(!this.data.groups.some(group=>group.id===id))return;
  if(this.data.selectedCategory==='C23'){
   const collapsed=this.data.collapsedFuneralGroups;
   this.setData({collapsedFuneralGroups:{...collapsed,[id]:!collapsed[id]}});
   return;
  }
  this.setData({expandedGroupId:this.data.expandedGroupId===id?'':id});
 },
 toggleProjectSearch(){this.setData({toolsOpen:false});if(this.data.projectSearchOpen){this.closeProjectSearch();return;}this._directoryPosition={categoryId:this.data.selectedCategory,groupId:this.data.expandedGroupId,project:this._projectOffset||0,industry:this._industryOffset||0,heroCollapsed:this.data.heroCollapsed};this.setData({heroCollapsed:true,projectSearchOpen:true,projectSearchFocused:true,projectQuery:'',searchHasQuery:false});},
 onProjectScroll(e){this._projectOffset=e.detail.scrollTop;this.updateHeroFromScroll('project',e.detail.scrollTop);},onIndustryScroll(e){this.updateHeroFromScroll('industry',e.detail.scrollTop);this._industryOffset=e.detail.scrollTop;},
 closeProjectSearch(){const saved=this._directoryPosition||{categoryId:this.data.selectedCategory,groupId:this.data.expandedGroupId,project:0,industry:0};this.setData({projectSearchOpen:false,projectSearchFocused:false,projectQuery:'',searchHasQuery:false,selectedCategory:saved.categoryId,...directory(saved.categoryId,saved.groupId,this._availability),expandedGroupId:saved.groupId||'',industryAnchor:'',projectScrollTop:saved.project,industryScrollTop:saved.industry,heroCollapsed:!!saved.heroCollapsed},()=>this.getTabBar?.()?.refresh?.());},
 clearProjectSearch(){this.setData({projectQuery:'',searchHasQuery:false,projectSearchFocused:true,projects:projectItems(registry.searchProjects(this.data.selectedCategory),this._availability?.categories,this._availability?.features),projectScrollTop:this._directoryPosition?.project||0,industryScrollTop:this._directoryPosition?.industry||0},()=>this.getTabBar?.()?.refresh?.());},
 searchProjects(e){
  const q=e.detail.value.slice(0,80);
  if(!q.trim()){this.clearProjectSearch();return;}
  const leavingNeutral=this.data.selectedCategory==='C23'&&!this.data.searchHasQuery;
  this.setData({projectQuery:q,searchHasQuery:true,projects:projectItems(registry.searchProjects(this.data.selectedCategory,q),this._availability?.categories,this._availability?.features),searchScrollTop:1},()=>{
   this.setData({searchScrollTop:0});
   if(leavingNeutral)this.getTabBar?.()?.refresh?.();
  });
 },
 applyProjectSelection(project){this._directoryPosition=null;this._projectOffset=0;this.setData({selectedCategory:project.categoryId,funeralGroupsOpen:true,collapsedFuneralGroups:{},projectSearchOpen:false,projectSearchFocused:false,projectQuery:'',searchHasQuery:false,...directory(project.categoryId,project.groupId,this._availability),industryAnchor:'industry-'+project.categoryId,projectScrollTop:0},()=>this.getTabBar?.()?.refresh?.());},
 async chooseProject(e){const project=registry.projects.find(x=>x.id===e.currentTarget.dataset.id);if(!project||this.choosingProject)return;if(!this.data.configReady){await this.loadConfig();if(!this.data.configReady){api.showError(Error('发布配置暂不可用，请重试后再选择项目'));return;}}if(this._disposed||this._hidden)return;const s=readiness.state(project.id,this._availability?.categories,this._availability?.features);if(!s.canStart){wx.showModal({title:s.label,content:s.reason+' 可先浏览该行业的公开信息。',confirmText:'浏览信息',success:r=>{if(r.confirm&&!this._disposed)require('../../utils/navigation').discoverIndustry(project.categoryId);}});return;}this.applyProjectSelection(project);if(s.route==='industry'){wx.navigateTo({url:'/pages/industry/index?projectId='+project.id});return;}this.choosingProject=true;try{await require('../../utils/verification').selectProject(project.id);}catch(e){api.showError(e);}finally{this.choosingProject=false;}},
 openMemorial(){wx.navigateTo({url:'/pages/memorial/index'});},
 toggleTools(){this.setData({toolsOpen:!this.data.toolsOpen});},
 closeTools(){this.setData({toolsOpen:false});},
 preventToolsScroll(){},
 showGuidance(){this.setData({toolsOpen:false});wx.navigateTo({url:'/pages/legal/index?kind=publication'});},
 openRecords(){this.setData({toolsOpen:false});require('../../utils/navigation').personalCenter('service');},
 openDrafts(){this.setData({toolsOpen:false});if(this.data.projectSearchOpen)this.closeProjectSearch();wx.navigateTo({url:'/pages/drafts/index'});}
});
