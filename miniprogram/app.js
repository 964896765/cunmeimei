const storage = require('./utils/storage');
const api = require('./utils/api');
App({
  onLaunch() { if (!api.online()) storage.ensureDemoData(); },
  onShow() { require('./utils/theme').sync(); },
  globalData: { exploreTarget: '', chatTarget: '', area: '示例市 · 中心街道' }
});
