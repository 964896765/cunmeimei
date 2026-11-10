# 上线前复查入口 · 2026-11-02

同日预约恢复补充：新客户端使用申请编号及本人核对接口，后端与025迁移需要一同更新；不要只替换前端就连接旧API。最新隔离回归为主套件466、严格PG111，均0失败/跳过；见 [预约恢复报告](../docs/BOOKING_SUBMISSION_RECOVERY.md)。持久开发库未自动升级。

`npm run check:prelaunch` 检查源码、21页/WXML、历史基线、业务冒烟、非PG回归及实际发布配置，报告写入 `../docs/prelaunch-checks-result.json`。开发配置被阻断时退出码为1；真实数据库、恢复、真机和生产配置仍单独验收。Node最低版本20.9；开发工具依赖锁定及二维码兼容说明见 [本轮报告](../docs/PRELAUNCH_REVIEW_20261102.md)。

# V0.25 验证补充

Windows Node 20 使用 `npm test` 显式发现 tests/*.test.js。真实 PostgreSQL 全回归请从项目根运行 `scripts/test_pg_local.ps1 -FullRegression`，不要手填生产数据库 URL。独立 `npm run verify:pg` 未配置隔离数据库时必须返回失败。最终主套件 82 通过、0 失败、0 跳过；详见 ../docs/V25_HANDOFF.md。

# V0.19 增量说明

新增店主 / 经理的服务暂停和重新提交审核接口。使用既有 service_catalog `draft` 状态，无需新迁移。
执行 `npm test`（包含内存接口及模拟 PG SQL 合同检查）或 `npm run test:e2e`（本地 HTTP 全业务回归）。
PostgreSQL 实例不可用时，`npm test` 仍会跳过真实数据库集成套件，**不构成数据库验收**；严格验收参见 `npm run verify:pg` 与 `../scripts/test_pg_local.ps1`。

# 同城生活 API · V0.7

正式配置请先读根目录 `README.md` 与 `docs/V07_HANDOFF.md`。

- `npm test`：纯 Node 测试；无 `PG_TEST_DATABASE_URL` 时会跳过真实 PG 集成测试。
- `npm run preflight`：生产部署的环境变量与私有文件路径静态检查。
- `npm run migrate`：需配置 `DATABASE_URL`，会修改数据库。必须先备份并在独立测试环境验证。
- `npm run db:check`：只读检查数据库迁移一致性。
- `npm run test:pg`：使用单独的 `PG_TEST_DATABASE_URL`，禁止使用生产库。
- `/api/v1/health`：进程存活；`/api/v1/ready`：数据库探测。

注意：不提供生产凭据、不运行微信支付、不提供真实招聘平台服务。所有商家证照仍不可作为生产级敏感资料收集功能。

## V0.18 本地 HTTP 全链路演练

`npm run test:e2e` 启动临时监听 `127.0.0.1` 的真实 Node HTTP 服务、发出完整业务请求并检查鉴权与状态。它**仅使用内存存储和模拟微信身份**，不是 PostgreSQL/微信真机测试。

正常关闭服务器时会先停止新连接，排空进行中的连接（最多 10 秒），再关闭数据库连接池；已支持 Ctrl+C (`SIGINT`) 和系统停止 (`SIGTERM`)。
