# 青方睐村美美官网交付与验收

V1.3.1 已完成 QFL PRISM NEON 2.0 全站精修与本地验收。[修改清单、构建结果及三端截图](release-v1.3.1/RELEASE.md)

V1.2.0 已完成本地视觉升级，V1.1.3 稳定包独立保留。[V1.2.0 本地验收与预览](release-v1.2.0/RELEASE.md)

V1.1.2 已进行本地增量升级。[V1.1.2 本地验收与交付](release-v1.1.2/RELEASE.md) · [协议与隐私差异报告](release-v1.1.2/PRIVACY-REVIEW.md)

V1.1.1 的公网探测、移动端条款验收、部署包和备份回滚命令详见 [上线前验收报告](production-v1.1.1/REPORT.md)。

下方保留 V1.1.0 的交付记录。

官网 V1.1.0 延续小程序的珍珠暖白与玫瑰色，使用酒红色标示主要操作。保留蝴蝶标识和首页岭南街区原图，网站标识加浅粉衬底并降低饱和度。正文排版加大行距，标题使用较轻字重。七个页面仍由原有静态构建生成。

服务分类采用六个专属微缩场景，首页和分类页共用压缩后的 WebP。每个服务卡片给出生活场景与小程序内相应频道。帮助按使用场景分组，条款和联系页提供相关链接。支持页面过渡的浏览器使用轻量淡入淡出，并遵循减少动效偏好。

## 页面

| 路径 | 服务内容 |
| --- | --- |
| / | 品牌介绍、六类服务、平台特色、使用流程和小程序入口 |
| /about | 平台定位、运营主体、业务方式及服务范围 |
| /services | 六类服务的介绍、使用方法和适用场景 |
| /help | 进入、浏览、搜索、发布、审核、联系、商家入驻、举报和反馈 |
| /agreement | 官网使用规则与微信小程序服务协议 |
| /privacy | 官网访问相关信息、小程序权限和个人信息权利 |
| /contact | 运营主体、联系资料及小程序个人数据请求指引 |

未知路径使用独立 404。全站页脚展示运营主体及用户给定的粤ICP备2025514981号-1，并链接工信部备案系统。

官网协议与隐私政策保留现有小程序文本作为内容基础，区分网站和小程序的适用范围，并按当前实现修订官网展示版本中的手机号授权、第三方能力和个人数据入口。原小程序应用内的同意版本仍由既有系统管理。

## 已执行的验收

| 检查 | 结果 |
| --- | --- |
| 官网自动化 | 13 项通过。覆盖七页直达和刷新、站内链接、锚点、资源、404、备案链接、配置空态、制品内容。另按 SHA-256 核对原首页主图及六张分类插画 |
| Edge 浏览器 | 1440、1024、390、375、320 五个宽度检查七页，共 35 个页面样本。八项交互通过，包含菜单、键盘退出、FAQ、分类与协议锚点避开导航、小程序入口及减少动效。未观察到横向溢出、页面错误或外部请求 |
| Nginx 1.29.2 | 在隔离容器内使用覆盖根域和 www 的测试证书。配置检查、重载、七个 HTTPS 页面、四项重定向、五个 404 路径、五个静态资源检查通过。容器内同机测试站点在重载前后的状态和响应一致 |
| 原本地 API | 开发前后 health、ready 均为 200。未引入新接口或数据库迁移 |
| 静态包 | tar.gz 校验文件与归档匹配，归档仅包含静态制品 |

移动视口测试在 Edge 中使用 iOS 和 Android 微信 UA。微信真机、生产 HTTPS、真实跳转和生产 API 仍待现场验证。复查时，本机对四个规划域名的请求仍遇到解析错误。工信部备案网站访问返回 521，因此仅核对了官网中展示的信息与既有资料一致，备案登记状态待复核。

七页的桌面和手机预览一并保存在本地构建产物目录。[V1.0.0 首屏](../../apps/website/release/screenshots-v1.0.0/home-desktop.png) · [新版桌面首页](../../apps/website/release/screenshots/home-desktop.png) · [新版手机首页](../../apps/website/release/screenshots/home-mobile.png) · [桌面服务页](../../apps/website/release/screenshots/services-desktop.png) · [手机服务页](../../apps/website/release/screenshots/services-mobile.png) · [手机隐私页](../../apps/website/release/screenshots/privacy-mobile.png) · [浏览器结果](../../apps/website/release/screenshots/browser.json)

新版静态制品和校验文件均已生成。[V1.1.0 部署包](../../apps/website/release/dgqfl-website-1.1.0.tar.gz) · [SHA-256](../../apps/website/release/dgqfl-website-1.1.0.tar.gz.sha256)

## 文件范围与复跑

| 文件或目录 | 用途 |
| --- | --- |
| apps/website/src/ | 页面、配置、分类、帮助和法律内容 |
| apps/website/public/ | 样式、菜单脚本和公开图片 |
| apps/website/scripts/ | 独立静态构建、回环预览、归档和六类场景渲染源 |
| apps/website/tests/ | HTTP、浏览器和 Nginx 检查 |
| apps/admin/README.md | 为未来独立后台预留目录说明 |
| infrastructure/nginx/dgqfl-website.conf.example | 官网独立站点模板 |
| docs/website/ | 审计、交付报告、部署及回滚 |

从仓库根目录执行下列命令。浏览器和 Nginx 检查使用上一条命令产生的 dist。

```powershell
npm test --prefix apps/website
npm run test:browser --prefix apps/website
npm run test:nginx --prefix apps/website
npm run package --prefix apps/website
```

浏览器检查默认使用本机 Edge，也可通过 WEBSITE_BROWSER 指定 Chrome 或 Edge 路径。Nginx 检查需要 Docker，默认使用本机 nginx:latest。部署和回滚仅涉及官网专属站点和版本目录。[部署与回滚](DEPLOYMENT.md)

## 待运营核对

- 电话、官方及隐私邮箱、运营地址、真实微信小程序码均为待公布。收到资料后更新官网配置并重新打包。[site.config.mjs](../../apps/website/src/site.config.mjs)
- ICP 备案号按用户提供信息展示。上线前核对权威登记、DNS、服务器访问、Nginx、有效证书和实际日志保留设置。
- 完成生产核验后，提交最终配置差异和制品供人工确认，再执行发布和真机验收。

## 插画

首页使用 V1.0.0 原有的 1200 × 800 岭南街区示意图。分类插画使用项目自有 Blender 模型和材质重新编排，分别表现求职、住房、闲置、门店、维修和社区公告。六幅图片统一以 640 × 400 透明背景渲染。网站只加载网页资源，构建无需安装 Blender 或读取小程序资产目录。[首页主图](../../apps/website/public/media/neighborhood.webp) · [分类渲染源](../../apps/website/scripts/render-service-art.py)

V1.0.0 首页主图生成提示如下。

> Create a single premium photorealistic 3D architectural miniature editorial illustration as the landing page hero image for a Chinese local-life brand website. Landscape 3:2. Subject: an inviting compact urban neighborhood in Dongguan, southern China, a high-angle three-quarter isometric view of a low-rise cream residential townhouse, a small pale blue neighborhood shop with striped canvas awning and warm window light, two mid-rise residential façades behind, an intimate tree-lined curved street, a few very tiny pedestrians, a bicycle, a low stone wall. Neighborhood fits on one beautifully crafted shallow architectural model base with gently rounded corners and a realistic street surface. Distant buildings softly fade into a light powder blue studio sky, cool daylight, soft shadows, precise subtle materials, porcelain blue, foggy periwinkle, muted greens, ivory, a little warm rust. Compose the model centered with generous breathing room on edges and more open sky at top; objects large enough to be recognizable at mobile width. Refined, contemporary, serene, clean, photographic tilt shift depth. Full bleed light blue background #dce8fa. This is the artwork alone. No letters, no signage text, no labels, no website layout, no watermark, no QR code, no glossy plastic toy look, no dominating skyscrapers.
