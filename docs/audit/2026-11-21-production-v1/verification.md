# 测试证据与发布门禁

本轮实测使用 Windows Node 20.19.4／npm 10.8.2。小程序编译和静态审计使用当前工作区，官网 HTTP／浏览器／Nginx 测试使用临时源码副本，持久开发库查询使用只读事务，业务回归使用单独的 PostgreSQL 16.15 容器和隔离数据。隔离 Nginx TLS 使用本地测试证书。

## 当前工作区实测

| 验证 | 命令或观测 | 结果与证据 |
| --- | --- | --- |
| 持久开发 DB | 只读 SQL 查询版本、表、索引、计数和迁移哈希 | 16.15，81 表、177 索引，34 份迁移全匹配。开发库角色为超级用户。[只读记录](evidence/local-db-readonly.json) |
| 小程序 JS 与视图 | 解析全部 115 个 JS，运行正式微信开发者工具自带 `wcc.exe`、`wcsc.exe` | 0 JS 语法错误，50 个 WXML、52 个 WXSS 编译成功。29 个注册页的必需源码均存在。分包占位页无自有 WXSS。27 行业、83 组、418 细项与展示图均可定位。[原始结果](evidence/miniapp-static.json) |
| 独立烟测 | `node tests/smoke.js`，`node tests/v11-editor-smoke.js` | 演示存储烟测退出 0。旧编辑演示烟测退出 1，仍处于编辑状态。另在内存副本补调用现有承诺事件后重跑，通过编辑、重提与版本保护。仓库旧测试原样保留，阶段 2 更新该夹具。[原运行](evidence/release-and-smoke.log) · [定位复验](evidence/legacy-editor-with-consent.log) |
| 小程序生产静态门禁 | `npm run check:wx-release --prefix backend` | 退出 1，共享域名校验关闭，私有覆盖的域名校验也关闭，API 仍为本机 HTTP。对应 `DOMAIN_CHECK_MUST_BE_ENABLED`、`PRIVATE_DOMAIN_CHECK_MUST_BE_ENABLED`、`HTTPS_PUBLIC_API_REQUIRED`。[日志](evidence/release-and-smoke.log) |
| API 环境门禁 | 默认环境运行 `npm run preflight --prefix backend`，现有本机环境以 `--development` 校验 | 默认环境未设置生产变量，退出 1。已存在本机开发配置校验退出 0。正式环境的变量和权限仍待现场验收。[日志](evidence/release-and-smoke.log) |
| 后端依赖通告 | `npm audit --prefix backend --registry https://registry.npmjs.org --json` | 官方 npm 审计退出 0，锁文件通告计数为 0。默认镜像的审计端点返回未实现，已用官方结果复核。依赖通告范围仅覆盖已发布漏洞。[官方结果](evidence/dependency-official.json) |
| 官网 HTTP 与构建 | `npm test --prefix apps/website`，在临时源码副本运行 | 14 通过、0 失败、0 跳过。编译 7 页和独立 404，路径、锚点、协议、静态资源及包内容均验证。[TAP](evidence/website-test.log) |
| 官网浏览器 | `npm run test:browser`，本机 Edge | 6 种宽度共 42 个页面样本、17 项交互，0 页面错误、0 外部请求。[详细结果](evidence/website-browser.json) · [命令日志](evidence/website-test-browser.log) |
| 运营后台浏览器 | `scripts/check_admin_review_ui.js`，输出重定向到本次审计目录，访问本机 `/admin` | 2 项通过，审核表单焦点、换行内容、取消确认均实际操作。未登录或执行审核写入。[浏览器记录及截图索引](evidence/admin-browser/RESULTS.json) |
| 官网 Nginx | `npm run test:nginx`，本机 Docker | 7 个 TLS 页面、4 项跳转、5 个 404、5 个资源，安全头、独立日志、同机虚拟主机不变和撤销重载通过。[日志](evidence/website-test-nginx.log) |
| 官网包 | `tar -tf` ＋ SHA-256 ＋ 逐文件与本轮静态构建比较 | 六份历史归档校验均通过。1.2.0 的 21 个文件与本轮构建完全一致。[归档清单](evidence/website-archives.json) · [比对](evidence/website-build-archive-compare.json) |
| 健康与 DNS | 本机三个 GET，三个正式域名 A／AAAA／NS 与 HTTPS 查询 | 本机 `/api/v1/health`、`/api/v1/ready`、`/admin` 均 HTTP 200。正式域名未解析出可用地址，HTTPS 无响应。[连接日志](evidence/connectivity.log) |

首次普通沙箱运行后端和官网 HTTP 套件时本机网络和 Docker 管道受限制，产生 HTTP 失败和 PG 跳过。已改用获准的本机回环和隔离 Docker 复验。以上最终结果以可运行环境的证据为准。

## PostgreSQL 与 HTTP 回归

| 验证 | 命令 | 当前结果 |
| --- | --- | --- |
| 全量回归 | `npm test --prefix backend`，临时 Compose、PG16.15、回环端口 | **1,124 通过、0 失败、0 跳过、0 取消**，退出 0，约 742 秒。包含真实 HTTP 和隔离库写入，含 418 项分类流程。[TAP 完整日志](evidence/postgres-test.log) · [418 项记录](evidence/project-journeys.json) |
| 严格 PG 门禁 | `npm run verify:pg --prefix backend`，同一临时 Compose | **587 通过、0 失败、0 跳过、0 取消**，退出 0。与全量套件重叠的用例只计算一次。[门禁日志](evidence/postgres-verify-pg.log) |
| 备份恢复 | `node scripts/check_recovery_drill.js`，隔离库 | 原脚本退出 1。脱敏复跑定位为旧夹具在备份前被 `CATEGORY_REVIEW_REQUIRED` 拒绝。另一隔离库在内存副本补用现行确认和专项审核夹具后，真实 `pg_dump`／`pg_restore` 退出 0，81 表逐表校验一致（49 个有数据），并验证拒绝覆盖、拒绝损坏归档。原脚本仍需修改，演练范围是数据库。[原运行](evidence/postgres-recovery.log) · [定位复跑](evidence/postgres-recovery-retry.log) · [隔离恢复结果](evidence/postgres-recovery-current-fixtures.log) |

418 项回归使用测试环境身份和显式核验夹具。HTTP、数据库和业务状态流转均实际调用，微信和资质审批保留独立的生产验收要求。本轮运行和重试的容器、隔离网络和测试数据卷均已清理并复核。全量套件生成的结果归档到本次证据目录，仓库原有历史报告已恢复到审计前版本。[隔离运行记录](evidence/postgres-run.log)

## 可复用历史证据

- 2026-11-20 的记录在隔离 PostgreSQL 报告 1,123 通过、零失败、零跳过，含 418 项；微信工具预览包报告 2,060,850 字节主包和 1,869,534 字节插画分包。本轮未重新生成微信预览码或上传包。[11-20 上线前检查](../../PRELAUNCH_CHECK_2026-11-20.md)
- 2026-11-18 的 B1–B3 隔离回归报告 1,115 通过，另有 418 张分类图加载、分页、后台按钮、编辑恢复等开发工具记录。历史证据反映对应版本和夹具范围。[机器汇总](../../remediation/b123-2026-11-18/test-results.json)
- 生产 ECS 内部状态、Node 22 Linux 干净构建、微信真机、阿里云签名和模板、实收短信、正式备案核对、生产数据库写入和线上备份恢复均留待后续阶段。当前证据使用本机开发、隔离容器或浏览器，真实生产凭证和数据留在各自受控环境。

[返回审计报告](README.md) · [分阶段验收](implementation-plan.md)
