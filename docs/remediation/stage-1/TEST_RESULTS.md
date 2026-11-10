# 阶段 1 测试结果

所有记录来自 2026-11-10 本轮执行。默认套件在无测试库时的跳过项单独由严格 PostgreSQL 门禁验证。

| 项目 | 当前记录 |
| --- | --- |
| P0 专项，真实 PostgreSQL | 最终复跑 5 通过、0 失败、0 跳过 |
| 默认全套回归 | 最终复跑 443 通过、0 失败、14 数据库项跳过 |
| 严格 PostgreSQL 16.9 门禁 | 587 通过、0 失败、0 跳过、0 取消，包含全部 32 份迁移与 418 分类流程 |
| JavaScript 语法 | 315 文件通过 |
| WXML 结构 | 37 文件通过，结构检查范围包含组件 |
| 既有 smoke | 通过 |
| 原始本地数据库恢复 | 隔离恢复成功，迁移历史与 7 张核心表计数一致 |
| 全业务备份恢复演练 | 72 张表、47 张非空表内容校验通过，拒绝损坏备份及已有目标库 |

## 本轮执行命令

```powershell
node backend/src/run-tests.js
./scripts/test_pg_portable.ps1 -BinariesPath <本机 PostgreSQL 16.9 bin 目录>
# P0 最终复跑使用独立 Docker 测试库的 PG_TEST_DATABASE_URL
node --test --test-concurrency=1 backend/tests/p0-security.test.js
# 恢复演练使用任务专用 PostgreSQL 容器
node scripts/check_recovery_drill.js
python scripts/check_wxml.py
node tests/smoke.js
git diff --check
```

原始本地业务库备份恢复、完整业务恢复演练、严格集成测试分别使用隔离目标。测试容器、卷及 portable 测试集群在完成后清理，测试日志保留在仓库外受限备份目录。

## 发现并处理的基线问题

原基线 PostgreSQL 的 418 分类测试达到 360 秒超时后继续生成“通过”JSON。本轮修正取消信号处理，将父测试时限调整为 900 秒，门禁进程总时限为 1200 秒。普通套件最多 4 个文件并发，严格集成套件串行执行。业务断言与生产性能指标独立，完整保留失败运行日志。

首轮全量 PostgreSQL 回归还发现旧测试对运营访问资质待办、隐私注销，以及核验员访问业务争议的预期需要调整。更新为按明确角色和授权断言，P0 专项保留默认拒绝验证。

首次调整期间的全量 PostgreSQL 运行记录为 1008 项，876 通过、130 失败、2 取消，包含同类父测试超时及旧权限预期。最终严格门禁和默认回归分别覆盖数据库项与其余测试，以上表中的最终结果验收。

完整日志保存在阶段 0 仓库外受限备份目录中。
