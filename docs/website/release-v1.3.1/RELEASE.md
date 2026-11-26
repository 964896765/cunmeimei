# 青方睐村美美官网 V1.3.1 精修与验收

发布编号按要求使用 V1.3.1。实现以当前官网工作区为基础，沿用已有的四翼蝴蝶、七页结构和小程序码。全站视觉采用 QFL PRISM NEON 2.0。

## 修改清单

| 页面 | 已完成内容 |
| --- | --- |
| 首页 | 保留蓝紫与粉金四翼主视觉，减少装饰光轨和发光强度，增加后景色层，收敛标题比例和服务卡片边框。保留暂停和减少动态效果支持。 |
| 服务 | 六类插画采用双色霓虹轮廓、透光玻璃和统一透视。统一图幅和卡片高度，保留类别说明、小程序频道及深链接。 |
| 功能 | 压缩卡片留白，将图标、功能介绍和操作链接排在同一个内容组内，加入悬停与键盘焦点反馈。 |
| 帮助中心 | 收紧目录、搜索和 FAQ 列表。保留搜索、清空、展开收起和问题直达。 |
| 用户协议 | 正文 15–16px、行高 1.8，正文卡片最宽 960px。增加阅读进度、章节所在位置和可直达目录。 |
| 隐私政策 | 使用同一阅读布局。补充官网访问日志用途、处理规则和 186 天常规保存期限，接入官方隐私邮箱。 |
| 联系我们 | 收紧双栏、标题和卡片内间距。官网个人信息请求可发至 `chenjun@qingfanglai.cn`。 |

统一变量涵盖字体、字号、字重、行高、颜色、渐变、阴影、圆角、边框、卡片间距和动效时长。常规桌面字号采用品牌 18px、导航 15px、主标题 38px、副标题 16px、区块标题 23px、卡片标题 17px、正文 15px、辅助文字 13px。桌面内页标题区由约 257px 收到约 206px。

## 构建与核验

| 检查 | 结果 |
| --- | --- |
| 静态构建 | 七个正式页面、独立 404、站点索引及本地资源构建成功。 |
| 自动化 | 16 项通过，覆盖直接访问、刷新、站内链接、小程序码文件校验、条款与日志轮转期限。 |
| Edge | 七页在七种宽度下共检查 49 个页面样本和 21 项交互。横向溢出、运行错误、外部资源请求均为零。 |
| Nginx | 隔离容器的七路由、跳转、404、资源、安全头、查询参数排除与日志重新打开均通过。 |
| 邮件 | `qingfanglai.cn` 的 MX 解析到腾讯企业邮箱。收信能力来自运营方此前确认。 |

官网隐私说明与部署包的 186 天日轮转模板对应。生产服务器现有留存、备份与每日轮转任务待部署前核验。期限设计参考相关网络日志至少留存六个月的规定，以及个人信息保存期限的必要性原则。[中华人民共和国网络安全法](https://www.cac.gov.cn/2025-12/29/c_1768735112911946.htm) · [中华人民共和国个人信息保护法](https://www.miit.gov.cn/zwgk/zcwj/flfg/art/2022/art_04a0f1fb5df244e39688fd5372623a8d.html)

小程序条款正文沿用现有内容。当前小程序登录使用微信凭证，手机号验证按现有微信授权流程处理。短信验证码登录仍在小程序阶段，验证码用途、期限和服务商条款须随该功能上线核对。小程序码继续显示待发布。

## 七页三端截图

截图来自本地运行的真实页面。桌面、平板和手机分别使用 1440px、768px 和 390px 视口。

| 页面 | 1440px | 768px | 390px |
| --- | --- | --- | --- |
| 首页 | [桌面](../../../apps/website/release/screenshots-v1.3.1/home-desktop.png) | [平板](../../../apps/website/release/screenshots-v1.3.1/home-tablet-768.png) | [手机](../../../apps/website/release/screenshots-v1.3.1/home-mobile.png) |
| 服务 | [桌面](../../../apps/website/release/screenshots-v1.3.1/services-desktop.png) | [平板](../../../apps/website/release/screenshots-v1.3.1/services-tablet-768.png) | [手机](../../../apps/website/release/screenshots-v1.3.1/services-mobile.png) |
| 功能 | [桌面](../../../apps/website/release/screenshots-v1.3.1/about-desktop.png) | [平板](../../../apps/website/release/screenshots-v1.3.1/about-tablet-768.png) | [手机](../../../apps/website/release/screenshots-v1.3.1/about-mobile.png) |
| 帮助中心 | [桌面](../../../apps/website/release/screenshots-v1.3.1/help-desktop.png) | [平板](../../../apps/website/release/screenshots-v1.3.1/help-tablet-768.png) | [手机](../../../apps/website/release/screenshots-v1.3.1/help-mobile.png) |
| 用户协议 | [桌面](../../../apps/website/release/screenshots-v1.3.1/agreement-desktop.png) | [平板](../../../apps/website/release/screenshots-v1.3.1/agreement-tablet-768.png) | [手机](../../../apps/website/release/screenshots-v1.3.1/agreement-mobile.png) |
| 隐私政策 | [桌面](../../../apps/website/release/screenshots-v1.3.1/privacy-desktop.png) | [平板](../../../apps/website/release/screenshots-v1.3.1/privacy-tablet-768.png) | [手机](../../../apps/website/release/screenshots-v1.3.1/privacy-mobile.png) |
| 联系我们 | [桌面](../../../apps/website/release/screenshots-v1.3.1/contact-desktop.png) | [平板](../../../apps/website/release/screenshots-v1.3.1/contact-tablet-768.png) | [手机](../../../apps/website/release/screenshots-v1.3.1/contact-mobile.png) |

[完整部署包](../../../apps/website/release/dgqfl-website-1.3.1-deploy.tar.gz) · [部署包 SHA-256](../../../apps/website/release/dgqfl-website-1.3.1-deploy.tar.gz.sha256) · [21 张截图与浏览器报告](../../../apps/website/release/dgqfl-website-1.3.1-screenshots.zip)
