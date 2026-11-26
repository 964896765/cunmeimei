# 官网 V1.2.0 本地视觉升级

本次从工作区的 V1.1.2 出发，按用户确认的官方邮箱补齐并封存 V1.1.3 稳定包。V1.2.0 独立打包，沿用七个页面、现有业务入口和静态构建。官网与小程序协议及隐私正文保持原样。

## 视觉与内容

- 暖瓷白 `#FAF9F6` 作为底色，墨灰 `#28252B` 承担主要文字与功能介绍区。莓红 `#963B59` 用于主按钮和必要的强调，雾紫灰、雾蓝、暖砂分别用于不同场景。
- 首页保留 Logo 和原街区主视觉，调整图文比例。六类卡片使用两张宽卡加四张窄卡的桌面布局，在平板和手机返回两列。六张原插画分别结合辅助色和不同的构图。
- 新增岭南街巷示意图及核对信息、联系发布者的提示。平台介绍用定位、提交与审核步骤、服务边界三个模块呈现。
- 使用帮助保留原问题目录和折叠内容，增加仅在当前页面筛选标题及回答的搜索。联系我们分别展示运营主体、官方邮箱、投诉反馈、官网隐私请求和小程序个人数据。官方邮箱为 `964896765@qq.com`。专用隐私受理地址与官方小程序码尚未配置。

## 本地验收与发布包

- 14 项自动化测试通过。Edge 在 375、390、430、768、1024、1440px 下检查了 42 个页面样本和 17 项交互，包含帮助搜索、清空、无结果、六类卡片目标、协议目录、历史和刷新。
- 隔离 Nginx 回归通过。逐字节比对 V1.1.3 和 V1.2.0 的 Logo、原主视觉及分类图片，并对比两版协议和隐私页面正文。两版发布包及 SHA-256 独立保留。
- 仅在本地开发与验收，未执行云端部署。

[本地预览](http://127.0.0.1:4173/) · [桌面首页](../../../apps/website/release/screenshots-v1.2.0/home-desktop.png) · [街巷场景](../../../apps/website/release/screenshots-v1.2.0/home-street-desktop.png) · [平板首页](../../../apps/website/release/screenshots-v1.2.0/home-tablet-768.png) · [手机首页](../../../apps/website/release/screenshots-v1.2.0/home-mobile.png) · [浏览器结果](../../../apps/website/release/screenshots-v1.2.0/browser.json)

[V1.2.0 发布包](../../../apps/website/release/dgqfl-website-1.2.0.tar.gz) · [新版 SHA-256](../../../apps/website/release/dgqfl-website-1.2.0.tar.gz.sha256) · [V1.1.3 稳定包](../../../apps/website/release/dgqfl-website-1.1.3.tar.gz) · [稳定版 SHA-256](../../../apps/website/release/dgqfl-website-1.1.3.tar.gz.sha256)

## 新增场景图

使用内置 ImageGen 生成，压缩为 1320 × 880 WebP。网站明确标为 AI 场景示意。[neighborhood-morning.webp](../../../apps/website/public/media/neighborhood-morning.webp)

> Create a single editorial lifestyle photograph, horizontal 3:2, for a refined neighborhood services website rooted in Dongguan, China's Lingnan region. This is a fictional but geographically plausible everyday street scene, not a tourist landmark. A quiet lived-in pedestrian lane, on the foreground left a street-level tiny open fruit stall with a wood crate of mandarins, pale ceramic tile and a beige retractable awning, authentic older low-rise cream plaster buildings and iron balcony railings. To the right a single bicycle leaning against an unbranded wall, farther down a softly blurred adult in neutral clothes with their back turned, some potted broad leaf plants and mild shadows. Soft warm morning daylight from upper left, candid real photography with believable textures, refined subdued palette of warm ivory, stone, faded slate blue and subtle natural foliage, light film grain, mild contrast, inviting, quiet. Frame the street and shop door with enough context, center the subjects so the image can crop slightly at sides, no foreground close-up face. No signs or letters, no logos, no watermark, no vector illustration, no 3D model, no fancy tourist decoration, no heavy orange grading. Deliver the image only.
