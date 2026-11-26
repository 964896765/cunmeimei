const api=require('../../utils/api'),context=require('../../utils/geo-context'),nav=require('../../utils/navigation'),markerBuilder=require('../../utils/map-markers'),geography=require('../../utils/geography'),filters=require('../../utils/map-filters'),present=require('../../utils/presentation');
const browse=require('../../utils/browse-query');
const {definitions:channels,channelFor}=require('../../utils/discovery-channels');
const {feedUrl,MAX_PAGE}=require('../../utils/feed-query');
const {decodeQuery}=require('../../utils/route-query');
const refinements=require('../../utils/discovery-refinements');
const hasPins=type=>type==='merchant'||type==='service';
const channelName=type=>channels.find(c=>c.id===type)?.name||'附近信息';
const categoryInChannel=(id,type)=>channelFor(id)===type?browse.category(id).id:'';
function sortChoices(type,spatial){
 return browse.sortOptions(type,spatial?'map':'feed').filter(({code})=>code!=='distance').map(({code,name})=>({value:code,name}));
}
function mapSort(type,sort,spatial){
 return sortChoices(type,spatial).some(option=>option.value===sort)?sort:'recommended';
}
function filterChoices(type,spatial){
 return filters.options.filter(group=>group.key!=='publisher'||spatial).map(group=>group.key==='sort'?{...group,values:sortChoices(type,spatial)}:group);
}
const drawerStates=['collapsed','half','expanded'];
const countFilters=(value,refinements={})=>filters.options.filter(x=>x.key!=='sort'&&value[x.key]!==filters.defaults[x.key]).length+Object.keys(refinements).length;
Page({
 data:{refinements:{},pinChannel:true,spatial:true,channelName:'商家',cityCode:'',districtCode:'',cityLabel:'选择地区',q:'',type:'merchant',latitude:35.8617,longitude:104.1954,scale:4,markers:[],items:[],clusterItems:[],total:0,selectedId:'',anchor:'',drawer:'half',dirty:false,loading:false,locating:false,hasMore:false,mapUnavailable:false,error:'',geoError:'',filters:{...filters.defaults},draftFilters:{...filters.defaults},rangeMode:'current',draftRange:'current',filterOptions:filterChoices('merchant',true),filterCount:0,filterOpen:false},
 onLoad(opts={}){
  const scope=browse.common({...opts,q:decodeQuery(opts.q),categoryId:decodeQuery(opts.categoryId)});
  this.initialScope=scope.cityCode?scope:null;
  const type=channels.some(channel=>channel.id===scope.type)?scope.type:(channelFor(scope.categoryId)||'merchant'),spatial=hasPins(type);
  const value={...filters.defaults,days:scope.days,images:scope.images,sort:mapSort(type,opts.sourceSort&&!spatial?opts.sourceSort:scope.sort,spatial)};
  if(spatial&&opts.publisher==='verified')value.publisher='verified';
  const selected=refinements.normalize(scope.refinements||{},type);
  this.setData({type,pinChannel:spatial,spatial,channelName:channelName(type),refinements:selected,q:scope.q,categoryId:categoryInChannel(scope.categoryId,type),filterOptions:filterChoices(type,spatial),filters:value,filterCount:countFilters(value,selected),
   scopeNotice:Number(opts.sourceRadius)>0||opts.sourceSort==='distance'?'已带入发现页筛选，距离条件改为按地图视野查询。':''});
 },
 onShow(){
  this.visible=true;
  require('../../utils/theme').apply(this);
  if(this.chooseCityAfterSearch){
   this.chooseCityAfterSearch=false;
   setTimeout(()=>{if(this.visible&&!this.unloaded)this.chooseCity();},0);
  }
  const pref=context.current(),key=pref.cityCode+':'+pref.districtCode;
  const regionChanged=key!==this.browseKey||this.cityReselected;
  const feedContext=JSON.stringify([key,wx.getStorageSync('city_life_v2_auth_token'),wx.getStorageSync('city_life_acceptance_mode')]);
  const changedContext=feedContext!==this.feedContext;
  this.feedContext=feedContext;
  if(regionChanged||changedContext){
   const searchScope=this.searchScope;
   const browsing=searchScope&&searchScope.cityCode===pref.cityCode?searchScope:
    !this.scopeApplied&&this.initialScope?this.initialScope:
    regionChanged?pref:this.data;
   const cityChanged=!!this.data.cityCode&&browsing.cityCode!==this.data.cityCode;
   this.scopeApplied=true;
   this.cityReselected=false;
   this.browseKey=key;
   this.searchScope=null;
   this.resumeSearch=false;
   this.centerOnReturn=false;
   this.version=(this.version||0)+1;
   this.setData({
    cityCode:browsing.cityCode,districtCode:browsing.districtCode,
    cityLabel:geography.findCity(browsing.cityCode)?.name||'选择地区',
    ...(cityChanged?{categoryId:'',refinements:{},filterCount:countFilters(this.data.filters)}:{}),
    items:[],clusterItems:[],markers:[],total:0,selectedId:'',anchor:'',drawer:'half',dirty:false,hasMore:false,mapUnavailable:false,error:''
   });
   return this.centerCity();
  }
  if(this.ready&&this.resumeSearch){
   this.resumeSearch=false;
   if(this.centerOnReturn){this.centerOnReturn=false;return this.centerCity();}
   this.scheduleCitySearch();
  }
 },
 onReady(){
  this.map=wx.createMapContext('information-map',this);
  this.ready=true;
  if(this.data.spatial)this.scheduleCitySearch();
  else return this.searchArea();
 },
 onHide(){this.visible=false;this.resumeSearch=!!this.resumeSearch||!!this.data.loading||this.awaitingCenter;this.version=(this.version||0)+1;this.locationTicket=(this.locationTicket||0)+1;clearTimeout(this.centerTimer);this.setData({filterOpen:false,loading:false,locating:false});},
 onUnload(){this.unloaded=true;this.visible=false;this.version=(this.version||0)+1;this.centerTicket=(this.centerTicket||0)+1;clearTimeout(this.centerTimer);},
 centerCity(){
  const center=geography.centerForCity(this.data.cityCode);this.centerTicket=(this.centerTicket||0)+1;this.version=(this.version||0)+1;
  if(!this.data.spatial){this.awaitingCenter=false;this.setData({geoError:'',loading:false});return this.searchArea();}
  if(!center){this.centerTarget=null;this.awaitingCenter=false;this.setData({geoError:this.data.cityCode?'暂缺该地区的展示中心，请重新选择地区。':'选择地区后查看附近公开信息。',loading:false});return;}
  this.centerAt(center,11);
 },
 centerAt(center,scale){
  this.centerTarget=center;this.awaitingCenter=true;this.centerRetries=0;
  this.setData({latitude:center.latitude,longitude:center.longitude,scale,geoError:'',error:'',mapUnavailable:false,dirty:false,clusterItems:[],loading:false},()=>{
   if(!this.ready||this.unloaded||this.visible===false||!this.data.spatial)return;
   this.map=wx.createMapContext('information-map',this);
   this.scheduleCitySearch();
  });
 },
 scheduleCitySearch(delay=250){clearTimeout(this.centerTimer);if(!this.ready||!this.data.cityCode||this.unloaded||this.visible===false)return;const ticket=this.centerTicket;this.centerTimer=setTimeout(()=>{if(!this.unloaded&&this.visible!==false&&ticket===this.centerTicket)this.searchArea();},delay);},
 draftCategory(e){this.setData({draftCategoryId:categoryInChannel(e.detail.categoryId,this.data.type)});},
 draftDistrict(e){if(browse.districts(this.data.cityCode).some(d=>d.code===e.detail.districtCode))this.setData({draftDistrictCode:e.detail.districtCode});},
 resetConditions(){this.setData({categoryId:'',districtCode:'',refinements:{},filters:{...filters.defaults},filterCount:0,rangeMode:'current'});return this.searchArea();},
 removeCondition(e){
  const patch=browse.remove({...this.data,...this.data.filters},e.detail.key),next={...this.data.filters};
  for(const key of Object.keys(filters.defaults))if(key in patch)next[key]=patch[key];
  this.setData({q:patch.q??this.data.q,categoryId:patch.categoryId??this.data.categoryId,districtCode:patch.districtCode??this.data.districtCode,refinements:patch.refinements||this.data.refinements,filters:next,filterCount:countFilters(next,patch.refinements||this.data.refinements)});
  return this.searchArea();
 },
 async openSearch(){
  if(!this.data.cityCode){this.chooseCity();return;}
  const {type,q,categoryId,cityCode,districtCode,spatial}=this.data;
  const options={...this.data.filters,refinements:this.data.refinements,cityCode,districtCode};
  if(!spatial){
   return nav.search(type,q,categoryId,{...options,publicOnly:true,fromDiscover:true,events:{browseSearchApplied:value=>this.applySearchContext(value)}});
  }
  try{
   const region=await this.readMapRegion();
   if(this.unloaded||this.visible===false||type!==this.data.type||cityCode!==this.data.cityCode)return;
   const bounds=browse.bounds({west:region?.southwest?.longitude,east:region?.northeast?.longitude,south:region?.southwest?.latitude,north:region?.northeast?.latitude});
   if(!bounds)throw Error('Invalid map region');
   nav.search(type,q,categoryId,{...options,bounds,fromMap:true,publicOnly:true,events:{
    mapChooseCity:()=>{this.chooseCityAfterSearch=true;},
    mapSearchApplied:value=>this.applySearchContext(value)
   }});
  }catch{if(!this.unloaded&&this.visible!==false&&type===this.data.type)api.showError(Error('暂时无法读取地图范围，请重试'));}
 },
 applySearchContext(value){
  if(this.unloaded||browse.signature({...this.data,...this.data.filters})===browse.signature(value))return;
  const scope=browse.common(value);
  if(!scope.cityCode)return;
  if(scope.cityCode!==this.data.cityCode||this.searchScope)this.searchScope=scope;
  const type=channels.some(channel=>channel.id===scope.type)?scope.type:this.data.type,pinChannel=hasPins(type),spatial=pinChannel&&!this.preferList;
  const {days,images,sort}=scope,selected=refinements.normalize(scope.refinements||{},type);
  const next={days,images,sort:mapSort(type,sort,spatial),publisher:spatial&&value.publisher==='verified'?'verified':'all'};
  this.version=(this.version||0)+1;
  this.centerOnReturn=spatial&&!this.data.spatial;
  this.setData({...scope,type,pinChannel,spatial,cityLabel:geography.findCity(scope.cityCode).name,channelName:channelName(type),filterOptions:filterChoices(type,spatial),categoryId:categoryInChannel(scope.categoryId,type),refinements:selected,filters:next,filterCount:countFilters(next,selected),items:[],clusterItems:[],markers:[],total:0,hasMore:false,selectedId:'',dirty:spatial});
  this.resumeSearch=true;
 },
 chooseCity(){wx.navigateTo({url:'/pages/regions/index?returnTo=previous',events:{citySelected:()=>{this.cityReselected=true;}}});},
 goBack(){wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/discover/index'})});},
 returnToCenter(){
  if(!geography.centerForCity(this.data.cityCode)){this.chooseCity();return;}
  this.locationTicket=(this.locationTicket||0)+1;
  this.setData({rangeMode:'city',locating:false});
  this.centerCity();
 },
 async locateHere(){
  if(!this.data.spatial||!this.data.cityCode||this.data.locating)return;
  const {cityCode,type}=this.data,ticket=this.locationTicket=(this.locationTicket||0)+1;
  const current=()=>!this.unloaded&&this.visible!==false&&ticket===this.locationTicket&&this.data.spatial&&this.data.cityCode===cityCode&&this.data.type===type;
  this.setData({locating:true});
  try{
   const position=await new Promise((resolve,reject)=>wx.getLocation({type:'gcj02',success:resolve,fail:reject}));
   if(!current())return;
   const point=browse.origin(position);
   if(!point)throw Error('未取得有效定位');
   this.version=(this.version||0)+1;this.centerTicket=(this.centerTicket||0)+1;
   this.setData({rangeMode:'current',scopeNotice:'地图已移到当前位置，仍按'+this.data.cityLabel+'筛选。'});
   this.centerAt(point,14);
  }catch{
   if(current())wx.showToast({title:'未取得定位，可手动移动地图',icon:'none'});
  }finally{
   if(current())this.setData({locating:false});
  }
 },
 toggleMapMode(){
  if(!this.data.pinChannel)return;
  const spatial=!this.data.spatial;
  this.preferList=!spatial;
  this.locationTicket=(this.locationTicket||0)+1;
  this.awaitingCenter=false;
  const next={...this.data.filters,sort:mapSort(this.data.type,this.data.filters.sort,spatial),publisher:'all'};
  this.setData({spatial,locating:false,filters:next,filterOptions:filterChoices(this.data.type,spatial),filterCount:countFilters(next,this.data.refinements),drawer:'half',rangeMode:'current',scopeNotice:'',geoError:''});
  return spatial?this.centerCity():this.searchArea();
 },
 openFilters(){this.setData({filterOpen:true,draftFilters:{...this.data.filters},draftRange:this.data.rangeMode,draftCategoryId:this.data.categoryId,draftDistrictCode:this.data.districtCode,draftRefinements:this.data.refinements,businessFilters:refinements.businessPanel(this.data.type,this.data.refinements)});},
 closeFilters(){this.setData({filterOpen:false});},
 chooseFilter(e){const {key,value}=e.currentTarget.dataset;if(this.data.filterOptions.some(group=>group.key===key&&group.values.some(option=>option.value===value)))this.setData({draftFilters:{...this.data.draftFilters,[key]:value}});},
 chooseBusinessFilter(e){
  if(!this.data.filterOpen)return;
  const {key,value}=e.currentTarget.dataset,selected=refinements.selectBusiness(this.data.type,this.data.draftRefinements,key,value);
  if(selected)this.setData({draftRefinements:selected,businessFilters:refinements.businessPanel(this.data.type,selected)});
 },
 resetFilters(){this.setData({draftFilters:{...filters.defaults},draftRange:'current',draftCategoryId:'',draftDistrictCode:'',draftRefinements:{},businessFilters:refinements.businessPanel(this.data.type)});},
 chooseDraftRange(e){const range=e.currentTarget.dataset.value;if(['current','city'].includes(range))this.setData({draftRange:range});},
 applyFilters(){
  const {draftFilters:value,draftRange:rangeMode,draftCategoryId:categoryId,draftDistrictCode:districtCode,draftRefinements:selected}=this.data;
  this.setData({categoryId,districtCode,refinements:selected,filters:value,filterCount:countFilters(value,selected),rangeMode,filterOpen:false});
  return this.data.spatial&&rangeMode==='city'?this.centerCity():this.searchArea();
 },
 changeType(e){
  const type=e.detail?.type||e.currentTarget?.dataset?.type;
  if(!channels.some(channel=>channel.id===type)||type===this.data.type)return;
  const wasSpatial=this.data.spatial,pinChannel=hasPins(type),spatial=pinChannel&&!this.preferList,next={...this.data.filters,sort:mapSort(type,this.data.filters.sort,spatial),publisher:'all'};
  clearTimeout(this.centerTimer);
  this.locationTicket=(this.locationTicket||0)+1;
  this.setData({type,pinChannel,spatial,locating:false,channelName:channelName(type),filterOptions:filterChoices(type,spatial),categoryId:'',refinements:{},filters:next,filterCount:countFilters(next),drawer:'half',dirty:false,scopeNotice:'',geoError:''});
  return spatial&&!wasSpatial?this.centerCity():this.searchArea();
 },
 regionChanged(e){
  if(!this.data.spatial||(e.detail?.type||e.type)!=='end')return;const cause=e.causedBy||e.detail?.causedBy;
  if(['gesture','drag','scale'].includes(cause)){clearTimeout(this.centerTimer);this.version=(this.version||0)+1;this.locationTicket=(this.locationTicket||0)+1;this.awaitingCenter=false;this.failedPage=0;this.setData({dirty:true,locating:false,loading:false,error:'',geoError:'',mapUnavailable:false,rangeMode:'current',clusterItems:[],selectedId:'',anchor:''});}
  const scale=e.detail?.scale??e.scale;if(Number.isFinite(scale))this.syncScale(scale);else this.map?.getScale?.({success:r=>this.syncScale(r.scale)});
 },
 syncScale(scale){if(this.unloaded||!Number.isFinite(scale)||scale===this.data.scale)return;this.setData({scale});this.renderMarkers();},
 readMapRegion(){
  return new Promise((resolve,reject)=>{
   const unavailable=()=>{
    clearTimeout(timer);
    const error=Error('地图范围读取超时或暂不可用，请重试或返回列表浏览');
    error.code='MAP_REGION_UNAVAILABLE';reject(error);
   };
   const timer=setTimeout(unavailable,8000);
   try{this.map.getRegion({success:value=>{
    if(!browse.bounds({west:value?.southwest?.longitude,east:value?.northeast?.longitude,south:value?.southwest?.latitude,north:value?.northeast?.latitude}))return unavailable();
    clearTimeout(timer);resolve(value);
   },fail:unavailable});}
   catch{unavailable();}
  });
 },
 async searchArea(){
  if(!this.ready||!this.data.cityCode||this.visible===false||this.unloaded)return;
  clearTimeout(this.centerTimer);
  const version=this.version=(this.version||0)+1;this.failedPage=0;this.markerLookup=null;this.setData({loading:true,mapUnavailable:false,error:'',items:[],clusterItems:[],markers:[],total:0,hasMore:false,selectedId:'',anchor:''});
  if(!this.data.spatial){this.bounds=null;return this.fetchPage(1,version);}
  try{
   const box=await this.readMapRegion();
   if(this.unloaded||version!==this.version)return;
   this.bounds={west:box.southwest.longitude,east:box.northeast.longitude,south:box.southwest.latitude,north:box.northeast.latitude};
   const c=this.centerTarget,b=this.bounds;
   if(this.awaitingCenter&&c&&(!(c.longitude>=b.west&&c.longitude<=b.east&&c.latitude>=b.south&&c.latitude<=b.north)||b.east-b.west>5)){
    if(this.centerRetries++<5)this.scheduleCitySearch(200);
    else this.setData({loading:false,mapUnavailable:true,geoError:'地图尚未完成地区切换，可重试或切换列表。'});
    return;
   }
   this.awaitingCenter=false;await this.fetchPage(1,version);
  }catch(e){if(!this.unloaded&&version===this.version)this.setData({loading:false,error:e.message,mapUnavailable:e.code==='MAP_REGION_UNAVAILABLE'});}
 },
 async fetchPage(page,version){
  this.setData({loading:true,error:''});
  const {cityCode,districtCode,q,categoryId,type,spatial,refinements:selected}=this.data;
  const query={cityCode,districtCode,q,categoryId,refinements:selected,...this.data.filters};
  try{
   const url=spatial?browse.mapUrl({...query,type,bounds:this.bounds},page):feedUrl({...query,type:'all',channel:type,publicOnly:true,page});
   const result=await api.request('GET',url);
   if(this.unloaded||version!==this.version)return;
   const rows=(result.items||[]).map(item=>({...present.item(item),...require('../../utils/map-preview').describe(item,this.bounds),cover:present.media(item.images?.[0],true),typeName:channels.find(c=>c.id===item.type)?.name||'信息',icon:'/assets/icons/type-'+(['job','housing','used','merchant','service'].includes(item.type)?item.type:'community')+'-'+this.data.iconPalette+'.png'}));
   const items=[...new Map([...(page===1?[]:this.data.items),...rows].map(x=>[x.id,x])).values()];
   this.setData({items,total:result.total??items.length,page,hasMore:!!result.pagination?.hasMore&&page<(spatial?200:MAX_PAGE),loading:false,dirty:false,geoError:'',mapUnavailable:false});if(spatial)this.renderMarkers();
  }catch(e){if(!this.unloaded&&version===this.version){this.failedPage=page;this.setData({loading:false,error:e.message,mapUnavailable:spatial&&(e.code==='MAP_REGION_UNAVAILABLE'||e.code==='MAP_UNAVAILABLE')});}}
 },
 more(){if(!this.data.clusterItems.length&&!this.data.error&&!this.data.loading&&this.data.hasMore&&!this.data.dirty)return this.fetchPage(this.data.page+1,this.version);},
 retry(){if(this.data.geoError&&this.data.spatial)return this.centerCity();return this.failedPage>1?this.fetchPage(this.failedPage,this.version):this.searchArea();},
 renderMarkers(){const built=markerBuilder.markers(this.data.spatial?this.data.items:[],this.data.scale,this.data.selectedId,this.data.iconPalette);this.markerLookup=built.lookup;this.setData({markers:built.markers});},
 markerTap(e){
  const rows=this.markerLookup?.get(+(e.detail?.markerId??e.markerId));if(!rows?.length)return;
  if(rows.length>1&&this.data.scale<18){this.setData({latitude:rows[0].latitude,longitude:rows[0].longitude,scale:Math.min(18,this.data.scale+2),dirty:true,drawer:'half',clusterItems:[],selectedId:'',anchor:''});this.renderMarkers();return;}
  this.setData({clusterItems:rows.length>1?rows:[]});
  this.select(rows[0].id,false);
 },
 clearCluster(){this.setData({clusterItems:[],selectedId:'',anchor:''});this.renderMarkers();},
 selectRow(e){this.openDetail(e);},
 showOnMap(e){if(this.data.spatial)this.select(e.currentTarget.dataset.id,true);},
 select(id,move){const item=this.data.items.find(x=>x.id===id);if(!item)return;this.setData({selectedId:id,anchor:'map-item-'+id,drawer:'half',...(move?{latitude:item.latitude,longitude:item.longitude}:{})});this.renderMarkers();},
 openDetail(e){nav.detail(e.currentTarget.dataset.id);},
 toggleDrawer(){if(Date.now()<(this.suppressTapUntil||0))return;this.setData({drawer:this.data.drawer==='collapsed'?'half':this.data.drawer==='half'?'expanded':'collapsed'});},
 dragStart(e){this.dragY=e.touches?.[0]?.clientY;},cancelDrag(){this.dragY=undefined;},
 dragEnd(e){const y=e.changedTouches?.[0]?.clientY;if(y===undefined||this.dragY===undefined)return;const delta=y-this.dragY,at=drawerStates.indexOf(this.data.drawer);if(Math.abs(delta)>40){this.suppressTapUntil=Date.now()+350;this.setData({drawer:drawerStates[Math.max(0,Math.min(2,at+(delta<0?1:-1)))]});}this.dragY=undefined;}
});
