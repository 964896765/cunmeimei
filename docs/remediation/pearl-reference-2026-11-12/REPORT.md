# 珍珠暖白与玫瑰色全站整改

## 本轮交付

以2026年11月12日用户提供的五张参考图为视觉基准，重构首页、发现、发布、消息和个人中心。全站27个页面通过公共样式、页头、搜索、卡片、按钮、表单和状态组件使用统一设计语言。

本轮采用暖白背景、玫瑰色强调、白色内容表面、浅粉功能底和墨灰文字。首页及发现页使用用户提供的原始蝴蝶Logo和品牌标题。首页按最新参考图采用9个可编辑分类入口和固定更多。发布入口采用四列行业图标，点击后进入现有左右目录及418项细分类目。

像素级1∶1验收仍待用户确认。摄影、真实业务数量、头像、微信原生胶囊和安全区随资源及运行环境呈现。地图底图列入设备与服务配置验收。

## 主要实现

| 范围 | 本轮实现 |
| --- | --- |
| 全局 | 新色板、清晰文字对比、圆角白色表面、搜索胶囊、表单和按钮、统一阴影与间距，清理app.wxss重复基础声明 |
| 首页 | 品牌页头、城市定位图标、同行搜索、后台广告轮播、平台介绍摄影轮播、9类入口和更多、编辑入口、商家入口、真实推荐/最新/收藏热度/商家信息流 |
| 图片状态 | 广告图片失败显示文字信息，介绍轮播图片失败显示品牌文字与插画，内容卡片缺图使用文字排版，图片读取失败提供明确状态 |
| 发现 | 招聘、房产、闲置、商家、服务、活动、便民七频道，单行轻筛选，行业/地区/时间弹层，左图右文列表与收藏反馈 |
| 发布 | 发布插画、常驻搜索入口、四个工具入口、27行业图标，保留分类展开、别名搜索、准入说明、草稿与发布进度 |
| 消息 | 会话/通知分段控件、真实待处理与未读数量、文字头像降级、时间、系统通知预览、搜索、空状态和联系处理 |
| 我的 | 资料入口、发布/收藏/草稿/预约四项真实计数、积分入口、八项功能、服务及账户设置列表 |
| 其余页面 | 共用新页头、卡片、搜索、表单、按钮、状态与安全区，分别输出页首/中段/页尾截图 |
| 地图 | 原生范围读取8秒超时、重试及返回信息列表，避免持续加载；底图与实际地图服务仍待验收 |
| 后台 | 暖白与玫瑰色页面，页面内多行审核表单、操作确认弹窗、焦点恢复、弹窗排队及会话切换保护 |
| 资源 | 原始Logo、新分类图标和发布插画进入项目，统一复用图标色板，清理325份重复路由图标，共340465字节 |
| 本地环境 | 统一3101，start_local.ps1为标准入口，start_sorting_local.ps1为兼容入口，运行日志及进程状态保存到源码外 |

## 七频道与27行业

| 发现频道 | 行业 |
| --- | --- |
| 招聘 | 招聘求职 |
| 房产 | 房屋租售 |
| 闲置 | 二手闲置 |
| 商家 | 美食餐饮、商场购物、酒店住宿 |
| 服务 | 家政维修、汽车用车、丽人美业、亲子母婴、教育培训、家居家装、健康医疗、运动健身、婚庆婚恋、企业商务、宠物服务、养老助残、殡葬服务、金融保险 |
| 活动 | 玩乐休闲、旅游度假 |
| 便民 | 同城信息、交通出行、快递物流、农业农村、政务便民 |

归并规则由discovery-channels.js统一维护。首页和全部分类入口自动进入所属频道，发现列表及从发现进入的搜索使用channel参数。服务端在分页之前按行业归并，分类浏览与发布资格分别校验。

## 已落实的业务决定

论坛型项目C08G01S03、C08G02S05、C08G03S04保留目录记录并关闭发布。失物招领和寻物启事继续进入实用信息审核。公开点赞、评论和回复接口返回关闭状态，详情页移除相应控件。

历史论坛内容的列表、详情、媒体可见性、行业公开入口、首页目标和推广资格使用统一范围判断。客户端缓存同步过滤已关闭项目。历史内容与留言保留本人记录和删除入口，无分类的历史社区内容需要运营复核归类后再公开。

积分兑换继续作为非现金权益记录，预约申请与双方业务进度保留。回归中修复内部UUID偶然包含手机号形状数字时被误判的问题，人工积分调整仍使用材料引用校验。

## 运行与数据证据

标准启动命令为 `pwsh -NoProfile -File scripts/start_local.ps1`。需要重新载入代码时使用 `pwsh -NoProfile -File scripts/start_local.ps1 -Restart`。本地API地址为 http://127.0.0.1:3101。

持久开发库经过备份、实际恢复、迁移预演和原数据对比后应用030–032，原69张表、1335条记录比对通过。当前数据库迁移为32份。备份与恢复演练证据见同目录上级的home-corrections交付记录。历史迁移校验通过。[数据库升级证据](../vm-design/home-corrections-2026-11-12/LOCAL_DEVELOPMENT_UPGRADE.json)

微信开发者工具预览包已验证为1885081字节，低于2MB主包限制。预览上传成功。正式发布仍需要HTTPS域名、微信域名校验、真实服务及主体配置。

## 截图与测试

覆盖27路由的101张截图及33组胶囊/导航几何检查已完成，运行异常为0。当前截图、源码指纹、环境、胶囊几何和存储恢复结果由visual/RESULTS.json记录。截图中的“界面验收”信息来自隔离PostgreSQL库。加载、错误、空状态通过明确的渲染状态注入检查。home-local-data.png来自恢复后的实际本地API。

后台表单与确认弹窗使用真实Edge浏览器渲染，截图及结果保存在admin目录。此检查覆盖表单交互和确认反馈。[后台弹窗结果](admin/RESULTS.json)

最终测试数据和包体积见EVIDENCE.json。各组测试存在覆盖重叠。全量PostgreSQL回归覆盖418个分类契约，包含关闭项目的拒绝路径。


| 验证组 | 结果 |
| --- | --- |
| 默认回归 | 474项，459通过，0失败，15项数据库测试由专项执行 |
| 全量PostgreSQL | 1024项通过，0失败，0跳过 |
| 最新范围、账本及资源回归 | 52项通过，0失败，0跳过 |
| 分类入口与频道联动 | 33项通过，0失败 |
| 后台弹窗真实浏览器 | 2组通过 |
| 微信预览包 | 1885081字节，上传预览通过 |
| 页面源码与截图指纹 | 完全匹配 |

[机器验收证据](EVIDENCE.json) · [截图与原生几何结果](visual/RESULTS.json) · [资产来源与生成记录](ASSET_SOURCES.md)

## 逐页截图

已逐一查看27个页面的页首截图，并复核主页面、发布目录、地图降级和实际本地首页。用户视觉验收记录待确认。

| 页面 | 页首 | 中段 | 页尾 |
| --- | --- | --- | --- |
| 首页 | [查看](visual/home-normal.png) | [查看](visual/home-middle.png) | [查看](visual/home-bottom.png) |
| 发现 | [查看](visual/discover-normal.png) | [查看](visual/discover-middle.png) | [查看](visual/discover-bottom.png) |
| 发布 | [查看](visual/publish-normal.png) | [查看](visual/publish-middle.png) | [查看](visual/publish-bottom.png) |
| 消息 | [查看](visual/messages-normal.png) | [查看](visual/messages-middle.png) | [查看](visual/messages-bottom.png) |
| 我的 | [查看](visual/me-normal.png) | [查看](visual/me-middle.png) | [查看](visual/me-bottom.png) |
| 地区 | [查看](visual/regions-normal.png) | [查看](visual/regions-middle.png) | [查看](visual/regions-bottom.png) |
| 信息详情 | [查看](visual/detail-normal.png) | [查看](visual/detail-middle.png) | [查看](visual/detail-bottom.png) |
| 预约申请 | [查看](visual/booking-normal.png) | [查看](visual/booking-middle.png) | [查看](visual/booking-bottom.png) |
| 我的发布 | [查看](visual/my-posts-normal.png) | [查看](visual/my-posts-middle.png) | [查看](visual/my-posts-bottom.png) |
| 我的预约 | [查看](visual/my-bookings-normal.png) | [查看](visual/my-bookings-middle.png) | [查看](visual/my-bookings-bottom.png) |
| 商家工作台 | [查看](visual/merchant-normal.png) | [查看](visual/merchant-middle.png) | [查看](visual/merchant-bottom.png) |
| 站内会话 | [查看](visual/chat-normal.png) | [查看](visual/chat-middle.png) | [查看](visual/chat-bottom.png) |
| 服务管理 | [查看](visual/merchant-services-normal.png) | [查看](visual/merchant-services-middle.png) | [查看](visual/merchant-services-bottom.png) |
| 商家预约 | [查看](visual/merchant-bookings-normal.png) | [查看](visual/merchant-bookings-middle.png) | [查看](visual/merchant-bookings-bottom.png) |
| 员工与权限 | [查看](visual/merchant-team-normal.png) | [查看](visual/merchant-team-middle.png) | [查看](visual/merchant-team-bottom.png) |
| 搜索 | [查看](visual/search-normal.png) | [查看](visual/search-middle.png) | [查看](visual/search-bottom.png) |
| 分类 | [查看](visual/categories-normal.png) | [查看](visual/categories-middle.png) | [查看](visual/categories-bottom.png) |
| 地图 | [查看](visual/map-normal.png) | [查看](visual/map-middle.png) | [查看](visual/map-bottom.png) |
| 发布表单 | [查看](visual/publish-form-normal.png) | [查看](visual/publish-form-middle.png) | [查看](visual/publish-form-bottom.png) |
| 草稿箱 | [查看](visual/drafts-normal.png) | [查看](visual/drafts-middle.png) | [查看](visual/drafts-bottom.png) |
| 手机号验证 | [查看](visual/verification-normal.png) | [查看](visual/verification-middle.png) | [查看](visual/verification-bottom.png) |
| 同城资讯 | [查看](visual/information-normal.png) | [查看](visual/information-middle.png) | [查看](visual/information-bottom.png) |
| 积分权益与推广 | [查看](visual/commerce-normal.png) | [查看](visual/commerce-middle.png) | [查看](visual/commerce-bottom.png) |
| 行业业务与核验 | [查看](visual/industry-normal.png) | [查看](visual/industry-middle.png) | [查看](visual/industry-bottom.png) |
| 微信登录 | [查看](visual/login-normal.png) | [查看](visual/login-middle.png) | [查看](visual/login-bottom.png) |
| 隐私政策 | [查看](visual/legal-normal.png) | [查看](visual/legal-middle.png) | [查看](visual/legal-bottom.png) |
| 业务进度 | [查看](visual/business-normal.png) | [查看](visual/business-middle.png) | [查看](visual/business-bottom.png) |

[实际本地首页](visual/home-local-data.png) · [发布左右目录](visual/publish-directory.png) · [发现筛选弹层](visual/discover-filters.png) · [后台审核表单](admin/review-form.png)

## 待验收事项

- 用户逐页视觉确认及像素级对照。
- 按用户安排，Android和iPhone真机字体、滚动、键盘、弹层与性能验收待设备到位。
- 模拟器地图底图显示、实际地图服务与腾讯地图Key配置。当前超时降级与列表入口已验证。
- 正式HTTPS API域名、微信域名校验、运营主体、隐私联系、微信登录及手机号授权配置。
- 后台个人管理员账号、认证强化、生产媒体存储、通知推送、监控与异地备份，纳入后续上线整改。

## 修改文件与回滚

CHANGED_FILES.json列出本轮相对于9439f05基线的修改、增加与删除文件，包含图标复用清理和测试证据。27个页面及五导航通过结构回归，418分类ID通过目录核对。

代码回滚以9439f05基线为参照，可在独立工作树中查看原版本并按交付提交回退。回退分类与公开范围文件时应同时核对用户已确认的查询型业务范围。持久数据库版本为32份迁移，恢复演练备份保存在源码外。

查看基线可使用 `git worktree add ../city-life-miniapp-pearl-baseline 9439f05`。当前交付的Git提交与源码指纹用于确认版本。
