const tabs=require('../utils/tab-bar'),theme=require('../utils/theme'),{resolvePalette}=require('../utils/palettes');
const names=['home','discover','publish','messages','me'],labels=['首页','发现','发布','消息','我的'];
Component({
 data:{route:'pages/home/index',theme:'prism',surface:'#FFFFFF',muted:'#62545F',selectedColor:'#744E68',unread:0,hidden:false,items:names.map((name,index)=>({name,label:labels[index],route:tabs.routes[index]}))},
 lifetimes:{attached(){this.refresh();},ready(){this.refresh();}},pageLifetimes:{show(){this.refresh();}},
 methods:{
  refresh(){const page=getCurrentPages().slice(-1)[0];if(!page||!tabs.isTab(page.route))return;const prefs=theme.current();this.syncRoute(page.route,prefs,resolvePalette(prefs.theme,page.route),tabs.currentUnread(),!!page.data?.immersed);},
  syncRoute(route,prefs,colors,unread,hidden){this.setData({route,theme:prefs.theme,surface:colors.surface,muted:colors.muted,selectedColor:colors.link,unread,hidden,largeText:!!prefs.largeText,reduceMotion:!!prefs.reduceMotion});},
  select(e){const route=e.currentTarget.dataset.route;if(!tabs.isTab(route)||route===this.data.route||this.switching)return;this.switching=true;wx.switchTab({url:'/'+route,fail:()=>wx.showToast({title:'页面暂未打开，请重试',icon:'none'}),complete:()=>{this.switching=false;}});}
 }
});
