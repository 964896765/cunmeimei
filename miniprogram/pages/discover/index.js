const regionPref = require('../../utils/region');
const api = require('../../utils/api');
const nav = require('../../utils/navigation');
const catalog = require('../../utils/catalog');
const present = require('../../utils/presentation');
const registry=require('../../utils/classification');
const {feedUrl,MAX_PAGE}=require('../../utils/feed-query');
const geoContext=require('../../utils/geo-context');
const browse=require('../../utils/browse-query');
const discoverySorts=require('../../utils/discovery-sorts');
function currentContext(){const b=geoContext.current?.()||{};return JSON.stringify([b.cityCode,b.districtCode,...['city_life_user_id','city_life_v2_auth_token','city_life_acceptance_mode'].map(key=>wx.getStorageSync(key)||'')]);}

Page({
 data: {
  dateOptions:require('../../utils/search-filters').dateOptions,dateLabels:require('../../utils/search-filters').dateOptions.map(x=>x.label),dateIndex:0,limitReached:false,days:0,images:'all',publicOnly:false,
  headerHeight:88,channels:registry.channels||[],immersed:false,unavailable:'',categoryId:'',categoryName:'',types: catalog.groupOptions, type: 'all', areas: ['全部地区'], area: '全部地区', q: '',
  filtered: [], count: 0, hasMore: false, loading: false, error: '', sortIndex: 0,
  sortNames: ['最新发布', '价格从低到高', '价格从高到低'],sortCode:'latest',sortLabel:'最新发布',sortOpen:false,sortBusy:false,sortError:'',sortOptions:discoverySorts.options('all'), online: api.online()
 },
 onShow() {
  require('../../utils/theme').apply(this);
  this.active=true;this.restoreNavigation();
  return this.initialize();
 },
 onHide() {
  this.closeSort();
  this.active=false;this.restoreNavigation();
  clearTimeout(this.searchTimer);
  this.searchTimer = null;
 },
 onUnload() {
  this.sortAttempt=(this.sortAttempt||0)+1;this.sortOrigin=null;
  this.active=false;this.restoreNavigation();
  this.unloaded = true;
  this.initVersion = (this.initVersion || 0) + 1;
  this.reqVersion = (this.reqVersion || 0) + 1;
  clearTimeout(this.searchTimer);
 },
 onPullDownRefresh() {
  this.configAt = 0;
  return this.initialize(true).finally(() => wx.stopPullDownRefresh());
 },
 onReachBottom() { return this.loadMore(); },
 async initialize(force = false) {
  const version = this.initVersion = (this.initVersion || 0) + 1;
  const entry=getApp().globalData.browseEntry;delete getApp().globalData.browseEntry;
  if(entry){const pref=geoContext.current(),value=browse.common({...entry,...(!entry.hasRegion?pref:{})});this.sortOrigin=null;this.searchPending=true;this.setData({...value,radiusKm:0,filterNotice:'',sortCode:value.sort,sortLabel:discoverySorts.labels[value.sort],sortIndex:0,dateIndex:this.data.dateOptions.findIndex(x=>x.value===value.days)});}
  const target = getApp().globalData.exploreTarget || this.pendingTarget;
  const categoryTarget=getApp().globalData.exploreCategoryTarget||this.pendingCategoryTarget;
  this.pendingCategoryTarget=categoryTarget;delete getApp().globalData.exploreCategoryTarget;
  this.pendingTarget = target;
  getApp().globalData.exploreTarget = '';
  // Account/test-mode changes must never reuse another context's rendered feed.
  const browsing=geoContext.current(),browseKey=browsing.cityCode+':'+browsing.districtCode;if(browseKey!==this.browseKey){this.browseKey=browseKey;this.setData({cityCode:browsing.cityCode,districtCode:browsing.districtCode,cityLabel:require('../../utils/geography').findCity(browsing.cityCode)?.name||browsing.label});}
  const context = currentContext();
  const changedContext = context !== this.feedContext;
  if (changedContext) {
   this.feedContext = context;
   this.hasLoaded = false;
   this.reqVersion = (this.reqVersion || 0) + 1;
   this.setData({filtered: [], count: 0, page: 0, hasMore: false,limitReached:false});
  }
  try {
   if (!this.configAt || Date.now() - this.configAt > 60000) {
    if (!this.hasLoaded) this.setData({loading: true, error: ''});
    const c = await api.request('GET', '/api/v1/config');
    if (this.unloaded || version !== this.initVersion||context!==currentContext()) return;
    this.configAt = Date.now();
    this.industryAvailable=!!c.features?.industryWorkflows;
    this.setData({areas: ['全部地区', ...(c.areas || [])]});
   }
   if (this.unloaded || version !== this.initVersion||context!==currentContext()) return;
   const area = this.data.cityCode?(browse.districts(this.data.cityCode).find(d=>d.code===this.data.districtCode)?.name||'全市范围'):regionPref.selected(this.data.areas.filter(x => x !== '全部地区'));
   const type = target || this.data.type;
   const category=registry.find(categoryTarget?categoryTarget.id:target?'':this.data.categoryId),categoryId=category?.id||'';
   const changed = area !== this.data.area || type !== this.data.type || categoryId!==this.data.categoryId;
   this.setData({area,type,categoryId,categoryName:category?.name||'',categoryIconId:browse.category(categoryId).industryId});this.syncSortOptions();
   this.pendingTarget = '';
   this.pendingCategoryTarget=null;
   // A normal back/tab transition preserves loaded pages and native scroll position.
   if (force || changed || changedContext || !this.hasLoaded || this.searchPending) return this.filter();
  } catch (e) {
   if (!this.unloaded && version === this.initVersion&&context===currentContext()) {
    this.failedStage = 'config';
    this.setData({error: e.message, loading: false});
   }
  }
 },
 clearFilters() {
  this.setData({...browse.reset({...this.data,sort:this.data.sortCode}),area:'全部地区',dateIndex:0,sortCode:'recommended',sortLabel:discoverySorts.labels.recommended,sortIndex:0});this.sortOrigin=null;this.syncSortOptions();return this.filter();
 },
 removeCondition(e){this.setData(browse.remove({...this.data,sort:this.data.sortCode},e.detail.key));return this.filter();},
 confirmSearch() { return this.filter(); },
 browseAll(){nav.discover('all','',{cityCode:this.data.cityCode,districtCode:''});},
 clearIndustry(){this.setData({categoryId:'',categoryName:''});return this.filter();},
 inputSearch(e) {
  this.setData({q: e.detail.value});
  clearTimeout(this.searchTimer);
  this.reqVersion = (this.reqVersion || 0) + 1;
  this.searchPending = true;
  this.searchTimer = setTimeout(() => this.filter(), 300);
 },
 changeType(e) { const type=e.detail?.type||e.currentTarget?.dataset?.type;if(!registry.channels.some(x=>x.id===type))return;this.closeSort();this.restoreNavigation();const previousSort=this.data.sortCode,resetDistance=!['all','merchant','service'].includes(type)&&(this.data.radiusKm>0||this.data.sortCode==='distance');if(resetDistance)this.sortOrigin=null;this.setData({type,filterNotice:resetDistance?'该频道不支持公开位置筛选，已清除距离条件。':'',...(resetDistance?{radiusKm:0}:{})});this.syncSortOptions();if(previousSort!==this.data.sortCode&&!resetDistance)this.setData({filterNotice:'该频道不适用原排序，已切换为最新发布。'});return this.filter(); },
 chooseCity(){wx.navigateTo({url:'/pages/regions/index?returnTo=previous'});},
 headerMeasured(e){this.setData({headerHeight:e.detail.height});},
 changeArea(e) {
  const area = e.currentTarget.dataset.area;
  regionPref.save(area, this.data.areas.filter(x => x !== '全部地区'));
  this.setData({area,...(this.data.cityCode?{districtCode:browse.districts(this.data.cityCode).find(d=>d.name===area)?.code||''}:{})});
  return this.filter();
 },
 syncSortOptions(){const options=discoverySorts.options(this.data.type);const current=options.find(x=>x.code===this.data.sortCode);if(!current?.enabled)this.setData({sortCode:'latest',sortLabel:'最新发布',sortIndex:0});this.setData({sortOptions:options});},
 openSort(){this.restoreNavigation();this.syncSortOptions();this.setData({sortOpen:true,sortError:''});require('../../utils/tab-bar').visibility(this,true);this.sortBarHidden=true;},
 closeSort(){this.sortAttempt=(this.sortAttempt||0)+1;this.setData({sortOpen:false,sortBusy:false,sortError:''});if(this.sortBarHidden){require('../../utils/tab-bar').visibility(this,!!this.data.immersed);this.sortBarHidden=false;}},
 preventScroll(){},
 chooseSort(e){const index=Number(e.detail.value),code=['latest','price_low','price_high'][index];if(!code)return;this.setData({sortIndex:index,sortCode:code,sortLabel:discoverySorts.labels[code]});return this.filter();},
 async selectSort(e){
  const code=e.currentTarget.dataset.code,option=this.data.sortOptions.find(x=>x.code===code);if(!option||!option.enabled||this.data.sortBusy)return;
  if(code==='distance'){
   const attempt=this.sortAttempt=(this.sortAttempt||0)+1,scope=currentContext();this.setData({sortBusy:true,sortError:''});
   try{const origin=await new Promise((resolve,reject)=>wx.getLocation({type:'gcj02',success:resolve,fail:reject}));if(this.unloaded||!this.active||attempt!==this.sortAttempt||scope!==currentContext())return;if(!Number.isFinite(origin.latitude)||!Number.isFinite(origin.longitude)||Math.abs(origin.latitude)>90||Math.abs(origin.longitude)>180)throw Error('INVALID_LOCATION');this.sortOrigin={latitude:origin.latitude,longitude:origin.longitude};}
   catch(error){if(!this.unloaded&&attempt===this.sortAttempt&&scope===currentContext())this.setData({sortBusy:false,sortError:error?.message==='INVALID_LOCATION'?'定位结果无效，请重试或选择其他排序。':'未取得定位，可选择其他排序；不会更改浏览城市。'});return;}
  }
  this.setData({sortCode:code,sortLabel:option.name,sortIndex:Math.max(0,['latest','price_low','price_high'].indexOf(code))});this.closeSort();return this.filter();
 },
 async filter() {
  clearTimeout(this.searchTimer);
  this.searchTimer = null;
  this.searchPending = false;
  const version = this.reqVersion = (this.reqVersion || 0) + 1;
  const {type, area, q, sortIndex,sortCode} = this.data;
  const channel=(registry.channels||[]).find(x=>x.id===type);
  if(channel?.available===false&&!this.industryAvailable){this.hasLoaded=true;this.setData({filtered:[],count:0,page:1,loading:false,hasMore:false,limitReached:false,error:'',unavailable:'此频道尚未接通审核与发布能力，当前没有可展示内容。'});return;}
  this.setData({unavailable:''});
  const query = JSON.stringify([type, area, q.trim(), sortIndex,sortCode,sortCode==='distance'?this.sortOrigin:null,this.data.cityCode,this.data.districtCode,this.data.categoryId,this.data.days,this.data.images,this.data.radiusKm||0]);
  this.failedStage = '';
  this.failedPage = 0;
  const update = {loading: true, error: ''};
  // Keep existing results on a same-query refresh, including when refresh fails.
  if (query !== this.loadedQuery) Object.assign(update, {filtered: [], count: 0, hasMore: false,limitReached:false, page: 0});
  this.setData(update);
  await this.fetchPage(1, version, query);
 },
 async fetchPage(page, version, query = this.loadedQuery) {
  const {type, area, q, sortIndex,sortCode} = this.data;
  const scope=currentContext(),cacheKey='feed:'+scope+'|'+query;
  if(page===1&&!this.data.filtered.length){const saved=require('../../utils/public-cache').read(cacheKey,wx);if(Array.isArray(saved?.items)){const available=saved.items.filter(x=>!x.expiresAt||Date.parse(x.expiresAt)>Date.now());this.setData({filtered:available.map(x=>({...present.item(x),favoriteKnown:!api.hasSession()})),count:available.length,page:1,cached:true});}}
  try {
   const r = await api.request('GET', feedUrl({type,area,q,categoryId:this.data.categoryId,sortIndex,sort:sortCode,page,days:this.data.days,images:this.data.images,radiusKm:this.data.radiusKm||0,cityCode:this.data.cityCode,districtCode:this.data.districtCode,...((sortCode==='distance'||this.data.radiusKm>0)?this.sortOrigin:{})}));
   if (this.unloaded || version !== this.reqVersion||scope!==currentContext()) return;
   const items = (r.items || []).map(x=>({...present.item(x),favoriteKnown:!api.hasSession()}));
   const merged = page === 1 ? items : [...this.data.filtered, ...items];
   const unique = [...new Map(merged.map(x => [x.id, x])).values()];
   this.hasLoaded = true;
   this.loadedQuery = query;
   this.failedStage = '';
   this.failedPage = 0;
   if(page===1)require('../../utils/public-cache').write(cacheKey,r,wx);
   this.setData({cached:false,filtered: unique, count: unique.length, hasMore: !!r.pagination?.hasMore&&page<MAX_PAGE,limitReached:!!r.pagination?.hasMore&&page>=MAX_PAGE, page, loading: false, error: ''});
   if(api.hasSession())this.hydrateSaved(items,version,scope);
  } catch (e) {
   if (!this.unloaded && version === this.reqVersion&&scope===currentContext()) {
    this.failedStage = 'feed';
    this.failedPage = page;
    this.setData({loading: false, error: e.message});
   }
  }
 },
 loadMore() {
  if (this.data.loading || this.data.error || this.searchPending || !this.data.hasMore||this.data.page>=MAX_PAGE) return;
  this.setData({loading: true});
  return this.fetchPage((this.data.page || 0) + 1, this.reqVersion);
 },
 retry() {
  if(this.data.loading)return;
  if (this.failedStage === 'config') return this.initialize(true);
  if (this.failedPage > 1) {
   this.setData({loading: true, error: ''});
   return this.fetchPage(this.failedPage, this.reqVersion);
  }
  return this.filter();
 },
 wholeCity() {
  regionPref.save('全部地区', this.data.areas);
  this.setData({area:'全部地区',districtCode:''});
  return this.filter();
 },
 goDetail(e) { nav.detail(e.detail.id || e.currentTarget.dataset.id); },
 categoryChanged(e){const category=browse.category(e.detail.categoryId);this.setData({categoryId:category.id,categoryName:category.name,categoryIconId:category.industryId});return this.filter();},
 districtChanged(e){const d=browse.districts(this.data.cityCode).find(x=>x.code===e.detail.districtCode);if(!d)return;this.setData({districtCode:d.code,area:d.name});return this.filter();},
 selectTime(e){const index=Number(e.detail.value),days=this.data.dateOptions[index]?.value;if(days===undefined)return;this.setData({days,dateIndex:index});return this.filter();},
 toggleImages(){this.setData({images:this.data.images==='with'?'all':'with'});return this.filter();},
 openSearch(){nav.search(this.data.type,this.data.q,this.data.categoryId,{cityCode:this.data.cityCode,districtCode:this.data.districtCode,days:this.data.days,images:this.data.images,sort:this.data.sortCode,radiusKm:this.data.radiusKm||0,...((this.data.sortCode==='distance'||this.data.radiusKm>0)?this.sortOrigin:{}),fromDiscover:true,events:{browseSearchApplied:value=>{if(this.unloaded||browse.signature({...this.data,sort:this.data.sortCode,...(this.sortOrigin||{})})===browse.signature(value))return;const c=browse.common(value);if(!c.cityCode&&this.data.cityCode)return;this.sortOrigin=browse.origin(value);this.setData({radiusKm:value.radiusKm||0,...c,sortCode:c.sort,sortLabel:discoverySorts.labels[c.sort],sortIndex:0,categoryName:browse.category(c.categoryId).name,categoryIconId:browse.category(c.categoryId).industryId,dateIndex:this.data.dateOptions.findIndex(x=>x.value===c.days)});this.searchPending=true;}}});},
 openMap(){this.restoreNavigation();const query={type:this.data.type,q:this.data.q,categoryId:this.data.categoryId,cityCode:this.data.cityCode,districtCode:this.data.districtCode,days:this.data.days,images:this.data.images,sourceSort:this.data.sortCode,sourceRadius:this.data.radiusKm||0,sort:['latest','recommended'].includes(this.data.sortCode)?this.data.sortCode:'recommended'};wx.navigateTo({url:'/pages/map/index?'+Object.entries(query).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')});},
 restoreNavigation(){this.scrollAnchor=null;if(this.data.immersed)this.setData({immersed:false});if(this.barHidden){require('../../utils/tab-bar').visibility(this,false);this.barHidden=false;}},
 onPageScroll(e){if(!this.active||this.data.sortOpen)return;const y=Math.max(0,e.scrollTop||0);if(y<20){this.restoreNavigation();this.scrollAnchor=y;return;}if(this.scrollAnchor===null||this.scrollAnchor===undefined){this.scrollAnchor=y;return;}const distance=y-this.scrollAnchor;if(Math.abs(distance)<24)return;this.scrollAnchor=y;const hidden=distance>0;if(hidden===this.data.immersed)return;this.setData({immersed:hidden});this.barHidden=hidden;require('../../utils/tab-bar').visibility(this,hidden);},
 async hydrateSaved(items,version,scope){
  const ids=items.map(x=>x.id);if(!ids.length)return true;this.savedVersions=this.savedVersions||{};const tickets=Object.fromEntries(ids.map(id=>[id,this.savedVersions[id]||0]));
  try{const result=await api.request('GET','/api/v1/me/saved-state?ids='+ids.map(encodeURIComponent).join(','),null,true);if(this.unloaded||version!==this.reqVersion||scope!==currentContext()||!Array.isArray(result.savedIds))return false;const saved=new Set(result.savedIds);this.setData({filtered:this.data.filtered.map(x=>ids.includes(x.id)&&(this.savedVersions[x.id]||0)===tickets[x.id]?{...x,isSaved:saved.has(x.id),favoriteKnown:true}:x)});return true;}catch{return false;}
 },
 async toggleSaved(e){
  const id=e.detail.id,item=this.data.filtered.find(x=>x.id===id);if(!item||this.favoritePending?.has(id))return;this.favoritePending=this.favoritePending||new Set();this.favoritePending.add(id);let owner=wx.getStorageSync('city_life_user_id'),mutating=false;
  try{if(!api.hasSession())await api.login();owner=wx.getStorageSync('city_life_user_id');if(item.favoriteKnown===false){const ok=await this.hydrateSaved([item],this.reqVersion,currentContext());if(!ok)throw Error('收藏状态暂未核对，请重试。');return;}
   mutating=true;this.savedVersions=this.savedVersions||{};this.savedVersions[id]=(this.savedVersions[id]||0)+1;
   const result=await api.request(item.isSaved?'DELETE':'PUT','/api/v1/items/'+id+'/saved',{},true);if(!this.unloaded&&owner===wx.getStorageSync('city_life_user_id'))this.setData({filtered:this.data.filtered.map(x=>x.id===id?{...x,isSaved:result.saved,favoriteKnown:true}:x)});wx.showToast({title:result.saved?'已收藏':'已取消收藏',icon:'none'});
  }catch(error){if(mutating&&!this.unloaded&&owner===wx.getStorageSync('city_life_user_id'))this.setData({filtered:this.data.filtered.map(x=>x.id===id?{...x,favoriteKnown:false}:x)});api.showError(error);}finally{if(mutating)this.savedVersions[id]=(this.savedVersions[id]||0)+1;this.favoritePending.delete(id);}
 }

});
