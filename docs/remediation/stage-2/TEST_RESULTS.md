# 阶段 2 测试结果

以下记录来自 2026-11-11 本轮执行。

| 检查 | 结果 |
| --- | --- |
| 默认全套回归 | 462 项，448 通过，0 失败，14 跳过 |
| P0 专项，隔离 PostgreSQL | 5 通过，0 失败，0 跳过 |
| 页面与项目结构 | 27 页、108 页面文件、5 导航入口通过 |
| WXML 嵌套 | 43 文件通过 |
| 小程序 JavaScript 语法 | 94 文件通过 |
| 历史迁移字节校验 | 32 份与阶段 0 SHA-256 一致 |
| 分类数量 | 418 |
| Android / iPhone 真机 | 待执行 |

## 本轮命令

```powershell
node backend/src/run-tests.js
# PG_TEST_DATABASE_URL 使用仓库外受限文件中的隔离库连接
node --test backend/tests/p0-security.test.js
node --test backend/tests/devtools-storage-recovery.test.js backend/tests/page-quality.test.js
node --test backend/tests/theme-navigation.test.js
python scripts/check_project.py
python scripts/check_wxml.py
# PRISM_RECOVERY_FILE 指向仓库外受限目录
node scripts/check_prism3_ui.js
git diff --check
```

机器可读清单保存在 `INVENTORY.json`，页面截图执行证据保存在 `visual/RESULTS.json`。完整测试日志保存在仓库外受限目录 `C:/Users/chejun/Desktop/city-life-miniapp-backups/2026-11-11-stage2`。

默认回归中的 14 项数据库测试保留跳过标记。本轮另行执行 P0 PostgreSQL 专项。阶段 1 的 587 项严格数据库记录和 418 分类流程记录可追溯至阶段 1 报告，其执行日期为 2026-11-10。

## 专项回归

新增回归覆盖公开缓存账号与查询隔离、过期、容量上限、存储异常，开发者工具断线恢复与中断后重启恢复，员工页账号切换和迟到响应，以及居民表单的 Warm Care 材质匹配。

截图脚本首轮把居民表单的 `categoryId` 错写成 `projectId`，截图进入错误状态。已更正参数，并增加居民表单实际打开与行业表单模式断言，重新执行截图检查。

脚本早期运行发生自动化超时和上下文丢失。当前实现逐页保存检查进度，在小程序源码指纹一致时允许恢复，最终成功报告要求全部页面与附加状态完成且存储恢复成功。

前轮存储恢复事故与原登录丢失情况记录在 `ACCEPTANCE_REPORT.md`。
