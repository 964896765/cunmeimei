const api=require('../../utils/api'),context=require('../../utils/geo-context'),nav=require('../../utils/navigation'),markerBuilder=require('../../utils/map-markers'),geography=require('../../utils/geography'),filters=require('../../utils/map-filters'),present=require('../../utils/presentation');
const browse=require('../../utils/browse-query');
const channels=require('../../utils/business-templates').channels;
const drawerStates=['collapsed','half','expanded'];
const countFilters=(value,refinements={})=>filters.options.filter(x=>x.key!=='sort'&&value[x.key]!==filters.defaults[x.key]).length+Object.keys(refinements).length;
Page({
 data:{refinements:{},headerHeight:88,cityCode:'',districtCode:'',cityLabel:'选择地区',q:'',type:'all',channels,latitude:35.8617,longitude:104.1954,scale:4,markers:[],items:[],total:0,selectedId:'',anchor:'',drawer:'half',dirty:false,loading:false,hasMore:false,mapUnavailable:false,error:'',geoError:'',filters:{...filters.defaults},draftFilters:{...filters.defaults},rangeMode:'current',draftRange:'current',rangeLabel:'当前视野',filterOptions:filters.options,filterCount:0,filterOpen:false},
 onLoad(opts={}){const scope=browse.common(opts);this.initialScope=scope.cityCode?scope:null;this.sourceType=scope.type;const decode=require('../../utils/route-query').decodeQuery,type=['all','merchant','service'].includes(scope.type)?scope.type:'all',value={...filters.defaults};for(const key of Object.keys(value)){const v=key==='days'?Number(opts[key]):opts[key];if(filters.valid(key,v))value[key]=v;}const category=require('../../utils/classification').find(decode(opts.categoryId)),notices=[],refinements=require('../../utils/discovery-refinements').normalize(scope.refinements||{},type);if(type!==scope.type)notices.push('地图仅展示公开位置的商家与服务，原频道请返回列表查看。');if(['price_low','price_high','popular','distance'].includes(opts.sourceSort)||Number(opts.sourceRadius)>0)notices.push('地图改按当前视野检索；原列表的价格、热度或定位距离条件仍可返回后继续使用。');this.setData({type,refinements,q:decode(opts.q).slice(0,80),categoryId:category?.id||'',filters:value,filterCount:countFilters(value,refinements),scopeNotice:notices.join(' ')});},
 onShow(){
  this.visible=true;require('../../utils/theme').apply(this);if(this.chooseCityAfterSearch){this.chooseCityAfterSearch=false;setTimeout(()=>{if(this.visible&&!this.unloaded)this.chooseCity();},0);}
  const pref=context.current(),key=pref.cityCode+':'+pref.districtCode,changedBrowse=key!==this.browseKey||this.cityReselected,browsing=!this.scopeApplied&&this.initialScope?this.initialScope:changedBrowse?pref:{cityCode:this.data.cityCode,districtCode:this.data.districtCode,label:this.data.cityLabel},feedContext=JSON.stringify([key,wx.getStorageSync('city_life_v2_auth_token'),wx.getStorageSync('city_life_acceptance_mode')]),changedContext=feedContext!==this.feedContext;this.feedContext=feedContext;
  if(key!==this.browseKey||this.cityReselected||changedContext){this.scopeApplied=true;this.cityReselected=false;this.browseKey=key;this.version=(this.version||0)+1;this.setData({cityCode:browsing.cityCode,districtCode:browsing.districtCode,cityLabel:geography.findCity(browsing.cityCode)?.name||browsing.label,items:[],markers:[],total:0,selectedId:'',anchor:'',drawer:'half',dirty:false,hasMore:false,mapUnavailable:false,error:''});this.centerCity();}
  else if(this.ready&&this.resumeSearch){this.resumeSearch=false;this.scheduleCitySearch();}
 },
 onReady(){this.map=wx.createMapContext('information-map',this);this.ready=true;this.scheduleCitySearch();},
 onHide(){this.visible=false;this.resumeSearch=!!this.data.loading||this.awaitingCenter;this.version=(this.version||0)+1;clearTimeout(this.centerTimer);this.setData({filterOpen:false,loading:false});},
 onUnload(){this.unloaded=true;this.visible=false;this.version=(this.version||0)+1;this.centerTicket=(this.centerTicket||0)+1;clearTimeout(this.centerTimer);},
 centerCity(){
  const center=geography.centerForCity(this.data.cityCode);this.centerTicket=(this.centerTicket||0)+1;this.version=(this.version||0)+1;
  if(!center){this.centerTarget=null;this.awaitingCenter=false;this.setData({geoError:this.data.cityCode?'暂缺该地区的展示中心，请重新选择地区。':'选择地区后查看附近公开信息。',loading:false});return;}
  this.centerTarget=center;this.awaitingCenter=true;this.centerRetries=0;
  this.setData({latitude:center.latitude,longitude:center.longitude,scale:11,geoError:'',loading:false},()=>{if(this.ready)this.scheduleCitySearch();});
 },
 scheduleCitySearch(delay=250){clearTimeout(this.centerTimer);if(!this.ready||!this.data.cityCode||this.unloaded||this.visible===false)return;const ticket=this.centerTicket;this.centerTimer=setTimeout(()=>{if(!this.unloaded&&this.visible!==false&&ticket===this.centerTicket)this.searchArea();},delay);},
 categoryChanged(e){const c=browse.category(e.detail.categoryId);this.setData({categoryId:c.id});return this.searchArea();},
 districtChanged(e){if(!browse.districts(this.data.cityCode).some(d=>d.code===e.detail.districtCode))return;this.setData({districtCode:e.detail.districtCode});return this.searchArea();},
 returnToList(){if(getCurrentPages().length>1)return this.goBack();nav.discover(this.sourceType||this.data.type,this.data.categoryId,{...this.data,...this.data.filters});},
 resetConditions(){this.setData({categoryId:'',districtCode:'',refinements:{},filters:{...filters.defaults},filterCount:0});return this.searchArea();},
 removeCondition(e){const patch=browse.remove({...this.data,...this.data.filters},e.detail.key),next={...this.data.filters};for(const key of Object.keys(filters.defaults))if(key in patch)next[key]=patch[key];this.setData({...(e.detail.key==='q'?{q:''}:{}),...('refinements' in patch?{refinements:patch.refinements}:{}),filters:next,filterCount:countFilters(next,patch.refinements||this.data.refinements)});return this.searchArea();},
 async openSearch(){if(!this.data.cityCode||!this.map){this.chooseCity();return;}try{const region=await this.readMapRegion(),bounds={west:region.southwest.longitude,east:region.northeast.longitude,south:region.southwest.latitude,north:region.northeast.latitude};nav.search(this.data.type,this.data.q,this.data.categoryId,{...this.data.filters,refinements:this.data.refinements,cityCode:this.data.cityCode,districtCode:this.data.districtCode,bounds,fromMap:true,publicOnly:true,events:{mapChooseCity:()=>{this.chooseCityAfterSearch=true;},mapSearchApplied:value=>{if(this.unloaded||browse.signature({...this.data,...this.data.filters})===browse.signature(value))return;const c=browse.common(value);if(!c.cityCode)return;this.version=(this.version||0)+1;const filtersValue={...this.data.filters,days:c.days,images:c.images,sort:c.sort==='latest'?'latest':'recommended',publisher:value.publisher==='verified'?'verified':'all'};this.setData({...c,refinements:c.refinements||{},filters:filtersValue,filterCount:countFilters(filtersValue,c.refinements||{}),items:[],markers:[],total:0,selectedId:'',dirty:true});this.resumeSearch=true;}}});}catch{api.showError(Error('暂时无法读取地图范围，请重试'));}},
 chooseCity(){wx.navigateTo({url:'/pages/regions/index?returnTo=previous',events:{citySelected:()=>{this.cityReselected=true;}}});},
 headerMeasured(e){this.setData({headerHeight:e.detail.height});},
 goBack(){wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/discover/index'})});},
 returnToCenter(){const c=geography.centerForCity(this.data.cityCode);if(!c){this.chooseCity();return;}this.version=(this.version||0)+1;this.awaitingCenter=false;this.setData({latitude:c.latitude,longitude:c.longitude,scale:11,dirty:true,loading:false,rangeLabel:'城市视野',rangeMode:'city'});},
 expandResults(){this.setData({drawer:this.data.drawer==='expanded'?'half':'expanded'});},
 preventScroll(){},
 openFilters(){this.setData({filterOpen:true,draftFilters:{...this.data.filters},draftRange:this.data.rangeMode});},
 closeFilters(){this.setData({filterOpen:false});},
 chooseFilter(e){const {key,value}=e.currentTarget.dataset;if(filters.valid(key,value))this.setData({draftFilters:{...this.data.draftFilters,[key]:value}});},
 resetFilters(){this.setData({draftFilters:{...filters.defaults},draftRange:'current'});},
 chooseDraftRange(e){const range=e.currentTarget.dataset.value;if(['current','city'].includes(range))this.setData({draftRange:range});},
 applyFilters(){const value={...this.data.draftFilters},rangeMode=this.data.draftRange;if(!Object.keys(filters.defaults).every(k=>filters.valid(k,value[k]))||!['current','city'].includes(rangeMode))return;this.setData({filters:value,filterCount:countFilters(value,this.data.refinements),rangeMode,rangeLabel:rangeMode==='city'?'城市视野':'当前视野',filterOpen:false});return rangeMode==='city'?this.centerCity():this.searchArea();},
 changeType(e){const type=e.detail?.type||e.currentTarget?.dataset?.type;if(!['all','merchant','service'].includes(type)||type===this.data.type)return;this.setData({type,refinements:{},filterCount:countFilters(this.data.filters),drawer:'half'});return this.searchArea();},
 regionChanged(e){
  if(e.type!=='end')return;const cause=e.causedBy||e.detail?.causedBy;
  if(['gesture','drag','scale'].includes(cause)){this.version=(this.version||0)+1;this.awaitingCenter=false;this.setData({dirty:true,loading:false,geoError:'',rangeMode:'current',rangeLabel:'当前视野'});}
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
   try{this.map.getRegion({success:value=>{clearTimeout(timer);resolve(value);},fail:unavailable});}
   catch{unavailable();}
  });
 },
 async searchArea(){
  if(!this.ready||!this.data.cityCode)return;
  const version=this.version=(this.version||0)+1;this.failedPage=0;this.setData({loading:true,mapUnavailable:false,error:'',items:[],markers:[],total:0,hasMore:false,selectedId:'',anchor:''});
  try{
   const box=await this.readMapRegion();
   if(this.unloaded||version!==this.version)return;
   this.bounds={west:box.southwest.longitude,east:box.northeast.longitude,south:box.southwest.latitude,north:box.northeast.latitude};
   const c=this.centerTarget,b=this.bounds;
   if(this.awaitingCenter&&c&&(!(c.longitude>=b.west&&c.longitude<=b.east&&c.latitude>=b.south&&c.latitude<=b.north)||b.east-b.west>5)){
    this.setData({loading:false});if(this.centerRetries++<5)this.scheduleCitySearch(200);else this.setData({geoError:'地图尚未完成地区切换，请重试。'});return;
   }
   this.awaitingCenter=false;await this.fetchPage(1,version);
  }catch(e){if(!this.unloaded&&version===this.version)this.setData({loading:false,error:e.message,mapUnavailable:e.code==='MAP_REGION_UNAVAILABLE'});}
 },
 async fetchPage(page,version){
  this.setData({loading:true,error:''});const query={...this.bounds,cityCode:this.data.cityCode,districtCode:this.data.districtCode,q:this.data.q,categoryId:this.data.categoryId||'',type:this.data.type,...this.data.filters,...(Object.keys(this.data.refinements).length?{refinements:JSON.stringify(this.data.refinements)}:{}),page};
  try{
   const url='/api/v1/map?'+Object.entries(query).map(([key,value])=>key+'='+encodeURIComponent(value)).join('&'),result=await api.request('GET',url);
   if(this.unloaded||version!==this.version)return;
   const rows=(result.items||[]).map(item=>({...item,...require('../../utils/map-preview').describe(item,this.bounds),cover:present.media(item.images?.[0],true),typeName:channels.find(c=>c.id===item.type)?.name||'信息',icon:'/assets/icons/type-'+item.type+'-'+this.data.iconPalette+'.png'}));
   const items=[...new Map([...(page===1?[]:this.data.items),...rows].map(x=>[x.id,x])).values()];
   this.hasLoaded=true;this.setData({items,total:result.total??items.length,page,hasMore:!!result.pagination?.hasMore,loading:false,dirty:false,geoError:''});this.renderMarkers();
  }catch(e){if(!this.unloaded&&version===this.version){this.failedPage=page;this.setData({loading:false,error:e.message,mapUnavailable:e.code==='MAP_REGION_UNAVAILABLE'});}}
 },
 more(){if(!this.data.loading&&this.data.hasMore&&!this.data.dirty)return this.fetchPage(this.data.page+1,this.version);},retry(){return this.failedPage>1?this.fetchPage(this.failedPage,this.version):this.searchArea();},
 renderMarkers(){const built=markerBuilder.markers(this.data.items,this.data.scale,this.data.selectedId,this.data.iconPalette);this.markerLookup=built.lookup;this.setData({markers:built.markers});},
 markerTap(e){
  const rows=this.markerLookup?.get(+e.detail.markerId);if(!rows?.length)return;
  if(rows.length>1&&this.data.scale<18){this.setData({latitude:rows[0].latitude,longitude:rows[0].longitude,scale:Math.min(18,this.data.scale+2),dirty:true,drawer:'half',selectedId:'',anchor:''});this.renderMarkers();return;}
  this.select(rows[0].id,false);
 },
 selectRow(e){this.openDetail(e);},
 select(id,move){const item=this.data.items.find(x=>x.id===id);if(!item)return;this.setData({selectedId:id,anchor:'map-item-'+id,drawer:'half',...(move?{latitude:item.latitude,longitude:item.longitude}:{})});this.renderMarkers();},
 openDetail(e){nav.detail(e.currentTarget.dataset.id);},
 toggleDrawer(){if(Date.now()<(this.suppressTapUntil||0))return;this.setData({drawer:this.data.drawer==='collapsed'?'half':this.data.drawer==='half'?'expanded':'collapsed'});},
 dragStart(e){this.dragY=e.touches?.[0]?.clientY;},cancelDrag(){this.dragY=undefined;},
 dragEnd(e){const y=e.changedTouches?.[0]?.clientY;if(y===undefined||this.dragY===undefined)return;const delta=y-this.dragY,at=drawerStates.indexOf(this.data.drawer);if(Math.abs(delta)>40){this.suppressTapUntil=Date.now()+350;this.setData({drawer:drawerStates[Math.max(0,Math.min(2,at+(delta<0?1:-1)))]});}this.dragY=undefined;}
});
