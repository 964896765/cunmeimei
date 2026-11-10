# 配色冻结后的页面结构实施记录

后续更新：用户已要求将“更多”改为快捷管理、地区页改为城市选择并接入原生地图。最新范围、测试与限制见 [城市地图与快捷入口实施记录](CITY_MAP_SHORTCUTS.md)。下文记录前一批次，不代表当前地图仍是占位页面。

日期：2026-10-18。软件版本仍为 0.25.0，直接修改原工程；没有使用 Git、创建版本目录、生成 ZIP、复制整套工程或部署生产。本文记录本轮实际落地范围，不代表 V1.0 总方案或全项目品质验收完成。

## 分类来源与边界

用户提供的 JSON 和 Markdown 已逐项核对：27 行业、83 展示组、418 项目，合计 528 个唯一 ID，项目名称无重复，Markdown 中 418 个 ID/名称全部一致。原始版本为 `2.0-audit`，属于建议稿，不等于正式行业准入。

- 审计结果：[industry-import-audit.json](industry-import-audit.json)。原 JSON 的 SHA256 为 `62a0cc70baa2d955421ef3244cf4fe313e4d2fb0185fe6d0f42fa21fed829587`。
- 规范源：`miniprogram/data/industry-catalog.json`；微信加载模块由 `scripts/build_classification.js` 生成，保留原 ID/名称/治理说明。
- 全目录可浏览、可按名称及项目别名检索；没有批量写入数据库业务分类。
- 43 个明确项目复用已有表单：闲置 15、生活服务需求 17、房屋租赁 6、邻里信息 5。服务需求发布不代表发布者取得专业服务资质。
- 其他 375 个项目只读。招聘、医疗、殡葬、政务、金融等不因展示目录而自动获准发布。
- 分类引用存入既有 JSONB `attributes.categoryId/categoryVersion`；前后端共享白名单校验。无效版本、错误类型或未开放项目拒绝提交。旧信息没有分类引用时继续兼容。
- 七模板稳定编码 `JOB/PROPERTY/GOODS/MERCHANT/SERVICE/EVENT/PUBLIC` 保留为产品合同；不声称已具备七套完整发布能力。既有 `community` 类型不强制改写为活动或公共信息。

## 已实施页面与交互

原 15 页全部保留，追加全局搜索、完整目录和地图入口，共 18 页，五个原生导航不变。

| 页面 | 本轮行为与边界 |
| --- | --- |
| 首页 | 地区、统一搜索、三张平台使用指南、两行快捷入口、同城资讯状态；普通信息流移到发现。资讯没有真实选稿源时显示准备状态，指南不冒充推广库存。快捷入口按账号保存，可添加、移除、恢复默认和长按拖动，“更多”固定最后。 |
| 发现 | 推荐、招聘、房产、闲置、商家、服务、活动、便民八频道；单列连续信息卡、细线分隔、真实收藏。上滑隐藏频道/悬浮控件/原生 Tab，下滑恢复，离页恢复 Tab。活动与便民未接通，明确提示。 |
| 发布 | 左侧 27 行业，右侧组/项目，右侧标题行搜索跨行业检索；只有明确白名单可打开既有表单。继续保留草稿、预览、图片和审核。 |
| 消息 | 默认真实联系申请与业务通知；不将本地演示聊天当作完整即时通信。 |
| 我的 | 发布、草稿、收藏、浏览记录；商家管理为次级入口。浏览记录只存本机当前账号的信息 ID，展示前重新检查公开详情，下架内容不展示。 |
| 全局搜索（新） | 关键词、地区、类型、分类 ID、排序、分页、去重、错误重试。修复中文参数重复编码、刷新丢失地区、切换身份残留结果和迟到响应覆盖问题。 |
| 分类目录（新） | 27 行业名称检索，进入统一分类搜索。 |
| 地图入口（新） | 未取得经核验的公开坐标，明确显示暂不可用；地区选择可转列表搜索，不生成虚假点位、不暴露个人住址。 |

## 配色与路由

`miniprogram/utils/palettes.js` 和 `scripts/prism-color-baseline.json` 未改变色值及冻结合同。新搜索继承发现、目录继承发布、地图继承地区页色族，使用 `page-accent-route.js` 显式映射。轮播指示点读取已有主题边界色。六主题、用户偏好、大字和减少动态效果保留。

原始配色阶段 15 页截图仍在 `prism4-before-*.png`；当前 18 页及主题样本在 `prism4-after-*.png`。新增三页没有虚构“修改前”截图。原图与新图含不同时刻的测试数据，不用于像素性能比较。逐页索引与当前状态另见 [PAGE_STRUCTURE_PAGE_MATRIX.md](PAGE_STRUCTURE_PAGE_MATRIX.md)。

## 代码修改清单

以下路径均相对项目根目录；目录表示该页的 JS/WXML/WXSS/JSON 文件。

| 范围 | 文件 | 作用 |
| --- | --- | --- |
| 规范数据 | `miniprogram/data/industry-catalog.json`、`industry-catalog.js` | 保留来源并生成微信可加载模块 |
| 分类合同 | `miniprogram/utils/classification-contract.js`、`classification.js`、`feed-query.js` | 共享准入、目录搜索、频道与查询构造 |
| 页面 | `miniprogram/pages/home/`、`discover/`、`publish/`、`messages/`、`me/`、`detail/index.js` | 五入口结构、信息流、真实收藏、浏览记录 |
| 新页面 | `miniprogram/pages/search/`、`categories/`、`map/`、`miniprogram/app.json` | 独立搜索、目录、地图退路及路由注册 |
| 共享组件 | `miniprogram/components/content-card/` | 连续信息流布局与独立收藏事件 |
| 客户端共享 | `miniprogram/utils/navigation.js`、`shortcuts.js`、`recent.js`、`route-query.js`、`page-accent-route.js`、`theme.js` | 导航、账号隔离、本机记录、安全解码、冻结配色继承 |
| 服务端 | `backend/src/product-repository.js`、`account-drafts.js`、`server.js`、`pg-repository.js`、`memory-repository.js` | 分类引用校验，草稿持久化，SQL 分页前按分类筛选，内存实现保持一致 |
| 测试与工具 | `backend/tests/classification-contract.test.js`、`page-quality.test.js`、`postgres.test.js` | 分类合同、中文查询、身份切换、迟到响应、真实分类 SQL 回归 |
| 验收脚本 | `scripts/build_classification.js`、`check_page_structure_ui.js`、`check_local_business.js`、`check_prism4_colors_ui.js`、`check_v25.py` | 数据生成、真实页面业务、原业务回归、18 页渲染、原路由与迁移完整性 |

未修改历史迁移 001–005，未新增数据库结构，未降低审核和权限。`check_v25.py` 仅对明确批准的三条追加路由及既有冻结色规范化后检查原配置哈希，原 15 路由及五导航仍受保护。

## 自动化与真实数据库证据

| 命令或验收 | 通过 | 失败 | 跳过 | 证据 |
| --- | ---: | ---: | ---: | --- |
| `test_pg_local.ps1 -FullRegression` 内 `npm run verify:pg` | 30 | 0 | 0 | [完整回归日志](pages-structure-regression-final.log)，隔离 PG16 健康、迁移、真实读写、并发及清理 |
| 同次 `npm test` | 138 | 0 | 0 | 同上，包含 PG 及下列重复专项，不可累加成独立用例数量 |
| `npm run test:e2e` | 15 | 0 | 0 | 同上 |
| `npm run test:permissions` | 9 | 0 | 0 | 同上 |
| `npm run test:merchant-application` | 4 | 0 | 0 | 同上 |
| 搜索/生命周期专项 | 15 | 0 | 0 | [专项日志](pages-search-stability-tests.log)，包含主套件中的测试 |
| 新页面真实 UI→API→PG 流程 | 27 | 0 | 未跳过断言 | [UI 日志](pages-structure-ui-current.log)、[结构化结果](pages-structure-ui-result.json) |
| 原有发布/审核/商家/预约/五导航回归 | 26 | 0 | 未跳过断言 | [原业务日志](pages-existing-business-final.log)、[结构化结果](local-business-result.json) |
| 微信全部路由渲染 | 18 页 | 0 | 未跳过页面 | [渲染日志](pages-structure-render-final.log)、[机器结果](prism4-after-colors-result.json) |
| 主题/大字/表单/游客状态 | 10 样本 | 0 | 未跳过断言 | 同上，不是全部页面×全部主题的完整组合 |

`npm install` 已由全回归脚本执行，结果为 up to date。仅使用唯一 Compose 项目、随机 loopback 端口和项目独占卷，脚本验证本次容器/网络/卷清理通过，持久开发数据库继续保留。

WXML 19 文件嵌套检查、18 页项目结构检查、126 个 JavaScript 文件语法及 V0.25 原配置/历史迁移完整性检查通过，日志 [pages-structure-static-final.log](pages-structure-static-final.log)。微信 CLI `auto` 已实际成功，日志 [pages-structure-current-compile.log](pages-structure-current-compile.log)。原业务流程和逐页渲染的最终结果见逐页矩阵。

新 UI 验证包括：快捷入口持久化、27 目录、项目搜索、真实账号草稿、发布待审、公开隔离、实际审核、中文分类搜索、原生滚动、真实收藏、地图列表退路、浏览记录、我的草稿和联系申请。发布规范勾选由 SDK 触发真实 checkbox-group change 处理器；物理手指点击、键盘遮挡及拖动手感仍须真机验收。

之前失败日志保留。发现页选择器失败经 DOM 取证定位：微信 SDK 暴露完整组件路径而非 WXML 别名，现用真实组件的 `layout="stream"` 属性读取，继续断言组件数量、标题、按钮及实际收藏，没有跳过渲染断言。中文搜索失败则是应用参数重复编码缺陷，已修复并补回归。

## 明确未通过与未完成

- 正式发布配置检查退出 1：[微信发布检查](pages-wechat-release-check.log)，原因是域名检查关闭、开发登录开启、服务地址为本机 HTTP；当前是本机开发状态。
- 综合发布门禁退出 1：[发布准备检查](pages-release-readiness.log)。该独立命令没有配置隔离测试库，报告 `PG_TEST_DATABASE_URL_REQUIRED`；另一次隔离全回归已真正执行 PG 30 项通过，两者不能混淆。生产配置、主体准入和设备人工签核仍不满足。
- Android/iPhone 真机、读屏器、持续弱网、低端机、键盘、小屏和全部主题×全部页面组合未完成验收。截图及模拟器成功不能替代这些结论。
- 没有实机性能基线，不声称速度或帧率提升。分类 SQL 在分页前过滤，仍需实际内容规模下的查询及索引评估；本轮未因推测而增加索引。
- 真实首页选稿/推广数据、公开地图坐标与聚合、完整即时通信、JOB/EVENT/PUBLIC 等完整模板及特殊行业资质、积分资源兑换仍未完成，不属于本轮已接通能力。
- 不开启生产部署、真实支付或收费推广。配色继续冻结；后续按业务依赖逐项实现与验收。
