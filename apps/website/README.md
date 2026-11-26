# 青方睐村美美官方网站

官网独立构建，输出静态文件供 Nginx 托管。源码包含七个页面和独立 404。

在仓库根目录使用 Node.js 20.9 或以上版本运行：

~~~powershell
npm run dev --prefix apps/website
npm test --prefix apps/website
npm run package --prefix apps/website
~~~

本地预览默认地址为 http://127.0.0.1:4173。可用 WEBSITE_PREVIEW_PORT 指定端口。构建后的文件位于 dist，归档及 SHA-256 文件位于 release。本应用使用 Node 标准库。打包命令需要系统 tar。

可在 [site.config.mjs](src/site.config.mjs) 中配置联系方式及小程序码。当前小程序入口按待发布状态展示。微信正式发布后，用无体验权限的微信账号扫码确认可访问正式版，再将 `releaseStatus` 设为 `published`。如正式码有变更，将原图放入 `public/media`，并更新 `codeImage`。

[页面和验收报告](../../docs/website/README.md) · [阿里云部署与回滚](../../docs/website/DEPLOYMENT.md)
