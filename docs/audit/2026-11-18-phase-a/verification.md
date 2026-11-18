# 本阶段实际验证记录

日期 2026-11-18，代码基线 `8d1a45d`。报告中的 ISO 时间使用 UTC，与本地北京时间相差 8 小时。本阶段未修改业务代码，因此没有“修复后截图”或“修复已通过”的结论。

| 检查 | 执行方式/结果 | 边界 |
| --- | --- | --- |
| 当前测试套件 | 子进程清除 DATABASE_URL/PG_TEST_DATABASE_URL 后执行现有后端测试：530 个，512 通过、0 失败、18 个既有 PG 条件套件跳过 | 不改动、删除、skip 或弱化测试；这些跳过不能算通过；未在本轮重跑完整 PG 生命周期 |
| 源码解析/绑定 | 安装在微信工具中的 TypeScript AST 解析；28 页、所有 include、组件事件、字面量导航、API 调用位置扫描；0 解析诊断、0 未解析页面/组件事件、0 确定字面量失效路由 | 动态表达式/运行时状态/网络与返回行为不在静态检查保证内 |
| 分类覆盖 | 直接加载实际 classification-contract/industry-workflows/project-journeys/category-art；418 唯一 ID、27 行业、83 分组、7 频道；40 resident、375 industry、3 closed | 配置覆盖，不等于每项正式资质或现场服务已获准 |
| 资源路径/去重 | 418 路径存在、0 完全相同文件哈希；176 可见占位清单与房产覆盖排除核对 | 没有制作新插画；哈希去重不证明业务语义无重复 |
| 后台按钮缺陷复现 | 实际 workflows.js 在最小 DOM/VM 渲染；operator 权益 2/行业 3，verifier 核验 3，superadmin 对应全部 0 | 源码 UI 隔离复现；未调用按钮回调、登录后台或写入 DB，不替代真实后台端到端验收 |
| 当前本地 API | 只读 GET localhost:3101：health/ready/config/legal/admin 都 200；legal configured=false、wechatAvailable=false，联系占位仍在 | 存量服务进程未重启，版本号 0.25.0 不能证明其运行代码精确等同当前 HEAD；未用开发登录冒充真实微信登录 |
| 当前持久本地 DB | 明确 read-only 会话，BEGIN READ ONLY、SELECT 元数据与聚合、ROLLBACK；PostgreSQL16.15，81 表/177 索引；34 迁移名/校验和全部一致 | 不写用户数据、不执行迁移；本地开发账号为 superuser，不代表生产权限状况 |
| 本地端口差异 | 保存 env PORT3100，启动脚本/前端目标3101；数据库保存端口62294已过期，实际项目 Docker 端口62246，由 local_database.js 校验归属后解析 | 未擅改配置或重启现有服务；上线需显式配置，不能依赖本地 Docker 自动发现 |
| npm 依赖审计 | 官方 registry 下 npm audit --json 完成退出0：117 个依赖条目，已知漏洞 info/low/moderate/high/critical 均0 | 第一次结果为空未算成功，报告用成功重试替换；不代表应用代码/运维没有漏洞 |
| API/admin 公网观察 | 当前解析器 api A/AAAA ENODATA，admin ENOTFOUND，HTTPS GET ENOTFOUND | 未发现成功可用端点；未登录云平台/SSH，无从确认服务器实际部署状态 |
| 配置存在性 | 仅输出环境模式、开关、凭证是否存在；开发预检通过 | 未输出真实密码/令牌/数据库 URI；生产配置并未提供，开发通过不能替代正式 preflight |

原始当前测试日志保留在工作区之外：

`C:/Users/chejun/.codex/backups/city-life-miniapp/phase-a-tests-2026-11-18.log`

原始官方 npm 审计：

`C:/Users/chejun/.codex/backups/city-life-miniapp/phase-a-npm-audit-2026-11-18.json`

脱敏结果分别见 [current-tests.json](current-tests.json)、[dependency-audit.json](dependency-audit.json)、[local-api.json](local-api.json)、[local-configuration.json](local-configuration.json)、[database-observation.json](database-observation.json)、[public-endpoints.json](public-endpoints.json)。

另以纯函数、虚构的 `example.invalid` 邮箱复现：[协议就绪判断](legal-readiness-reproduction.json) 返回 configured=true，同时地址和电话仍为占位。没有发送邮件或执行登录。此项支持 A09 的发布门禁修复建议。

交付校验见 [artifact-verification.json](artifact-verification.json)：418 名称与 ID 唯一、父子 ID 前缀一致、176 项缺口唯一、报告链接有效、无尾随空白，业务源码与 HEAD 保持一致，git diff --check 通过。[本次文件清单](changed-files.txt) 仅包含审计目录新增内容。

## 历史证据，仅引用、未伪称本轮执行

`docs/design/experience-refinement-2026-11-18/test-results.json` 记载：隔离 PostgreSQL 1101 测试通过、0 失败/跳过；开发者工具主检查62、追加9，总71；加载418资源，捕获异常0；另有418类业务生命周期报告。

该报告记录其自身基线 `f948896`，当前审计 HEAD 为 `8d1a45d`，不得把历史报告无条件当成本轮最终代码全量测试。可结合提交差异和后续实际重跑使用；其模拟器、隔离 PostgreSQL 与测试账号也不等于真实用户/生产/真机。

历史截图位于同目录 discover-normal/sticky/filter-panel、me-main/service、publish-C12/C21 等；本次没有修改视觉，故不生成误导性的前后对比。176 资源实际替换后须补相同尺寸页面的前后截图、图形接触表及实际编译包体。

## 可复跑的审计脚本

在项目根目录运行：

```powershell
node docs/audit/2026-11-18-phase-a/source-inventory.cjs
node --env-file=backend/.env.local docs/audit/2026-11-18-phase-a/observe-runtime.cjs database
```

第一条仅读取源码并写本目录报告，依赖本机已安装的微信工具 TypeScript 路径及保留的 npm 审计原始文件；不是通用 CI 测试脚本。第二条在已验证归属的本地开发库上只读观察，不运行迁移，不可用于指向生产 URI 的环境。

## 尚未执行

本轮未重新执行418类后端实际提交、审核、展示生命周期；未进行真实微信账号首次授权、图片/手机号/定位实机授权、Android/iPhone 滑动/键盘验收；未测实际编译上传包体、代表性容量与 p95；未访问阿里云、部署生产、修改 DNS、开通任何外部服务、改密钥；未在生产执行备份/恢复或故障演练；未验证实际备案、行业许可或微信类目已满足。

这些事项在计划 B—E 有明确通过标准，完成前继续标为未验收。
