# 当前18页独立验收矩阵

2026-10-18；版本0.25.0；配色冻结。最新截图时间（上海）：2026/10/18 16:39:31。18路由全部实际渲染，没有删页。

本矩阵更新为城市/地图及快捷入口这一轮的结论。仅证明本次可见状态及明确列出的流程，不代表全部隐藏状态、全部主题组合或物理真机验收完成。所有页面的Android/iPhone、读屏器、持续弱网、键盘及实机性能仍待验收。

| 页面/路由 | 早期对照 | 当前截图 | 独立结论 |
| --- | --- | --- | --- |
| 首页 · `pages/home/index` | [原图](prism4-before-home.png) | [当前图](prism4-after-home.png) | 渲染通过；更多管理、27项两行横滑、手动城市显示通过 |
| 发现 · `pages/discover/index` | [原图](prism4-before-discover.png) | [当前图](prism4-after-discover.png) | 渲染通过；原生上下滑导航、收藏及地图返回频道/滚动恢复通过 |
| 发布 · `pages/publish/index` | [原图](prism4-before-publish.png) | [当前图](prism4-after-publish.png) | 渲染通过；项目搜索、账号草稿、独立确认发布城市、待审提交通过 |
| 消息 · `pages/messages/index` | [原图](prism4-before-messages.png) | [当前图](prism4-after-messages.png) | 渲染通过；真实联系申请/通知页渲染通过；完整IM未接通 |
| 我的 · `pages/me/index` | [原图](prism4-before-me.png) | [当前图](prism4-after-me.png) | 渲染通过；草稿与本机账号浏览记录回归通过 |
| 城市选择 · `pages/regions/index` | [原图](prism4-before-regions.png) | [当前图](prism4-after-regions.png) | 渲染通过；拼音搜索、历史、字母分组、东莞镇街与手选城市通过；GPS解析待Key |
| 详情 · `pages/detail/index` | [原图](prism4-before-detail.png) | [当前图](prism4-after-detail.png) | 渲染通过；真实审核后内容读取、来源关联通过 |
| 预约 · `pages/booking/index` | [原图](prism4-before-booking.png) | [当前图](prism4-after-booking.png) | 渲染通过；真实服务预约持久化通过 |
| 我的发布 · `pages/my-posts/index` | [原图](prism4-before-my-posts.png) | [当前图](prism4-after-my-posts.png) | 渲染通过；提交待审后跳转与数据库状态一致通过 |
| 我的预约 · `pages/my-bookings/index` | [原图](prism4-before-my-bookings.png) | [当前图](prism4-after-my-bookings.png) | 渲染通过；真实完成预约状态显示通过 |
| 商家入驻 · `pages/merchant/index` | [原图](prism4-before-merchant.png) | [当前图](prism4-after-merchant.png) | 渲染通过；申请、证据约束与授权审核流程通过 |
| 会话演示 · `pages/chat/index` | [原图](prism4-before-chat.png) | [当前图](prism4-after-chat.png) | 渲染通过；当前页渲染通过；完整真实私信仍未接通 |
| 商家服务 · `pages/merchant-services/index` | [原图](prism4-before-merchant-services.png) | [当前图](prism4-after-merchant-services.png) | 渲染通过；原服务提交、审核、公开预约回归通过 |
| 商家预约 · `pages/merchant-bookings/index` | [原图](prism4-before-merchant-bookings.png) | [当前图](prism4-after-merchant-bookings.png) | 渲染通过；确认与完成真实预约通过 |
| 成员权限 · `pages/merchant-team/index` | [原图](prism4-before-merchant-team.png) | [当前图](prism4-after-merchant-team.png) | 渲染通过；当前页渲染通过；服务端撤权限制由权限/PG回归覆盖 |
| 全局搜索 · `pages/search/index` | 新增页，无早期旧图 | [当前图](prism4-after-search.png) | 渲染通过；中文分类查询与浏览城市继承通过 |
| 更多/快捷入口 · `pages/categories/index` | 新增页，无早期旧图 | [当前图](prism4-after-categories.png) | 渲染通过；由全部分类改为管理27个快捷项，保存返回首页通过 |
| 地图找信息 · `pages/map/index` | 新增页，无早期旧图 | [当前图](prism4-after-map.png) | 渲染通过；真实底图与边界API、标记/列表、三档抽屉、公开点隔离通过；真实GPS与点位待核验 |

## 主题与状态样本

覆盖六种主题的10个样本，不是18页×6主题的完整组合。

| 路由 | 状态 | 截图 |
| --- | --- | --- |
| `pages/home/index` | dark | [截图](prism4-after-dark-home.png) |
| `pages/home/index` | clear | [截图](prism4-after-clear-home.png) |
| `pages/home/index` | quiet | [截图](prism4-after-quiet-home.png) |
| `pages/home/index` | warm | [截图](prism4-after-warm-home.png) |
| `pages/home/index` | gentle | [截图](prism4-after-gentle-home.png) |
| `pages/discover/index` | dark | [截图](prism4-after-dark-discover.png) |
| `pages/detail/index` | clear | [截图](prism4-after-clear-detail.png) |
| `pages/publish/index` | clear · 大字/减少动态 | [截图](prism4-after-clear-large-form.png) |
| `pages/publish/index` | prism | [截图](prism4-after-prism-form.png) |
| `pages/me/index` | prism | [截图](prism4-after-guest-me.png) |

## 证据与边界

- [最新18页/10样本机器结果](prism4-after-colors-result.json)、[渲染日志](geo-all-pages-render.log)。
- [城市/地图/快捷项28项](geo-shortcuts-ui-current.log)、[结构化结果](geo-shortcuts-ui-result.json)。
- [发布/草稿/收藏/搜索等28项](geo-page-structure-ui-complete.log)、[结构化结果](pages-structure-ui-result.json)。
- [原有业务26项](geo-existing-business.log)、[结构化结果](local-business-result.json)。
- [严格PG33及主套件153项](geo-full-regression-final.log)、[静态检查](geo-static-checks.log)。
- [本轮修改清单、数据来源、Key与设备限制](CITY_MAP_SHORTCUTS.md)。

早期对照来自配色冻结前，不是本轮相同数据的逐像素对比。地图专项合成坐标仅属于隔离标记的开发服务，普通用户不可见，测试结束已撤回。未配置腾讯Key，因此自动逆地理解析、附近城市与城市中心解析不能标为通过。
