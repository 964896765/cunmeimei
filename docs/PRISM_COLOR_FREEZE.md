# PRISM 混合光学配色 · 工程冻结基线

城市/地图与快捷入口更新沿用本冻结基线，配色源及合同未改；行为验收与未配置Key的边界见 [本轮实施记录](CITY_MAP_SHORTCUTS.md)。

后续页面结构更新：原 15 页已全部保留并追加搜索、目录和地图入口，共 18 页。新页面继承已冻结色族，色值及合同未改。当前实施与 18 页验收范围见 [页面结构实施记录](PAGE_STRUCTURE_IMPLEMENTATION.md)；下方 15 页数量及测试数字属于配色冻结当时的历史批次。

核验时间：2026-10-18 12:43:10 +08:00。软件版本维持 0.25.0。

状态：工程配色基线已冻结。这里的合格指代码、可读性、实际模拟器渲染与主题兼容门禁通过；不代表用户已经认可审美，也不代表物理真机验收通过。后续不自行改变色系；用户明确提出设计调整、发现可读性或兼容性缺陷时，修改源配置、冻结合同并重新验收。

## 冻结规则

- 共用珍珠白底、暖墨正文、玻璃高光、圆角与字号规则；15 条真实路由各有不同的三色混合，不随机换色。
- 首页玫瑰虹彩、发现薄荷冰蓝、发布蜜桃藕紫、消息雾蓝青玉、我的香槟粉晶。二级页面使用对应色族和独立三色组合。
- 原生底部五导航保留。发布“＋”使用浅色混合玻璃内面、细色环与深色细线，不再使用深色实心圆。
- Tab 选中文字随当前页面变化；选中图标使用对应主页面色。发现页筛选和消息页分段控件使用本页混色与边界表达选中状态；颜色不会随时间循环。
- 仅在实际主题切换时重设五个原生图标；路由变化只按需更新原生 Tab 样式，保留延迟更新与去重，避免切页中断。
- 六个用户主题编码 prism/dark/clear/quiet/warm/gentle、偏好存储、隐私开关与大字模式保持。独立页面混色只用于 prism，不覆盖用户主动选择的其他主题。
- 正文、表单仍用稳定实体白面或所选主题实体表面。高对比主题保留清楚的边界；没有引入动态模糊、外部字体或新增图像依赖。

## 主页面实际选中色

| 页面 | 图标色 | 文字/链接选中色 |
| --- | --- | --- |
| 首页 | `#895D78` | `#744E68` |
| 发现 | `#457F8A` | `#376775` |
| 发布 | `#8263A0` | `#705287` |
| 消息 | `#586D9A` | `#4D628E` |
| 我的 | `#A05E77` | `#875165` |

## 15 页独立核验记录

以下均为实际微信开发者工具截图，已读取当前编译后的背景、正文、页面混色变量，并观察实际原生 Tab 样式调用；无捕获到的运行时异常。截图只证明该页面当次可见状态，不代表所有隐藏面板、键盘和真机状态都已验收。前后截图中部分测试记录和计数会随真实业务验收变化，不用于宣称像素级性能改进。

| 页面 / 路由 | 三色组合 | 修改前 | 修改后 | 结论 |
| --- | --- | --- | --- | --- |
| 首页 · `pages/home/index` | #F8DCE4 / #DBEFF4 / #E8DDF5 | [原图](prism4-before-home.png) | [新图](prism4-after-home.png) | 编译/取色/渲染通过；真机待验收 |
| 发现 · `pages/discover/index` | #DDF3EC / #D4E9F4 / #EAE2F4 | [原图](prism4-before-discover.png) | [新图](prism4-after-discover.png) | 编译/取色/渲染通过；真机待验收 |
| 发布 · `pages/publish/index` | #FBE4D7 / #E2E5FC / #F4D9EA | [原图](prism4-before-publish.png) | [新图](prism4-after-publish.png) | 编译/取色/渲染通过；真机待验收 |
| 消息 · `pages/messages/index` | #E7DFF5 / #DEF4F2 / #DDE8FC | [原图](prism4-before-messages.png) | [新图](prism4-after-messages.png) | 编译/取色/渲染通过；真机待验收 |
| 我的 · `pages/me/index` | #F8E5D5 / #EAE2F2 / #F7DCE6 | [原图](prism4-before-me.png) | [新图](prism4-after-me.png) | 编译/取色/渲染通过；真机待验收 |
| 地区选择 · `pages/regions/index` | #E5F2DF / #DBEBF7 / #E7E2F4 | [原图](prism4-before-regions.png) | [新图](prism4-after-regions.png) | 编译/取色/渲染通过；真机待验收 |
| 信息详情 · `pages/detail/index` | #F8E8D9 / #E1F0EF / #EEE0F1 | [原图](prism4-before-detail.png) | [新图](prism4-after-detail.png) | 编译/取色/渲染通过；真机待验收 |
| 预约表单 · `pages/booking/index` | #E0F1E9 / #E4E7F8 / #F6E8D9 | [原图](prism4-before-booking.png) | [新图](prism4-after-booking.png) | 编译/取色/渲染通过；真机待验收 |
| 我的发布 · `pages/my-posts/index` | #F8E1E4 / #EEE6F5 / #F7EEDD | [原图](prism4-before-my-posts.png) | [新图](prism4-after-my-posts.png) | 编译/取色/渲染通过；真机待验收 |
| 我的预约 · `pages/my-bookings/index` | #E2EDF7 / #F8E6DA / #EEE3F3 | [原图](prism4-before-my-bookings.png) | [新图](prism4-after-my-bookings.png) | 编译/取色/渲染通过；真机待验收 |
| 商家中心 · `pages/merchant/index` | #EAE1F5 / #E1EEF1 / #F4E8E0 | [原图](prism4-before-merchant.png) | [新图](prism4-after-merchant.png) | 编译/取色/渲染通过；真机待验收 |
| 本地聊天演示 · `pages/chat/index` | #E5E7FA / #E1F0F2 / #F3E6F4 | [原图](prism4-before-chat.png) | [新图](prism4-after-chat.png) | 编译/取色/渲染通过；真机待验收 |
| 商家服务 · `pages/merchant-services/index` | #DFF2EC / #EAE2F5 / #DFEAF8 | [原图](prism4-before-merchant-services.png) | [新图](prism4-after-merchant-services.png) | 编译/取色/渲染通过；真机待验收 |
| 商家预约 · `pages/merchant-bookings/index` | #E1E9F9 / #F0E2EF / #E3F1EB | [原图](prism4-before-merchant-bookings.png) | [新图](prism4-after-merchant-bookings.png) | 编译/取色/渲染通过；真机待验收 |
| 成员与权限 · `pages/merchant-team/index` | #EEE1F4 / #E3EAF8 / #F8E8DF | [原图](prism4-before-merchant-team.png) | [新图](prism4-after-merchant-team.png) | 编译/取色/渲染通过；真机待验收 |

## 专项证据与边界

- [微信全页与主题结果](prism4-after-colors-result.json)：15 页 + 10 个样本，包含另外五主题首页、深色发现、高对比详情、高对比大字发布表单、Prism 实际发布表单与未登录个人中心。发布入口通过真实点击打开表单，检查白色表面与实际按钮渐变。
- [模拟器完整日志](prism-accents-render.log)：本轮 15+10 均通过。采集结束恢复原身份及显示缓存；后续采集脚本补充了截图前归零滚动，避免复用首页旧滚动位置。
- [颜色与导航测试](prism-accents-unit.log)：4 通过 / 0 失败 / 0 跳过，涵盖六主题及全部路由可读性、真实 PNG 取色、轻透“＋”、动态导航和冻结合同。
- [对比度计算](prism-color-contrast.json)：所有被测正文/次要文字/链接/价格/警示文字与规定背景组合均 >=4.5:1；按钮两端文字 >=4.5:1；输入边界 >=3:1。此为颜色令牌计算，不冒充真机读屏或屏幕测量。
- [最新 PostgreSQL 全回归](prism-accents-regression.log)：严格数据库 29/0/0；npm test 130/0/0；e2e 15/0/0；permissions 9/0/0；merchant-application 4/0/0。专项重复覆盖主套件，不能相加当成独立用例。隔离容器、网络与测试卷清理通过，持久开发库保留。
- [本轮真实业务检查](prism-mixed-business.log)：26 通过；发布→审核→展示、商家→服务审核→预约、并发占位和五导航。该检查在页面独立色族整改之前运行；整改后另有本报告的全页/主题/导航检查。未改后端业务与权限。
- [主题偏好与隐私复验](prism-accents-preferences.log)：10 通过 / 0 失败；实际设置界面保存六主题、大字与减少动态效果，服务端通知摘要保护、拒绝新联系申请、隐私请求和管理员答复均通过。
- [游客角标追加检查](prism-guest-badge-result.json)：发现并修复未登录个人中心残留上个账号消息角标；`pages/me/index.js` 的游客分支清除原生消息角标，实际调用及截图已通过。此为冻结后的一行显示状态修正，没有改变冻结色值。完整操作及身份恢复日志见 prism-guest-badge-final.log。
- Android/iPhone 物理真机、读屏器、持续弱网、实机帧率与长时间使用：待人工验收。聊天详情仍是已明确标注的本地演示，不宣称新增真实私信。
- 正式发布预检仍因本地 HTTP、开发登录和域名校验配置而阻断，见 prism-mixed-release-precheck.log；本任务保持本机联调，不擅自解除生产门禁。

## 实际修改范围

- `miniprogram/utils/palettes.js`：六主题源配置、五个色族、15 路由混色、统一解析与图标色。
- `miniprogram/utils/theme.js`：按路由计算展示色、图标色族和原生选中色，保留用户偏好及原生导航防重建处理。
- `miniprogram/app.wxss`、`app.json`：共享文本、按钮、筛选、实体表面与混色过渡；app.json 只改批准的五个显示颜色。
- 五主页面的 WXML/WXSS：信息层次、玻璃品牌区、发布卡、通知与账户布局；其余十页保留业务布局并统一共享色/部分局部字重圆角。首页增加到现有消息页的快捷跳转。
- `components/content-card`：跟随用户主题与本页色族，仍从真实数据展示；booking/me/messages 的图标引用同步适配。
- `scripts/build_theme_tabs.js`、`build_icons.js` 及 `assets/icons`：本地矢量生成的导航、分类和工具图标，不复制参考图、水印或演示业务数据。
- `backend/tests/color-system.test.js`、`theme-navigation.test.js`：可读性、PNG 与动态导航回归。
- `scripts/check_prism4_colors_ui.js`：实际模拟器取色、截图、原生选中色观察与状态恢复。
- `scripts/check_v25.py`：只将批准的五个颜色字段规范化后验证历史 app.json 哈希，路由/其他配置及历史迁移 001–005 保持严格校验；未放宽业务权限断言。

## 维护入口

配色只从 `miniprogram/utils/palettes.js` 修改；固定合同见 `scripts/prism-color-baseline.json`。调整后运行两套图标生成脚本、颜色/导航测试、结构检查和微信全页验收。软件版本、业务模块和数据库结构不因配色变更而升级。没有使用 Git、生成 ZIP、建立版本目录或复制整套工程。

冻结合同 SHA-256：`82ee6604e049749c5e42679c9c01addf9cba3a8e0159409f9f93fbde2e0c6db8`。
