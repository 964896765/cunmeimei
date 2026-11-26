'use strict';
const routes=['home','discover','publish','messages','me'].map(name=>'pages/'+name+'/index');
let unread=0,owner='';
function context(){return [wx.getStorageSync('city_life_user_id')||'',wx.getStorageSync('city_life_v2_auth_token')||''].join(':');}
function currentUnread(){const key=context();if(key!==owner){owner=key;unread=0;}return unread;}
function sync(page,preferences,colors){
 const bar=page.getTabBar?.();
 if(bar?.syncRoute){
  const neutral=page.route==='pages/publish/index'&&page.data?.selectedCategory==='C23'&&!page.data?.searchHasQuery;
  const palette=neutral?require('./memorial-theme').palette(preferences.theme):colors;
  bar.syncRoute(page.route,preferences,palette,currentUnread(),!!page.data?.immersed,neutral);
 }
 return typeof page.getTabBar==='function';
}
function visibility(page,hidden){const bar=page.getTabBar?.();if(bar)bar.setData({hidden:!!hidden});else if(typeof page.getTabBar!=='function')wx[hidden?'hideTabBar':'showTabBar']?.({animation:false});}
function setUnread(count,page,expected=context()){if(expected!==context())return;owner=expected;unread=Math.max(0,Number(count)||0);const bar=page.getTabBar?.();if(bar)bar.setData({unread});else if(typeof page.getTabBar!=='function'){if(unread)wx.setTabBarBadge?.({index:3,text:unread>99?'99+':String(unread)});else wx.removeTabBarBadge?.({index:3});}}
module.exports={routes,isTab:route=>routes.includes(route),sync,visibility,setUnread,currentUnread,context};
