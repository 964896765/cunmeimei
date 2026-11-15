const pageLayout=require('../../utils/page-layout');
const nav = require('../../utils/navigation');
const api = require('../../utils/api');
const shortcuts = require('../../utils/shortcuts');
const cache = require('../../utils/public-cache');
const present = require('../../utils/presentation');
const {feedUrl} = require('../../utils/feed-query');

Page({
 onReady(){pageLayout.measure(this);},
 onResize(){pageLayout.measure(this);},
 headerMeasured(e){pageLayout.header(this,e);},
 onPageScroll(e){pageLayout.scroll(this,e);},

  data: {
    layoutStyle:'',pageCompact:false,region:'选择城市', areas:[], quickItems:[], quickPages:[], quickPage:0,
    loading:true, error:'', news:[], banners:[], bannerIndex:0, feed:[], featured:[],
    feedTab:'recommended', guidePhotoFailed:false,
    feedTabs:[{id:'recommended',label:'精选推荐'},{id:'latest',label:'最新发布'},{id:'popular',label:'热门信息'},{id:'merchant',label:'本地商家'}],
    guides:[
      {id:'nearby', title:'发现身边 · 本地生活', summary:'招聘求职 · 房屋租售 · 二手闲置 · 生活服务', action:'去发现', icon:'type-community'},
      {id:'service', title:'先了解服务，再选择时间', summary:'查看服务说明，提交预约申请', action:'了解服务', icon:'type-service'},
      {id:'share', title:'让有用的信息被看见', summary:'免费发布，审核通过后公开展示', action:'去发布', icon:'type-used'}
    ]
  },
  onShow() {
    this.visible = true;pageLayout.show(this,{tabBar:true,threshold:8,dock:'.feed-tabs'});
    require('../../utils/theme').apply(this);
    const list = shortcuts.items(shortcuts.load().slice(0,shortcuts.max));
    this.setData({quickItems:list, quickPages:shortcuts.pages(list), quickPage:0, region:require('../../utils/geo-context').current().label});
    return this.load();
  },
  changeQuickPage(event) {
    const current = Number(event.detail.current);
    if (Number.isInteger(current) && current >= 0 && current < this.data.quickPages.length) this.setData({quickPage:current});
  },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  onHide() {
    pageLayout.hide(this);this.visible = false;
    this.version = (this.version || 0) + 1;
    clearTimeout(this.refreshTimer);
  },
  onUnload() { this.onHide(); },
  context() {
    return JSON.stringify([require('../../utils/geo-context').current().cityCode, wx.getStorageSync('city_life_user_id'), api.hasSession(), !!wx.getStorageSync('city_life_acceptance_mode'), this.data.feedTab]);
  },
  async load() {
    const version = this.version = (this.version || 0) + 1;
    const context = this.context();
    const city = require('../../utils/geo-context').current();
    clearTimeout(this.refreshTimer);
    const stored = cache.read('home:' + context, wx) || {};
    const savedFeed = cache.read('home-feed:' + context, wx);
    const sameContext = context === this.contentContext;
    this.contentContext = context;
    const valid = item => item && item.id && Date.parse(item.endsAt) > Date.now() && (!item.startsAt || Date.parse(item.startsAt) <= Date.now());
    const bannersFrom = items => (Array.isArray(items) ? items : []).filter(valid).map(item => ({...item, cover:item.imageId ? present.media('/api/v1/media/' + item.imageId) : ''}));
    const newsFrom = items => (Array.isArray(items) ? items : []).filter(valid).map(item => ({...item, dateText:Number.isFinite(Date.parse(item.createdAt || item.startsAt)) ? new Date(Date.parse(item.createdAt || item.startsAt) + 8*3600e3).toISOString().slice(0,10) : ''}));
    const cachedHome = sameContext ? this.data : stored;
    this.setData({
      loading:true, error:'', cached:false, bannerIndex:0,
      banners:bannersFrom(cachedHome.banners), news:newsFrom(cachedHome.news),
      ...(!sameContext ? {feed:(Array.isArray(savedFeed?.items) ? savedFeed.items : []).map(item => ({...present.item(item),isSaved:false,favoriteKnown:!api.hasSession()})), featured:[]} : {})
    });
    const results = await Promise.allSettled([
      api.request('GET','/api/v1/config'),
      api.request('GET','/api/v1/home?cityCode=' + encodeURIComponent(city.cityCode || '')),
      api.request('GET',feedUrl({cityCode:city.cityCode || '', sort:this.data.feedTab==='merchant'?'recommended':this.data.feedTab, channel:this.data.feedTab==='merchant'?'merchant':'', pageSize:6}))
    ]);
    if (version !== this.version || context !== this.context()) return;
    const home = results[1].status === 'fulfilled' ? results[1].value : {banners:this.data.banners, news:this.data.news};
    const banners = bannersFrom(home.banners);
    const news = newsFrom(home.news);
    const feedResponse = results[2];
    const feed = (feedResponse.status === 'fulfilled' ? (feedResponse.value.items || []).map(item => {
      const previous = sameContext && this.data.featured.find(record => record.id === item.id);
      return {...present.item(item), isSaved:previous?.isSaved || false, favoriteKnown:previous?.favoriteKnown ?? !api.hasSession()};
    }) : this.data.feed).filter(item => !item.expiresAt || Date.parse(item.expiresAt) > Date.now());
    if (results[1].status === 'fulfilled') cache.write('home:' + context, {banners:home.banners || [], news:home.news || []}, wx);
    if (feedResponse.status === 'fulfilled') cache.write('home-feed:' + context, {items:feedResponse.value.items || []}, wx);
    this.setData({
      areas:results[0].status === 'fulfilled' ? results[0].value.areas || [] : [],
      region:city.label, banners, news, feed, featured:feed, loading:false,
      cached:results.some(result => result.status === 'rejected') && !!(banners.length || news.length || feed.length),
      error:[...new Set(results.filter(result => result.status === 'rejected').map(result => result.reason.message || '首页暂未更新'))].join('；')
    });
    if (api.hasSession()) this.hydrateSaved(feed, version, context);
    if (this.visible && typeof setTimeout === 'function') {
      const next = Math.min(60000, ...[...banners,...news].map(item => Math.max(1000,Date.parse(item.endsAt) - Date.now())));
      this.refreshTimer = setTimeout(() => { if (this.visible) this.load(); },next);
    }
  },
  changeBanner(event) { this.setData({bannerIndex:event.detail.current}); },
  guideImageError() { this.setData({guidePhotoFailed:true}); },
  changeFeed(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.feedTabs.some(item => item.id === id) || id === this.data.feedTab) return;
    this.setData({feedTab:id});
    return this.load();
  },
  openMerchant() { wx.navigateTo({url:'/pages/merchant/index'}); },
  showPhotoCredit() {
    wx.showModal({title:'城市摄影来源',content:'《Xiangyang skyline 02》\n作者 Fxqf，2021年5月5日\n授权 CC BY-SA 4.0\nhttps://commons.wikimedia.org/wiki/File:Xiangyang_skyline_02.jpg\nhttps://creativecommons.org/licenses/by-sa/4.0/\n图片以 aspectFill 方式显示。',showCancel:false,confirmText:'知道了'});
  },
  bannerImageError(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({banners:this.data.banners.map(item => item.id === id ? {...item, cover:''} : item)});
  },
  async openBanner(event) {
    const context = this.context();
    if (this.opening) return;
    this.opening = true;
    try {
      const {item} = await api.request('GET','/api/v1/home/content/' + encodeURIComponent(event.currentTarget.dataset.id));
      if (context !== this.context() || !this.visible) return;
      if (item.targetId) nav.detail(item.targetId);
    } catch (error) {
      api.showError(error);
      this.load();
    } finally { this.opening = false; }
  },
  openFeatured(event) { nav.detail(event.detail?.id || event.currentTarget.dataset.id); },
  async hydrateSaved(items, version, context, includePending = false) {
    const ids = items.map(item => item.id);
    if (!ids.length) return true;
    this.savedVersions = this.savedVersions || {};
    const tickets = Object.fromEntries(ids.map(id => [id, this.savedVersions[id] || 0]));
    try {
      const result = await api.request('GET', '/api/v1/me/saved-state?ids=' + ids.map(encodeURIComponent).join(','), null, true);
      if (!this.visible || version !== this.version || context !== this.context() || !Array.isArray(result.savedIds)) return false;
      const saved = new Set(result.savedIds);
      const featured = this.data.featured.map(item => {
        if (!ids.includes(item.id) || (!includePending && this.favoritePending?.has(item.id)) || (this.savedVersions[item.id] || 0) !== tickets[item.id]) return item;
        return {...item, isSaved:saved.has(item.id), favoriteKnown:true};
      });
      this.setData({featured, feed:featured});
      return true;
    } catch { return false; }
  },
  async toggleSaved(event) {
    const id = event.detail.id;
    if (!this.visible || !this.data.featured.some(item => item.id === id) || this.favoritePending?.has(id)) return;
    const beforeLogin = this.context();
    const hadSession = api.hasSession();
    this.favoritePending = this.favoritePending || new Set();
    this.favoritePending.add(id);
    let context = beforeLogin;
    let mutating = false;
    try {
      if (!hadSession) await api.login();
      if (!this.visible || (hadSession && beforeLogin !== this.context())) return;
      context = this.context();
      // Reload public content in the newly authenticated account scope.
      if (!hadSession) await this.load();
      if (context !== this.context()) return;
      let item = this.data.featured.find(record => record.id === id);
      if (!item) return;
      if (item.favoriteKnown === false) {
        const hydrated = await this.hydrateSaved([item], this.version, context, true);
        if (!hydrated) throw Error('收藏状态暂未核对，请重试。');
        item = this.data.featured.find(record => record.id === id);
      }
      if (!this.visible || context !== this.context() || !item) return;
      this.savedVersions = this.savedVersions || {};
      this.savedVersions[id] = (this.savedVersions[id] || 0) + 1;
      mutating = true;
      const result = await api.request(item.isSaved ? 'DELETE' : 'PUT', '/api/v1/items/' + encodeURIComponent(id) + '/saved', {}, true);
      if (!this.visible || context !== this.context()) return;
      const featured = this.data.featured.map(record => record.id === id ? {...record,isSaved:result.saved,favoriteKnown:true} : record);
      this.setData({featured, feed:featured});
      wx.showToast({title:result.saved ? '已收藏' : '已取消收藏',icon:'none'});
    } catch (error) {
      if (!this.visible || context !== this.context()) return;
      if (mutating) {
        const featured = this.data.featured.map(item => item.id === id ? {...item,favoriteKnown:false} : item);
        this.setData({featured,feed:featured});
      }
      api.showError(error);
    } finally {
      if (mutating) this.savedVersions[id]++;
      this.favoritePending.delete(id);
    }
  },
  openNews(event) { wx.navigateTo({url:'/pages/information/index?id=' + encodeURIComponent(event.currentTarget.dataset.id)}); },
  moreNews() { wx.navigateTo({url:'/pages/information/index?cityCode=' + encodeURIComponent(require('../../utils/geo-context').current().cityCode || '')}); },
  showArea() { wx.navigateTo({url:'/pages/regions/index'}); },
  goSearch() { nav.search(); },
  goDiscover() { nav.discover('all'); },
  openGuide(event) {
    const id = event.currentTarget.dataset.id;
    if (!['nearby','service','share'].includes(id)) return;
    if (id === 'share') wx.switchTab({url:'/pages/publish/index'});
    else nav.discover(id === 'service' ? 'service' : 'all');
  },
  editShortcuts() { nav.categories(true); },
  openQuick(event) {
    const id = event.currentTarget.dataset.id;
    if (id === 'more') { nav.categories(); return; }
    if (this.data.quickItems.some(item => item.id === id && !item.empty)) nav.discoverIndustry(id);
  }
});
