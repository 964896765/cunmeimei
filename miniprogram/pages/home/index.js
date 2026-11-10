const regionPref=require('../../utils/region'),catalog=require('../../utils/catalog'),nav=require('../../utils/navigation'),api=require('../../utils/api');
const shortcuts=require('../../utils/shortcuts');
Page({data:{region:'全部地区',areas:[],quickItems:[],quickPages:[],quickPage:0,loading:true,error:'',news:[],guides:[{id:'nearby',label:'城市生活 · 浏览指引',title:'身边的需要，在这里相遇',subtitle:'按地区浏览真实发布的信息',action:'去发现',type:'all'},{id:'service',label:'城市生活 · 服务指引',title:'先了解服务，再选择时间',subtitle:'查看服务说明，提交预约申请',action:'了解服务',type:'service'},{id:'share',label:'平台使用指引',title:'让有用的信息被看见',subtitle:'免费发布，审核通过后公开展示',action:'去发布',target:'publish'}]},
 onShow(){this.visible=true;require('../../utils/theme').apply(this);const list=shortcuts.items(shortcuts.load()),pages=shortcuts.pages(list);this.setData({quickItems:list,quickPages:pages,quickPage:Math.min(this.data.quickPage,pages.length-1),region:require('../../utils/geo-context').current().label});return this.load();},
 changeQuickPage(e){if(Number.isInteger(e.detail.current)&&e.detail.current>=0&&e.detail.current<this.data.quickPages.length)this.setData({quickPage:e.detail.current});},
 onPullDownRefresh(){return this.load().finally(()=>wx.stopPullDownRefresh());},onHide(){this.visible=false;this.version=(this.version||0)+1;clearTimeout(this.refreshTimer);},onUnload(){this.onHide();},
 context(){return JSON.stringify([require('../../utils/geo-context').current().cityCode,wx.getStorageSync('city_life_user_id'),!!wx.getStorageSync('city_life_acceptance_mode')]);},
 async load(){
  const version=this.version=(this.version||0)+1,context=this.context(),city=require('../../utils/geo-context').current();clearTimeout(this.refreshTimer);
  this.setData({loading:true,error:'',banners:[],news:[],bannerIndex:0});
  const results=await Promise.allSettled([api.request('GET','/api/v1/config'),api.request('GET','/api/v1/home?cityCode='+encodeURIComponent(city.cityCode||''))]);
  if(version!==this.version||context!==this.context())return;
  const home=results[1].status==='fulfilled'?results[1].value:{},valid=item=>item&&item.id&&Date.parse(item.endsAt)>Date.now();
  const banners=(home.banners||[]).filter(valid).map(x=>({...x,cover:x.imageId?require('../../utils/presentation').media('/api/v1/media/'+x.imageId):''}));
  const news=(home.news||[]).filter(valid).map(x=>({...x,dateText:Number.isFinite(Date.parse(x.createdAt||x.startsAt))?new Date(Date.parse(x.createdAt||x.startsAt)+8*3600e3).toISOString().slice(0,10):''}));
  this.setData({areas:results[0].status==='fulfilled'?results[0].value.areas||[]:[],region:city.label,banners,news,loading:false,error:[...new Set(results.filter(r=>r.status==='rejected').map(r=>r.reason.message||'首页内容暂不可用'))].join('；')});
  if(this.visible&&typeof setTimeout==='function'){const next=Math.min(60000,...[...banners,...news].map(x=>Math.max(1000,Date.parse(x.endsAt)-Date.now())));this.refreshTimer=setTimeout(()=>{if(this.visible)this.load();},next);}
 },
 changeBanner(e){this.setData({bannerIndex:e.detail.current});},
 bannerImageError(e){const id=e.currentTarget.dataset.id;this.setData({banners:this.data.banners.map(x=>x.id===id?{...x,cover:''}:x)});},
 async openBanner(e){const id=e.currentTarget.dataset.id,context=this.context();if(this.opening)return;this.opening=true;try{const {item}=await api.request('GET','/api/v1/home/content/'+encodeURIComponent(id));if(context!==this.context()||!this.visible)return;if(item.targetId)nav.detail(item.targetId);}catch(error){api.showError(error);this.load();}finally{this.opening=false;}},
 openNews(e){wx.navigateTo({url:'/pages/information/index?id='+encodeURIComponent(e.currentTarget.dataset.id)});},
 moreNews(){wx.navigateTo({url:'/pages/information/index?cityCode='+encodeURIComponent(require('../../utils/geo-context').current().cityCode||'')});},
 showArea(){wx.navigateTo({url:'/pages/regions/index'});},goSearch(){nav.search();},goDiscover(){nav.discover('all');},
 openGuide(e){const guide=this.data.guides.find(x=>x.id===e.currentTarget.dataset.id);if(!guide)return;if(guide.target==='publish')wx.switchTab({url:'/pages/publish/index'});else nav.discover(guide.type);},
 editShortcuts(){nav.categories(true);},
 openQuick(e){const id=e.currentTarget.dataset.id;if(id==='more'){nav.categories();return;}if(!this.data.quickItems.some(x=>x.id===id&&!x.empty))return;nav.discoverIndustry(id);},
});
