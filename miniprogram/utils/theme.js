const api=require('./api');
const tabs=require('./tab-bar');
const {palettes,resolvePalette}=require('./palettes');
const {accentRoute}=require('./page-accent-route');
const {materialFor}=require('./design-system');
const defaults={theme:'prism',largeText:false,reduceMotion:false,notificationPreview:true,allowContacts:true,revision:0};
const key=()=> 'city_life_preferences_'+(wx.getStorageSync('city_life_user_id')||'guest');
function current(){const v=wx.getStorageSync(key());return v&&palettes[v.theme]?{...defaults,...v}:{...defaults};}
function store(v){wx.setStorageSync(key(),v);}
let nativeTheme='',nativeStyle='',nativeTimer;
function apply(page){
 const p=current(),material=materialFor(page,p),c=resolvePalette(p.theme,accentRoute(page.route));
 page.setData({displayPreferences:p,iconPalette:p.theme,themeColor:c.action,themeBorderColor:c.border,themeClass:'theme-'+p.theme+' material-'+material+(p.largeText?' large-text':'')+(p.reduceMotion?' reduce-motion':'')+(tabs.isTab?.(page.route)?' has-bottom-tabs':''),themeStyle:Object.entries(c).map(([k,v])=>'--'+k+':'+v).join(';')+';--card-title:'+(p.largeText?'38rpx':'30rpx')+';--card-meta:'+(p.largeText?'30rpx':'26rpx')});
 tabs.sync?.(page,p,c);
 // Native TabBar reconstruction during onShow can interrupt an in-flight route transition.
 clearTimeout(nativeTimer);
 nativeTimer=setTimeout(()=>{
  if(current().theme!==p.theme)return;
  const searchPage=page.route==='pages/search/index',background=c.background;
  wx.setNavigationBarColor?.({frontColor:p.theme==='dark'?'#ffffff':'#000000',backgroundColor:searchPage?background:page.route==='pages/map/index'?c.surface:c.background});
  wx.setBackgroundColor?.({backgroundColor:background});
  if(tabs.sync?.(page,p,c))return;
  if(nativeTheme!==p.theme){
   ['home','discover','publish','messages','me'].forEach((n,index)=>wx.setTabBarItem?.({index,selectedIconPath:'/assets/icons/'+n+'-'+p.theme+'.png'}));
   nativeTheme=p.theme;
  }
  const styleKey=[p.theme,c.muted,c.link,c.surface].join('/');
  if(nativeStyle!==styleKey){
   wx.setTabBarStyle?.({color:c.muted,selectedColor:c.link,backgroundColor:c.surface,borderStyle:p.theme==='dark'?'white':'black'});
   nativeStyle=styleKey;
  }
 },300);
}
async function sync(){
 if(!api.online()||!api.hasSession())return;
 const uid=wx.getStorageSync('city_life_user_id');
 try{const prefs=await api.request('GET','/api/v1/me/preferences',null,true);if(uid!==wx.getStorageSync('city_life_user_id'))return;store(prefs);if(typeof getCurrentPages==='function'){const pages=getCurrentPages();if(pages.length)apply(pages[pages.length-1]);}}catch{/* Existing local display preferences remain usable offline. */}
}
module.exports={apply,current,store,palettes,defaults,sync};
