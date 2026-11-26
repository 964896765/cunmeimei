# 青方睐村美美官网 V1.1.2 本地验收与交付

日期为 2026 年 11 月 19 日（北京时间）。本次交付本地静态构建。原有小程序、后端和线上设施未变更。

## 验收状态

| 范围 | 结果 |
| --- | --- |
| 本地功能验收 | 通过。自动化 14 项，真实 Edge 4 种宽度下 28 个页面样本及 15 项交互检查 |
| 协议和隐私政策 | 已完成源码与官网查阅稿的对照。最终法律文本、运营流程和生产启用情况尚未完成核对 |
| 生产环境验收 | 本轮未进行，也未部署。隔离 Nginx 回归不代表生产验收 |

## 修改前后

| 范围 | V1.1.1 | V1.1.2 |
| --- | --- | --- |
| 首页 | 原站点宣传语和常驻毛玻璃 | 「让本地生活信息，更好找。」保留两行，导航滚动后轻微毛玻璃，主视觉外框收薄，按钮同高，六卡片轻微上浮 |
| 六类服务 | 六张卡片及原说明页锚点 | 原插画和目标完整保留，逐张点击核对说明页分类 |
| 页脚 | 主体、备案及相关导航均有显示 | 主体加标签，备案居中，协议与隐私入口保持独立和清晰 |
| 联系我们 | 以小程序帮助与反馈为主 | 继续使用双卡片，区分官网隐私请求状态和小程序账户请求，保留帮助及小程序使用说明 |
| 协议和隐私 | 两段适用范围，保存说明较通用 | 保留适用范围、默认折叠目录和原条款结构。修正与代码不一致的描述，补充分类型保存表，明确官网查阅稿与小程序实际同意版本 |

详细个人信息对照、保留期限、实际调用和待确认事项见 [协议与隐私差异报告](PRIVACY-REVIEW.md)。

## 修改文件清单

| 文件 | 改动 |
| --- | --- |
| [apps/website/package.json](../../../apps/website/package.json) | 升级至 V1.1.2 |
| [apps/website/src/pages.mjs](../../../apps/website/src/pages.mjs) | 首页标题、页脚、联系卡片、官网隐私适用范围 |
| [apps/website/public/styles.css](../../../apps/website/public/styles.css) | 现有配色下微调导航、按钮、主图、分类及条款表格 |
| [apps/website/public/menu.js](../../../apps/website/public/menu.js) | 滚动时切换导航样式 |
| [apps/website/src/legal.mjs](../../../apps/website/src/legal.mjs) | 渲染可独立滚动的保存期限表格 |
| [apps/website/src/content/miniapp-privacy.md](../../../apps/website/src/content/miniapp-privacy.md) | 修正官网个人信息说明及分类保存与处理 |
| [apps/website/src/content/miniapp-agreement.md](../../../apps/website/src/content/miniapp-agreement.md) | 同意流程和平台责任 |
| [apps/website/tests/website.test.mjs](../../../apps/website/tests/website.test.mjs) | 回归合法入口、数据说明和站内链接 |
| [apps/website/tests/browser.mjs](../../../apps/website/tests/browser.mjs) | 四种宽度、分类导航、浏览器历史、刷新及条款表格检查 |
| [docs/website/README.md](../README.md) | 增加新版本交付索引 |
| [release-v1.1.2/](.) | 本报告及协议、隐私差异报告 |

七个页面、独立 404、原 Logo、首页主视觉及六张分类插画均保留。八个图片文件与 V1.1.1 发布包逐字节相同。

## 自动化及浏览器验收

- HTTP 自动化 14 项全通过。核对七页直达及刷新、内部链接与锚点、图片文件、404、备案链接、联系和二维码空状态。
- Edge 真实 Chromium 引擎在 375、390、430、1440px 下检查七页。菜单、首屏主图、卡片、条款、联系页和页脚可用。测试范围内无整页横向溢出、文字截断、图片加载错误、页面错误或外部网络请求。
- 六张卡片逐个点击到对应分类说明，前进后退和刷新可复现。协议和隐私目录默认折叠，展开可定位。三种手机宽度下表格在自身区域内横向滚动。
- 隔离 Nginx 检查了 HTTPS、官网路由、重定向、404、静态资源、日志和回滚。移动测试为浏览器视口和微信 UA 模拟，未进行微信真机测试。

[浏览器结果](../../../apps/website/release/screenshots-v1.1.2/browser.json) · [升级前首页](../../../apps/website/release/screenshots-v1.1.1/home-desktop.png) · [1440px 首页](../../../apps/website/release/screenshots-v1.1.2/home-desktop.png) · [375px](../../../apps/website/release/screenshots-v1.1.2/home-mobile-375.png) · [390px](../../../apps/website/release/screenshots-v1.1.2/home-mobile.png) · [430px](../../../apps/website/release/screenshots-v1.1.2/home-mobile-430.png) · [手机隐私表格](../../../apps/website/release/screenshots-v1.1.2/privacy-retention-mobile.png)

## 未完成事项

- 官网页脚沿用现有名称「青方睐村美美」、运营主体「东莞市石排青方睐软件中心（个体工商户）」、域名 `dgqfl.xyz` 与号码「粤ICP备2025514981号-1」。备案链接由工信部公告确认。备案查询服务本次返回 521，工作区没有备案回执，正式网站名称及上述字段仍待与回执核对。[工信部备案系统域名公告](https://wap.miit.gov.cn/jgsj/xgj/hlwgl/art/2020/art_b9c05f8e533744f18a8c447f26fcf86c.html)
- 官网页面仍无已确认的独立隐私受理邮箱、小程序码、电话或地址。官网说明如实显示受理现状，小程序账户请求保留真实操作指引。发布前须确认面向官网访客的可用渠道、核验和答复流程。
- 生产中的微信接口与地图实际启用情况、分数据类别的留存与删除、未成年人准入处理和最终公开法律文本仍待运营确认。生产验收另行进行。

## 发布包与回滚

V1.1.2 为完整静态包。V1.1.1 原归档及校验文件保留，可直接恢复上一版本的静态目录。两包独立，无需覆盖小程序或后端，也无需重建旧版本。

[V1.1.2 发布包](../../../apps/website/release/dgqfl-website-1.1.2.tar.gz) · [V1.1.2 SHA-256](../../../apps/website/release/dgqfl-website-1.1.2.tar.gz.sha256) · [V1.1.1 回滚包](../../../apps/website/release/dgqfl-website-1.1.1.tar.gz) · [回滚包 SHA-256](../../../apps/website/release/dgqfl-website-1.1.1.tar.gz.sha256)
