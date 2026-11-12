// Local developer-tools connection. Release requires HTTPS and devLogin:false.
// Never put WECHAT_SECRET, database passwords or admin credentials in this file.
module.exports = {
  mode: 'server',                   // 'demo' or 'server'
  apiBaseUrl: 'http://127.0.0.1:3101',                 // Updated local API; scripts/start_local.ps1
  devLogin: false,               // local developer-tool testing only; never enable for a release
  devUser: 'local-dev-user'
};
