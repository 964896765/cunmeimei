# 导向与条件统一实施 · 2026-11-05

统一规划见 [六维规则、入口矩阵与验收条件](NAVIGATION_FILTER_PLAN_20261105.md)。本轮仍为26页、五导航和六主题，继续复用现有发布、兑换、推广、核验及认证权限；没有新增迁移，也没有访问生产。

## 已落地的规则

| 行为 | 现在的规则 |
| --- | --- |
| 全部与推荐 | 信息频道的首项改为“全部”，图标改为分类网格；“综合推荐”只属于排序，不再用同一标签表达两种含义 |
| 完整分类 | 首页“更多”进入27行业浏览目录，点击直接发现；“管理常用分类”为同页独立编辑模式，保存才更新首页入口，返回可放弃本次编辑 |
| 新入口与继续浏览 | 首页/分类显式定向进入时建立新条件，清除上一次入口遗留的词、时间、图片、距离；底部导航和普通返回继续原条件 |
| 行业与频道 | 两者按交集查询。切换频道保留行业、词、区划、时间和图片，只清除该频道不支持的距离或排序，并显示说明 |
| 空词浏览 | 搜索初始页也能选择频道、排序与附加筛选；无需先输入一个词才能使用筛选 |
| 关键词 | 输入、待提交与已提交状态分开；用户选择筛选时使用当前输入；清空操作同时清除实际查询词，不再恢复旧提交词 |
| 重置 | 保留城市、频道和关键词；清除行业、区划、时间、图片、半径、主体限制并恢复默认排序；地图继续保持当前视野 |
| 逐项移除 | 新共用组件展示已选附加条件，可移除单项；行业和区划由原选择器统一呈现，不再另放重复的行业条 |
| 时间 | 发现、搜索、地图及后台解析统一支持不限/24小时/3天/7天/30天/90天，跨页传递不缩减 |
| 合法条件 | 搜索排序按频道能力显示；价格比较限房产/闲置/服务，定位距离限全部/商家/服务。定位只在用户选择距离时请求，已有来源位置按原意图传递 |
| 查询返回 | 发现→搜索成功查询后回流原条件；失败或过期响应不回流；条件相同不重新清空原分页，变更后才刷新 |
| 地图范围 | 地图只提供全部/商家/服务三个实际可定位频道。其他源频道有明确解释及原列表返回入口；进入地图后不继续暗中使用列表半径、价格或热度排序，而是说明范围变更并保留原列表可返回 |
| 地图搜索换城市 | 先返回地图再选城市，重心与实际视野更新后再查询；不将旧城市视野用于新城市 |
| 空结果 | 支持移除已选条件或调整频道/行业/地区；显式“浏览当前城市全部信息”才扩大列表条件，地图空结果不会自动转成全市普通列表 |
| 展示与视觉 | 搜索复用全局主题变量，移除局部强制白底/色系；分类页增加胶囊避让和安全区域；大字继续使用已有显示偏好 |

## 修改文件

- 统一规则与序列化：`miniprogram/utils/browse-query.js`、`navigation.js`、`business-templates.js`、`map-filters.js`、`discovery-sorts.js`。保留既有feed/map接口及各业务权限。
- 页面：`pages/categories/index.{js,json,wxml,wxss}`、`pages/home/index.js`、`pages/discover/index.{js,json,wxml}`、`pages/search/index.{js,json,wxml,wxss}`、`pages/map/index.{js,json,wxml}`。
- 组件：`components/channel-tabs/index.js`、新增 `components/active-conditions/index.{js,json,wxml,wxss}`。原三级行业/区划选择器继续复用。
- 验证：`backend/tests/centers-browse.test.js`、`page-quality.test.js`、`channel-tabs.test.js`、`home-shortcuts.test.js`、`discovery-sorts.test.js`、`geography.test.js`、`workflows-integration.test.js`；新增 `scripts/check_navigation_filters_ui.js`、`navigation_filters_summary.js` 和便携PG验证入口。
- 图标：`scripts/build_channel_icons.js` 与六主题“全部”频道图标；其余频道继续使用原图标体系。

薪资、租售意图、成色、活动名额等专属字段仍由既有业务表单与详情承接。本轮没有添加接口不处理的假筛选，没有把未取得资格的行业宣称为可无条件上线。

## 证据与环境

本轮主回归559项、严格PG142项通过；端到端15项、权限9项、入驻4项通过。微信开发者工具导航专项27项、原中心37项通过；六主题大字与胶囊避让通过，5张专项截图已人工查看。69表、40张非空表恢复及内容比对通过。测试范围重叠，不相加为独立用例总数。

最终计数、原认证存储恢复、截图和本机服务状态以 [机器汇总](navigation-filters/summary.json) 为准。当前批次证据为 [后端各套件与初次界面验收](navigation-portable-acceptance.log)、[导航界面最终复验](navigation-ui-final.log)、[恢复演练](navigation-portable-recovery.log)。专项71项已通过；初始失败日志保留，旧断言/模拟模块导入已按实际新规则更新。两处原生按钮点击后的状态读取早于界面更新，脚本补为等待对应状态后复验；原失败记录和截图保留，不将失败那次计为通过。

截图：[完整分类](navigation-filters/category-directory.png)、[发现条件](navigation-filters/discovery-conditions.png)、[地图视野搜索](navigation-filters/map-search-conditions.png)、[PRISM大字](navigation-filters/search-prism-large.png)、[深色大字](navigation-filters/search-dark-large.png)。原认证存储对比一致，运行时夹具覆盖已撤回，所有已启动的临时PG集群均已停止。

Docker Desktop启动时因旧IPC端点不可访问而退出。本轮已尝试重启并保留不可用的运行时端点目录备份；没有执行Docker恢复出厂、移除数据卷或改动数据库内容。现有开发库没有被切换到测试库。本轮使用从EnterpriseDB官方下载并记录SHA256的PostgreSQL16.9便携二进制，独立临时集群、随机回环端口和测试库进行验证，退出后关闭并清理集群。下载来源与哈希见 [运行工具记录](navigation-filters/portable-postgres.json)。

最终检查本机3101服务未就绪，本轮没有重启持久开发服务，也没有将默认API指向测试夹具。恢复原Docker数据库连接后，才可对原开发库执行现有受控服务启动脚本；不把隔离验收通过描述成原开发环境已恢复。

首次便携PG启动时的失败目录 `C:/Users/chejun/AppData/Local/Temp/citylife-navigation-cluster-ea40b6f67f974522b8ee349657ee8e09` 对应进程已停止。自动安全检查阻止了该目录的递归清理，未提供更具体原因，因此保留；正式执行成功的隔离验收集群已由各自脚本停止并移除。没有绕过删除限制。

便携复验命令（`<bin>`为官方便携版bin目录）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test_pg_portable.ps1 -BinariesPath '<bin>' -FullRegression -CentersUi -NavigationUi
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test_pg_portable.ps1 -BinariesPath '<bin>' -RecoveryOnly
node scripts/navigation_filters_summary.js
```

Docker恢复后也可运行 `scripts/test_pg_local.ps1 -FullRegression -CentersUi -NavigationUi`。原协议、隐私与真实微信/手机号、HTTPS和合法域名、微信平台隐私指引、Android/iPhone真机、实际行业资格和生产运营门禁仍待独立验收。没有部署生产，开发工具身份/选择器回调夹具不等于真实微信授权。
