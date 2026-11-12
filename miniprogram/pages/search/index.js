const api=require('../../utils/api'),nav=require('../../utils/navigation'),region=require('../../utils/region'),present=require('../../utils/presentation');
const geoContext=require('../../utils/geo-context'),history=require('../../utils/search-history');
const business=require('../../utils/business-templates'),filters=require('../../utils/search-filters');
const browse=require('../../utils/browse-query');
const {decodeQuery}=require('../../utils/route-query');
const {feedUrl,allowed,MAX_PAGE}=require('../../utils/feed-query');
const session=()=>JSON.stringify(['city_life_user_id','city_life_v2_auth_token','city_life_acceptance_mode'].map(key=>wx.getStorageSync(key)||''));
function context(){const b=geoContext.current();return JSON.stringify([session(),b.cityCode,b.districtCode]);}
Page({data:{mapScoped:false,publisher:'all',draftPublisher:'all',publicOnly:false,categoryId:'',categoryName:'',q:'',submittedQ:'',scrollAnchor:'search-top-0',type:'all',types:business.searchOptions,typeIndex:0,area:'全部地区',areaIndex:0,areas:['全部地区'],sortIndex:0,sort:'recommended',sortNames:['综合排序','最新发布','价格从低到高','价格从高到低','收藏热度'],items:[],page:0,loading:false,hasMore:false,error:'',searched:false,recentTerms:[],popularTerms:[],landingLoading:false,landingError:'',advancedOpen:false,dateOptions:filters.dateOptions,radiusOptions:filters.radiusOptions,imageOptions:[{value:'all',label:'全部'},{value:'with',label:'仅有图片'}],images:'all',draftImages:'all',days:0,radiusKm:0,draftDays:0,draftRadius:0,filterBusy:false,filterError:'',filterSummary:'',filterNotice:'',canFilterDistance:false},
 onLoad(opts={}){
  this.fromMap=opts.fromMap==='1';this.fromDiscover=opts.fromDiscover==='1';this.mapBounds=this.fromMap?browse.bounds(opts):null;
  const scope=browse.common({...opts,categoryId:decodeQuery(opts.categoryId),q:decodeQuery(opts.q)}),origin=browse.origin(opts),radiusKm=filters.validRadius(Number(opts.radiusKm))?Number(opts.radiusKm):0;
  this.initialScope=scope.cityCode?scope:null;this.initialArea=decodeQuery(opts.area);
  const types=this.fromMap?business.searchOptions.filter(x=>['all','merchant','service'].includes(x.id)):business.searchOptions;
  if(this.fromMap&&!types.some(x=>x.id===scope.type))scope.type='all';
  this.setData({...scope,types,mapScoped:!!this.mapBounds,publicOnly:this.fromMap||opts.publicOnly==='1',publisher:this.fromMap&&opts.publisher==='verified'?'verified':'all',categoryName:browse.category(scope.categoryId).name,typeIndex:Math.max(0,types.findIndex(x=>x.id===scope.type)),canFilterDistance:!this.fromMap&&filters.canLocate(scope.type),...(origin?origin:{}),radiusKm:!this.fromMap&&filters.canLocate(scope.type)&&origin?radiusKm:0,submittedQ:scope.q,searched:!!scope.q||!!scope.categoryId||scope.type!=='all'||!!scope.days||scope.images==='with'||this.fromMap});
  this.syncSorts();
 },
 syncSorts(){const options=browse.sortOptions(this.data.type,this.fromMap?'map':'feed'),valid=options.some(x=>x.code===this.data.sort)&&(this.data.sort!=='distance'||browse.origin(this.data)),sort=valid?this.data.sort:'recommended';this.setData({sortOptions:options,sortNames:options.map(x=>x.name),sort,sortIndex:Math.max(0,options.findIndex(x=>x.code===sort))});},

 historyKey(){return 'city_life_search_history_'+(api.hasSession()&&wx.getStorageSync('city_life_user_id')||'guest');},
 loadRecent(){try{this.setData({recentTerms:history.list(wx.getStorageSync(this.historyKey())),historyNotice:''});}catch{this.setData({recentTerms:[],historyNotice:'暂时无法读取本机搜索记录，仍可正常搜索。'});}},
 onShow(){require('../../utils/theme').apply(this);this.loadRecent();const pref=geoContext.current(),browseKey=pref.cityCode+':'+pref.districtCode,changedBrowse=browseKey!==this.browseKey,browsing=!this.scopeApplied&&this.initialScope?this.initialScope:pref;this.scopeApplied=true;if(changedBrowse){this.browseKey=browseKey;this.setData({cityCode:browsing.cityCode,districtCode:browsing.districtCode,cityLabel:require('../../utils/geography').findCity(browsing.cityCode)?.name||browsing.label,area:require('../../utils/geography').findDistrict(browsing.districtCode)?.name||'全部地区'});}const scope=context();if(scope!==this.feedContext){this.feedContext=scope;this.initVersion=(this.initVersion||0)+1;this.version=(this.version||0)+1;this.landingVersion=(this.landingVersion||0)+1;this.setData({items:[],popularTerms:[],page:0,hasMore:false,limitReached:false,error:'',loading:false,landingLoading:false});if(this.initialized)return this.data.queryDirty?undefined:changedBrowse?this.initialize():this.data.searched?this.search(false):this.loadDiscovery();}if(!this.initialized)return this.initialize();},
 onHide(){this.sortAttempt=(this.sortAttempt||0)+1;this.closeAdvanced();},onUnload(){this.unloaded=true;this.sortAttempt=(this.sortAttempt||0)+1;this.filterAttempt=(this.filterAttempt||0)+1;this.initVersion=(this.initVersion||0)+1;this.version=(this.version||0)+1;this.landingVersion=(this.landingVersion||0)+1;},
 onPullDownRefresh(){return this.initialize().finally(()=>wx.stopPullDownRefresh());},onReachBottom(){return this.more();},
 async initialize(){
  const version=this.initVersion=(this.initVersion||0)+1,scope=context(),feedVersion=this.version=(this.version||0)+1;this.setData({loading:true,error:''});
  try{
   const c=await api.request('GET','/api/v1/config');if(this.unloaded||version!==this.initVersion||scope!==context())return;
   const newerQuery=feedVersion!==this.version,city=this.data.cityCode?require('../../utils/geography').findCity(this.data.cityCode):null,areas=['全部地区',...(city?city.districts.map(x=>x.name):c.areas||[])],preferred=newerQuery||this.initialized?this.data.area:this.initialArea,district=city?.districts.find(x=>x.code===this.data.districtCode),area=areas.includes(preferred)?preferred:district?.name||(city?'全部地区':region.selected(c.areas||[]));
   this.setData({areas,...(newerQuery?{}:{area,areaIndex:areas.indexOf(area),loading:false})});this.initialArea='';this.initialized=true;
   if(!newerQuery&&!this.data.queryDirty)return this.data.searched?this.search(false):this.loadDiscovery();
  }catch(e){if(!this.unloaded&&version===this.initVersion&&scope===context()&&feedVersion===this.version)this.setData({error:e.message,loading:false});}
 },
 async loadDiscovery(){const version=this.landingVersion=(this.landingVersion||0)+1,scope=context();this.setData({landingError:'',landingLoading:!!this.data.cityCode});if(!this.data.cityCode){this.setData({popularTerms:[],landingLoading:false});return;}try{const popular=await api.request('GET','/api/v1/search/popular?cityCode='+encodeURIComponent(this.data.cityCode));if(this.unloaded||version!==this.landingVersion||scope!==context())return;this.setData({popularTerms:(popular.items||[]).filter(x=>typeof x.term==='string'),landingLoading:false});}catch(e){if(!this.unloaded&&version===this.landingVersion&&scope===context())this.setData({popularTerms:[],landingLoading:false,landingError:'热门搜索暂时无法加载'});}},
 resetScroll(){this.setData({scrollAnchor:'search-top-'+(this.scrollSerial=(this.scrollSerial||0)+1)});},
 input(e){this.sortAttempt=(this.sortAttempt||0)+1;this.version=(this.version||0)+1;this.closeAdvanced();this.setData({q:e.detail.value,loading:false,error:'',items:[],page:0,hasMore:false,limitReached:false,queryDirty:true});this.resetScroll();},
 clearQuery(){const searched=this.data.searched;this.input({detail:{value:''}});this.setData({submittedQ:'',queryDirty:false});return searched||this.fromMap||this.data.categoryId||this.filterBrowse?this.search(false):this.loadDiscovery();},
 chooseTerm(e){const term=e.currentTarget.dataset.term;if(typeof term!=='string')return;this.setData({q:term});return this.search();},
 clearHistory(){const key=this.historyKey(),scope=session();wx.showModal({title:'清空最近搜索',content:'仅清除此账号在本机保存的搜索记录。',success:r=>{if(!r.confirm||this.unloaded||scope!==session())return;try{wx.removeStorageSync(key);this.setData({recentTerms:[],historyNotice:''});}catch{this.setData({historyNotice:'搜索记录暂时无法清除，请稍后重试。'});}}});},
 categoryChanged(e){const c=browse.category(e.detail.categoryId);this.filterBrowse=true;this.setData({categoryId:c.id,categoryName:c.name});return this.search(false);},
 districtChanged(e){const d=browse.districts(this.data.cityCode).find(x=>x.code===e.detail.districtCode);if(!d)return;this.filterBrowse=true;this.setData({districtCode:d.code,area:d.name,areaIndex:Math.max(0,this.data.areas.indexOf(d.name))});return this.search(false);},
 choosePublisher(e){if(this.fromMap&&['all','verified'].includes(e.currentTarget.dataset.value))this.setData({draftPublisher:e.currentTarget.dataset.value});},
 chooseCity(){if(this.fromMap){this.getOpenerEventChannel?.().emit('mapChooseCity');return this.goBack();}wx.navigateTo({url:'/pages/regions/index?returnTo=previous'});},
 goBack(){wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/home/index'})});},
 changeType(e){const typeIndex=+e.detail.value,type=this.data.types[typeIndex]?.id;if(!type)return;const previousSort=this.data.sort,canFilterDistance=!this.fromMap&&filters.canLocate(type),resetDistance=!canFilterDistance&&(this.data.radiusKm>0||this.data.sort==='distance');this.setData({type,typeIndex,canFilterDistance,filterNotice:resetDistance?'该频道不支持公开位置筛选，已清除距离条件。':'',...(resetDistance?{radiusKm:0,latitude:null,longitude:null}:{})});this.syncSorts();if(previousSort!==this.data.sort&&!resetDistance)this.setData({filterNotice:'该频道不适用原排序，已切换为综合推荐。'});return this.search(false);},
 changeArea(e){const area=this.data.areas[+e.detail.value];if(!area)return;const district=this.data.cityCode?require('../../utils/geography').findCity(this.data.cityCode)?.districts.find(x=>x.name===area):null;this.setData({area,areaIndex:+e.detail.value,...(this.data.cityCode?{districtCode:district?.code||''}:{})});return this.search(false);},
 async chooseSort(e){const sortIndex=+e.detail.value,sort=this.data.sortOptions[sortIndex]?.code;if(!sort)return;
  const attempt=this.sortAttempt=(this.sortAttempt||0)+1,scope=context(),type=this.data.type;
  if(sort==='distance'){try{const position=await new Promise((resolve,reject)=>wx.getLocation({type:'gcj02',success:resolve,fail:reject})),origin=browse.origin(position);if(this.unloaded||attempt!==this.sortAttempt||scope!==context()||type!==this.data.type)return;if(!origin)throw Error('定位结果无效');this.setData(origin);}catch{if(!this.unloaded&&attempt===this.sortAttempt)this.setData({filterNotice:'未取得定位，可继续选择其他排序；浏览城市保持不变。'});return;}}
  this.setData({sortIndex,sort,filterNotice:''});return this.search(false);
 },
 toggleAdvanced(){if(this.data.advancedOpen)return this.closeAdvanced();this.filterAttempt=(this.filterAttempt||0)+1;this.setData({advancedOpen:true,draftImages:this.data.images,draftPublisher:this.data.publisher,draftDays:this.data.days,draftRadius:this.data.radiusKm,filterError:'',filterBusy:false});},
 closeAdvanced(){this.filterAttempt=(this.filterAttempt||0)+1;this.setData({advancedOpen:false,filterBusy:false,filterError:''});},
 chooseImages(e){const images=e.currentTarget.dataset.value;if(['all','with'].includes(images))this.setData({draftImages:images});},
 chooseDate(e){const days=Number(e.currentTarget.dataset.value);if(filters.validDays(days))this.setData({draftDays:days});},
 chooseRadius(e){const radius=Number(e.currentTarget.dataset.value);if(filters.validRadius(radius)&&(!radius||this.data.canFilterDistance))this.setData({draftRadius:radius,filterError:''});},
 resetAdvanced(){this.setData({draftImages:'all',draftDays:0,draftRadius:0,draftPublisher:'all',filterError:''});},
 async applyAdvanced(){
  if(this.data.filterBusy||!this.data.advancedOpen)return;
  const attempt=this.filterAttempt=(this.filterAttempt||0)+1,scope=context(),days=this.data.draftDays,radiusKm=this.data.draftRadius,images=this.data.draftImages;
  if(!filters.validDays(days)||!filters.validRadius(radiusKm)||!['all','with'].includes(images))return;
  this.setData({filterBusy:true,filterError:''});
  try{
   let origin={latitude:null,longitude:null};
   if(radiusKm){
    if(!filters.canLocate(this.data.type))throw Error('距离筛选仅支持商家与可预约服务。');
    origin=await new Promise((resolve,reject)=>wx.getLocation({type:'gcj02',success:p=>resolve({latitude:p.latitude,longitude:p.longitude}),fail:()=>reject(Error('未取得定位，可选择不限距离继续搜索。'))}));
    if(!Number.isFinite(origin.latitude)||!Number.isFinite(origin.longitude)||Math.abs(origin.latitude)>90||Math.abs(origin.longitude)>180)throw Error('定位结果无效，请重试或选择不限距离。');
   }
   if(this.unloaded||attempt!==this.filterAttempt||!this.data.advancedOpen||scope!==context())return;
   this.setData({days,radiusKm,images,publisher:this.fromMap?this.data.draftPublisher:'all',...origin,advancedOpen:false,filterBusy:false,filterNotice:''});
   return this.search(false);
  }catch(e){if(!this.unloaded&&attempt===this.filterAttempt&&scope===context())this.setData({filterBusy:false,filterError:e.message});}
 },
 preventScroll(){},
 retryLanding(){return this.initialized?this.loadDiscovery():this.initialize();},
 search(record=true){this.sortAttempt=(this.sortAttempt||0)+1;const explicit=record!==false,q=this.data.q.trim().slice(0,80);this.filterBrowse=true;this.failedPage=0;this.pendingSearch=false;this.version=(this.version||0)+1;this.landingVersion=(this.landingVersion||0)+1;this.closeAdvanced();const filterSummary=[this.data.categoryName,this.data.area!=='全部地区'?this.data.area:'',this.data.days?'近'+this.data.days+'天':'',this.data.images==='with'?'仅有图片':'',this.fromMap&&this.data.publisher==='verified'?'已核验主体':'',this.data.radiusKm?this.data.radiusKm+'km以内（实际定位）':''].filter(Boolean).join(' · ');this.setData({q,submittedQ:q,queryDirty:false,filterSummary,searched:true,items:[],page:0,hasMore:false,limitReached:false,error:'',landingLoading:false});this.resetScroll();if(explicit&&history.safe(q)){const recent=history.add(this.data.recentTerms,q);try{wx.setStorageSync(this.historyKey(),recent);this.setData({recentTerms:recent,historyNotice:''});}catch{this.setData({historyNotice:'搜索记录未能保存，本次搜索不受影响。'});}}return this.fetchPage(1,this.version,explicit);},
 async fetchPage(page,version,record=false){this.setData({loading:true,error:''});const scope=context(),cityCode=this.data.cityCode,q=this.data.submittedQ;try{if(this.fromMap&&(!this.mapBounds||this.initialScope&&this.initialScope.cityCode!==cityCode))throw Error('地图范围已变化，请返回地图更新城市或视野后重试');const r=await api.request('GET',(this.fromMap&&this.mapBounds?browse.mapUrl({...this.data,q,bounds:this.mapBounds},page):feedUrl({...this.data,q,page,...(this.fromDiscover?{type:'all',channel:this.data.type==='all'?'':this.data.type}:{})})));if(this.unloaded||version!==this.version||scope!==context())return;const rows=(r.items||[]).map(present.item);this.setData({queryDirty:false,items:[...new Map([...(page===1?[]:this.data.items),...rows].map(x=>[x.id,x])).values()],page,hasMore:!!r.pagination?.hasMore&&page<(this.fromMap?200:MAX_PAGE),limitReached:!!r.pagination?.hasMore&&page>=(this.fromMap?200:MAX_PAGE),loading:false});if(this.fromMap&&page===1)this.getOpenerEventChannel?.().emit('mapSearchApplied',{cityCode,districtCode:this.data.districtCode,q,type:this.data.type,categoryId:this.data.categoryId,days:this.data.days,images:this.data.images,publisher:this.data.publisher,sort:this.data.sort});if(this.fromDiscover&&page===1)this.getOpenerEventChannel?.().emit('browseSearchApplied',{...browse.common({...this.data,q}),radiusKm:this.data.radiusKm,...(browse.origin(this.data)||{})});if(record&&q&&cityCode)api.request('POST','/api/v1/search/events',{q,cityCode}).catch(()=>{});}catch(e){if(!this.unloaded&&version===this.version&&scope===context()){this.failedPage=page;this.setData({error:e.message,loading:false});}}},
 more(){if(!this.data.searched||this.data.loading||this.data.error||!this.data.hasMore||this.pendingSearch||this.data.page>=(this.fromMap?200:MAX_PAGE))return;return this.fetchPage(this.data.page+1,this.version);},retry(){if(this.data.loading)return;if(!this.initialized)return this.initialize();return this.fetchPage(this.failedPage||1,this.version);},
 clear(){this.setData({...browse.reset({...this.data,q:this.data.q}),categoryName:'',area:'全部地区',areaIndex:0,filterNotice:''});this.syncSorts();return this.search(false);},
 removeCondition(e){this.setData(browse.remove(this.data,e.detail.key));return this.search(false);},
 browseAll(){if(this.fromMap)return;nav.discover('all','',{cityCode:this.data.cityCode,districtCode:''});},
 open(e){nav.detail(e.detail.id);}
});
