const nav = require('../../utils/navigation');
const api = require('../../utils/api');
const shortcuts = require('../../utils/shortcuts');
const cache = require('../../utils/public-cache');
const present = require('../../utils/presentation');
const {feedUrl} = require('../../utils/feed-query');

Page({
  data: {
    region:'选择城市', areas:[], quickItems:[], quickPages:[], quickPage:0,
    loading:true, error:'', news:[], banners:[], bannerIndex:0, feed:[], hero:null, featured:[]
  },
  onShow() {
    this.visible = true;
    require('../../utils/theme').apply(this);
    const list = shortcuts.items(shortcuts.load().slice(0,7));
    this.setData({quickItems:list, quickPages:shortcuts.pages(list), quickPage:0, region:require('../../utils/geo-context').current().label});
    return this.load();
  },
  changeQuickPage(event) {
    const current = Number(event.detail.current);
    if (Number.isInteger(current) && current >= 0 && current < this.data.quickPages.length) this.setData({quickPage:current});
  },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  onHide() {
    this.visible = false;
    this.version = (this.version || 0) + 1;
    clearTimeout(this.refreshTimer);
  },
  onUnload() { this.onHide(); },
  context() {
    return JSON.stringify([require('../../utils/geo-context').current().cityCode, wx.getStorageSync('city_life_user_id'), !!wx.getStorageSync('city_life_acceptance_mode')]);
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
    this.setData({loading:true, error:'', cached:false, bannerIndex:0, ...(!sameContext ? {banners:[], news:stored.news || [], feed:(savedFeed?.items || []).map(present.item), hero:null, featured:[]} : {})});
    const results = await Promise.allSettled([
      api.request('GET','/api/v1/config'),
      api.request('GET','/api/v1/home?cityCode=' + encodeURIComponent(city.cityCode || '')),
      api.request('GET',feedUrl({cityCode:city.cityCode || '', sort:'recommended', pageSize:6}))
    ]);
    if (version !== this.version || context !== this.context()) return;
    const home = results[1].status === 'fulfilled' ? results[1].value : {banners:[], news:this.data.news};
    const valid = item => item && item.id && Date.parse(item.endsAt) > Date.now();
    const banners = (home.banners || []).filter(valid).map(item => ({...item, cover:item.imageId ? present.media('/api/v1/media/' + item.imageId) : ''}));
    const news = (home.news || []).filter(valid).map(item => ({...item, dateText:Number.isFinite(Date.parse(item.createdAt || item.startsAt)) ? new Date(Date.parse(item.createdAt || item.startsAt) + 8*3600e3).toISOString().slice(0,10) : ''}));
    const feedResponse = results[2];
    const feed = (feedResponse.status === 'fulfilled' ? (feedResponse.value.items || []).map(present.item) : this.data.feed).filter(item => !item.expiresAt || Date.parse(item.expiresAt) > Date.now());
    const hero = banners.length ? null : feed.find(item => item.cover) || null;
    if (results[1].status === 'fulfilled') cache.write('home:' + context, {news:home.news || []}, wx);
    if (feedResponse.status === 'fulfilled') cache.write('home-feed:' + context, {items:feedResponse.value.items || []}, wx);
    this.setData({
      areas:results[0].status === 'fulfilled' ? results[0].value.areas || [] : [],
      region:city.label, banners, news, feed, hero, featured:feed.filter(item => item.id !== hero?.id), loading:false,
      cached:results.some(result => result.status === 'rejected') && !!(news.length || feed.length),
      error:[...new Set(results.filter(result => result.status === 'rejected').map(result => result.reason.message || '首页暂未更新'))].join('；')
    });
    if (this.visible && typeof setTimeout === 'function') {
      const next = Math.min(60000, ...[...banners,...news].map(item => Math.max(1000,Date.parse(item.endsAt) - Date.now())));
      this.refreshTimer = setTimeout(() => { if (this.visible) this.load(); },next);
    }
  },
  changeBanner(event) { this.setData({bannerIndex:event.detail.current}); },
  bannerImageError(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({banners:this.data.banners.map(item => item.id === id ? {...item, cover:''} : item)});
  },
  heroImageError() { this.setData({hero:null, featured:this.data.feed}); },
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
