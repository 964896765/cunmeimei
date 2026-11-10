# 个人中心整合、发布与浏览闭环 · 2026-11-04

本轮在既有26页、五导航、六主题及PRISM GLASS上修改，复用兑换、推广、核验、商家和行业后台。没有新增数据库迁移，没有导入真实库的测试业务数据，没有访问或部署生产。

## 审计与方案

| 现状问题 | 修改路径 | 方案与验收条件 |
| --- | --- | --- |
| “我的”积分、推广、商家及行业入口分散 | `miniprogram/pages/me/index.{js,wxml,wxss}`、`points-panel.wxml`、`utils/auth-intent.js` | 主页面统一为积分中心、服务中心；登录返回保留目标。兑换、记录、推广各自进入已有内页；入驻、行业核验及业务记录可直接到对应位置 |
| 招聘、活动、公共频道进入搜索时被改为全部 | `miniprogram/utils/navigation.js`、`pages/discover/index.js`、`pages/search/index.js` | 使用同一查询约定，保留频道、行业、区县、时间、图片和排序；空关键词可按类别浏览 |
| 区县有时只改标签，行业筛选缺少层级 | `utils/browse-query.js`、`components/browse-filters/index.{js,json,wxml,wxss}`、发现/搜索/地图的页面及组件注册 | 统一行业→分组→项目三级选择和区县/街镇选择；实际接口包含有效区划码；返回页面保留局部选择，主动换城市重新核对区划 |
| 地图缺少搜索入口，容易丢失视野与主体条件 | `miniprogram/pages/map/index.{js,json,wxml,wxss}`、`pages/search/index.{js,json,wxml}` | 从地图读取实际视野；搜索继续使用地图接口，保留公开位置、主体核验等条件；返回同步；范围无效时明确报错 |
| 发布配置失败可能误报未开放，发布后缺少统一进度入口 | `miniprogram/pages/publish/index.{js,wxml,wxss}`、`utils/navigation.js` | 加载、失败、重试和实际准入分开；418项目沿用43居民表单及375行业流程；发布进度进入服务中心；支持定向项目定位 |
| 行业表单离开缺少保存选择，待登录请求可能引用变动后的字段 | `miniprogram/pages/industry/index.js`、`utils/workflow-client.js` | 保存并离开、放弃、继续编辑；服务端确认前保持页面；地区/图片也触发离开提醒；登录前捕获请求完整快照，旧账号确认失效 |
| 旧邻里信息与公共频道断开 | `backend/src/pg-repository.js`、`backend/src/memory-repository.js` | 公共频道同时查询已审核的旧community信息，保留原类型、地区和审核条件；没有公开位置的内容不进入地图 |

## 本轮业务与数据衔接

| 链路 | 页面与数据流 |
| --- | --- |
| 积分 | 我的→积分中心→奖励/账本/申诉/规则；权益兑换、兑换记录、自助推广进入已有commerce页，继续使用原积分冻结、核销、取消和退还事务 |
| 服务 | 我的→服务中心→商家入驻与管理、行业核验、本人业务、发出/收到申请、举报答复；核验材料、处理记录和会话仍由既有权限控制 |
| 发布 | 发布目录→实际准入配置→居民或行业表单→草稿/提交审核→本人记录；公开展示仍取决于审核、有效期、地区开放和必要资质 |
| 定向浏览 | 首页行业→发现→三级行业/地区筛选→搜索→公开详情；公共频道兼容已审核旧邻里内容 |
| 地图 | 发现筛选→地图实际视野→地图搜索→主体/时间等条件→返回地图重查；地图只使用批准的公开经营位置，不为其他内容补造坐标 |
| 安全边界 | 游客浏览、交互登录、独立手机号授权、会话过期及注销继续复用既有实现；本人数据和后台接口保留服务端权限校验 |

418项验收的是已有流程承接和路由完整性，不代表418项已获生产运营资格或可绕过审核发布。地图当前供给为已批准公开位置的商家和可预约服务，其他频道可以为空。

## 验证与证据

最终结果以 [机器汇总](centers-browse/summary.json) 与 [完整日志](centers-browse-full-acceptance.log) 为准；各测试范围重叠，不累加为独立用例总量。

- 主回归546项、严格隔离PostgreSQL141项；端到端15项、权限9项、入驻4项通过。
- 非数据库单独运行422项通过，10项PG测试跳过；这些PG项目已在完整隔离库运行中执行，不能把跳过算通过。
- 26页结构、34份WXML嵌套与历史路由/配色检查通过。
- 69表、40张非空表的备份恢复与全部内容比对通过。
- 微信工具本轮37项、登录34项、原业务58项通过，结果见 [本轮页面](centers-browse/ui-result.json)、[登录](login-v1/ui-result.json)、[原业务](business-workflows/ui-result.json)。原认证存储保持一致，运行时覆盖已撤回；隔离容器、网络和数据卷已清理。
- 已人工查看本轮7张截图：[我的](centers-browse/personal.png)、[积分中心](centers-browse/points.png)、[服务中心](centers-browse/service.png)、[发现](centers-browse/discovery.png)、[地图](centers-browse/map.png)、[地图搜索](centers-browse/map-search.png)、[深色大字](centers-browse/service-dark-large.png)。抽屉保留搜索与结果空间，服务中心按经营/业务分组，积分中心按余额/操作/记录分区；六主题大字控件尺寸与顶部胶囊避让通过原生检查。
- 本轮新增客户端测试见 `backend/tests/centers-browse.test.js`，深层请求快照见 `workflow-client.test.js`，真实公共频道兼容见 `workflows-integration.test.js`。

复验命令：

```powershell
python scripts/check_project.py
python scripts/check_v25.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test_pg_local.ps1 -FullRegression -LoginUi -WorkflowUi -CentersUi
node scripts/centers_browse_summary.js
```

微信验收期间冻结小程序源码，身份、选择器和确认回调使用明确标识的本机夹具；API、业务写入和PostgreSQL是真实隔离实例。原认证存储对比且恢复，不将夹具写入实际开发库。此证据不等于微信真实授权或真机验收。

## 发布边界

本机3101服务已加载本轮后端更新；3100未操作。数据库迁移仍为001–029，本轮未修改已应用迁移。

正式发布配置检查仍有 `DOMAIN_CHECK_MUST_BE_ENABLED`、`PRIVATE_DOMAIN_CHECK_MUST_BE_ENABLED`、`HTTPS_PUBLIC_API_REQUIRED`。用户暂缓的真机配合、真实运营主体和隐私邮箱未补造；真实微信授权、平台隐私指引、业务资格、实际权益与广告供给及生产运营门禁仍待验收。
