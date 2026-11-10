# 阶段 1 验收报告

## 权限矩阵

| 能力 | superadmin | operator | verifier |
| --- | --- | --- | --- |
| 内容审核、地区配置、用户风险、积分运营 | 允许 | 允许 | 拒绝 |
| 商家证照、主体及专项资质核验 | 允许 | 拒绝 | 允许 |
| 隐私请求、注销执行 | 允许 | 独立授权 | 独立授权，注销还要求运营角色 |
| 私密消息及举报证据 | 允许 | 独立授权 | 独立授权 |
| 未登记后台路由 | 拒绝 | 拒绝 | 拒绝 |

每个角色仍要求有效管理会话，写入要求正确 CSRF。普通用户会话不能代替管理会话。核验员的队列与工作台只显示核验任务，运营人员读取到的商家队列对证照字段脱敏。

## 配置与运维入口

- `ADMIN_PASSWORD` 对应 operator。
- `VERIFICATION_ADMIN_PASSWORD` 对应 verifier。
- `SUPER_ADMIN_PASSWORD` 对应 superadmin。
- `OPERATOR_ADMIN_PERMISSIONS`、`VERIFIER_ADMIN_PERMISSIONS` 可配置 privacy、evidence，逗号分隔，默认空。
- `npm start` 要求 `NODE_ENV=production`。
- 本地开发使用 `node --env-file=.env.local src/server.js`，工作目录为 backend。
- 正式预检使用 `npm run preflight`，本地配置检查使用 `node src/preflight.js --development`。

## 发布校验

新提交必须提供已开放的细分类目、当前目录版本、所属城市和区县。闲置要求成色、有效金额或面议与图片。房源要求意向、面积、户型与价格。不同业务保留对应字段。旧模板版本、缺省版本均无法放宽当前提交要求。

编辑支持分别替换图片和补充字段。省略补充字段时保留现有分类。显式清空已有分类被拒绝，失败事务保留原状态及版本。最终字段同时进入业务准入和内容风险校验。

## 验收状态

阶段 1 P0 安全代码验收通过。

- 默认回归 443 通过、0 失败、14 数据库项跳过。
- 独立 PostgreSQL 16.9 严格门禁 587 通过、0 失败、0 跳过，覆盖默认套件的全部数据库项。
- P0 专项最终复跑 5 通过、0 失败、0 跳过。
- 418 个分类的实际 HTTP 与数据库流程全部通过。
- 72 张表备份恢复内容校验通过，包含 47 张非空表。
- 315 份 JavaScript 语法检查、37 份 WXML 结构检查和既有 smoke 通过。

完整记录见 TEST_RESULTS.md、TEST_RESULTS.json 以及既有分类流程结果 `docs/project-journeys/integration-result.json`。这些验证使用明确标记的测试账号和提供方夹具，微信真机验收按后续阶段记录。

## 后续验收项目

27 页设计改造与真机截图、真实微信凭据验证、生产容量与部署、特殊行业运营准入仍属于后续阶段。当前验收覆盖本轮代码、HTTP 和隔离数据库安全整改。
