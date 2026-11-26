# 村美美 V1.0 生产上线审计

2026-11-21，北京时间。审计基线为分支 `codex/vm-design-system-1` 的 `c7a1283` 加当前工作区已有的未提交、未跟踪内容。小程序与 API 的工程版本当前仍为 0.25.0，官网源与最新归档为 1.2.0，V1.0 为本次生产建设的验收目标。

**当前阻断正式上线。** 已有原生小程序、PostgreSQL 持久化业务、人工审核后台及官网制品。手机号目前通过微信授权验证，阿里云短信和短信登录尚未实现。主要上线阻塞还包括双域名解析与 HTTPS、微信真机联调、会话续期、生产商家资质受理、管理员个人问责及生产运维制品。

[逐页与业务完成度](function-matrix.md) · [风险及修复文件](risks-and-files.md) · [分阶段实施计划](implementation-plan.md) · [测试与原始证据](verification.md)

## 1. 架构与技术栈

| 层 | 入口与实现 |
| --- | --- |
| 微信小程序 | `project.config.json` → `miniprogram/app.js` / `app.json`。原生 JavaScript、WXML、WXSS，5 个自定义底部导航，28 个主包页面及 1 个分类插画分包内部页。`pages/` 提供业务界面，`components/`、`styles/`、`custom-tab-bar/` 复用交互与视觉。`data/`、`utils/` 维护分类、地区、表单、权限提示、缓存和账户状态。 |
| 客户端数据层 | `miniprogram/utils/runtime.js` / `api.js` 设置请求、令牌和上传，`auth-intent.js` 保存登录后的动作意图。草稿存在本机恢复与账号服务端两条路径。`storage.js` 保留演示／回归路径，当前工作区是 server 模式，指向 `http://127.0.0.1:3101`。生产包须使用 HTTPS 和正式微信能力。 |
| API | `backend/src/server.js` 使用 Node.js 原生 HTTP、CommonJS、JSON API `/api/v1`，按信任、积分、资讯、行业服务、悼念、行业工作流和业务进度分路由。`rules.js` 等做数据校验。`pg-repository.js` 组合各领域仓储，`memory-repository.js` 支持本地开发和测试。后端直接引用小程序共享分类、项目模板等模块，部署制品必须携带这些依赖。 |
| 依赖与运行时 | 锁文件使用 `pg` 8.23.1、`sharp` 0.35.5，开发使用 `miniprogram-automator` 0.13.0、`pinyin-pro` 3.28.1 和 Node 内置测试框架。本机是 Node 20.19.4 / npm 10.8.2，项目声明 Node ≥20.9。目标 Node 22 LTS 与 Linux 的 Sharp 原生依赖另设验证。无 Redis 依赖。 |
| 运营后台 | `backend/admin/` 是同源 HTML、CSS、JavaScript 后台，由 API 服务 `/admin` 及 `/admin/api/*`。包括统一待办、发布及撤下、商家资质、举报、积分、行业、资讯、隐私和悼念审核。`apps/admin/README.md` 是独立站点的预留说明。 |
| 数据库与图片 | PostgreSQL 16，迁移入口 `backend/src/migrate.js`。小程序通过 `wx.request` 上传二进制，私有图片通过授权下载。普通图片由 Sharp 重编码并生成缩略图，两份字节保存在 `content_images`。证照、悼念证明用私有文件路径与数据库元数据。生产商家证据与证照提交有停用保护。OSS 尚无实现。 |
| 官网 | `apps/website/` 是原生 HTML/CSS/JavaScript 静态网站，Node ESM 构建。`dist` 交给 Nginx 独立站点，模板为 `infrastructure/nginx/dgqfl-website.conf.example`。 |
| 基础设施与验证 | `infrastructure/` 有 dev/test PostgreSQL Compose 和官网 Nginx 样例。`backend/tests/`、`tests/`、`scripts/` 含单元、真实 HTTP、隔离 PG、微信工具和恢复演练。`docs/deployment/` 的旧迁移范围和旧站点描述按当前基线更新后使用。 |

[静态路由、迁移与逐页 API 定位](evidence/source-inventory.json) · [小程序注册与分类检查](evidence/miniapp-static.json)

## 2. 数据库和存储现状

- **本机持久开发库实测。** Docker 中的 `citylife_dev` 使用 PostgreSQL 16.15，端口只映射本机回环。只读事务查得 81 张 public 表、177 个索引，库大小 12,983,319 字节。001–034 共 34 项全部应用，哈希一致，无缺失、漂移或未知迁移。快照含 137 个用户、97 条发布、16 条商家申请、21 条图片记录，微信身份和已验证手机号计数均为零。当前角色是开发库超级用户，生产运行身份需重新分权。[只读证据](evidence/local-db-readonly.json)
- **数据模型。** `app_users`、`app_identities`、`app_sessions`、`login_consent_events` 管账户。`verified_phones`、`phone_binding_history`、`account_trust` 管号码与风控。`publications`、`account_drafts`、`publication_confirmations`、`publication_status_history`、`industry_entries` 管发布。收藏、私信、屏蔽、通知、商家、预约、积分、广告、隐私及悼念各有持久表。短信挑战、发送账本、独立管理员账号和刷新令牌模型尚缺。完整表名见只读记录。
- **迁移与恢复。** `schema-migrations.js` 使用 SHA-256、连接级 advisory lock、逐文件事务及 `schema_migrations`。一次批次中先成功的文件会提交，失败后须按实际已提交清单处理。原演练脚本因旧审核夹具失败，在隔离环境补用当前夹具后用原恢复逻辑实际验证 81 表内容一致。自动加密异地备份、私有附件／密钥一致性备份、角色恢复、保留与告警待上线部署。[演练证据](verification.md#postgresql-与-http-回归)
- **生产库未核实。** 总任务书此前记录 ECS 未安装 PostgreSQL。本轮未登录 ECS，版本、数据、磁盘与权限需在获准后现场核对。是否存在授权的业务源库须单独确认。

## 3. 微信、手机号与统一账户

| 能力 | 已有实现与缺口 |
| --- | --- |
| 微信首次登录和复登 | `pages/login` 拉取法律文档并收集同意版本，`utils/api.js` 调用 `wx.login()`，POST `/api/v1/auth/wechat`。`wechat-login.js` 调用 `jscode2session`，处理超时、无效／已用 code。入口有频率限制。`pg-repository.js` 用 `(provider, provider_id)` 唯一键和事务锁复用同一用户 UUID。页面支持取消或继续游客浏览。AppID 归属、AppSecret 和微信真机链路待联调。 |
| 会话、退出及注销 | 32 字节随机不透明 Bearer，库中只存 SHA-256，固定七天。`POST /api/v1/auth/logout` 撤销当前会话。前端遇到过期提示重登并核对账号身份。当前无独立续期／刷新接口，也无专用最后登录时间字段。隐私流程已有人工注销执行、撤会话及注销身份指纹保护，线上保留与处理制度待确认。 |
| 微信授权手机号 | `pages/verification` 和授权交互使用 `getPhoneNumber`。`POST /api/v1/me/phone/wechat` 由 `wechat-phone.js` 调用微信接口，校验 AppID、区号和格式。`verified_phones` 保存 AES-GCM 加密值、HMAC 和掩码。`DELETE /api/v1/me/phone` 已实现撤销，并关闭旧发布电话授权。该号码目前供发布或联系验证使用。 |
| 短信 | 未发现发送、校验、短信绑定、短信登录界面或接口，也无相关依赖、环境项和迁移。已有解绑端点可复用，补强认证和撤销规则。总任务书记载历史签名「东莞市石排青方睐软件中心」，审批、模板 CODE、RAM 权限和发送状态均待受控核验。 |
| 账号绑定与权限 | 微信和验证手机号通过同一 UUID 关联。`verified_phones` 以 `user_id` 为主键，`number_hmac` 无跨用户唯一约束。加入短信登录前须处理存量重复和新绑定并发。普通用户由会话身份识别，商家有店主／经理／员工关联，后台有 `operator`、`verifier`、`superadmin` 和可选授权。后台当前使用共享角色凭据。 |

[微信和会话入口](../../../backend/src/server.js) · [微信换码](../../../backend/src/wechat-login.js) · [号码路由](../../../backend/src/trust-routes.js) · [身份与会话仓储](../../../backend/src/pg-repository.js)

## 4. 页面、业务与正式发布

29 个注册入口已逐一核对。27 行业、83 分组、418 个细项和 418 个分类展示图均可在当前工作区定位。业务去向是 40 个居民流程、375 个行业流程和 3 个按既有规则关闭的论坛类项目。七类发布业务已有主体路径，闲置模板缺少转让、求购、交换的结构化用途，现有表单会对三种意图统一要求物品照片和成色。发布、驳回、重提、审核通过、撤下及过期均有对应实现。公开范围仍受真实资质、生产能力开关和审核状态控制。公开评论和点赞关闭，预约用于服务联系，兑换和推广仅消耗平台积分，支付及资金托管不在范围内。[逐页与业务完成度](function-matrix.md)

## 5. 官网与公网现状

- **官网制品。** 存在 `dgqfl-website-1.1.2.tar.gz`，并有 1.1.3 和 1.2.0 更新版本。选择 1.2.0 作为部署候选。六个历史归档的 SHA-256 均匹配，最新包 502,179 字节。21 个静态文件与本轮源码构建逐文件一致，两版协议与隐私正文（1.1.3、1.2.0）一致。首页、产品介绍、功能、帮助、协议、隐私和联系七页齐全，并有独立 404。[归档清单](evidence/website-archives.json) · [归档与新构建比对](evidence/website-build-archive-compare.json)
- **联系与备案。** 官网含现有官方邮箱、主体和用户此前提供的备案号。专用隐私邮箱、官方小程序码、公开联系电话及地址当前为空。小程序生产协议依赖服务端正式主体和隐私联系配置。上线前对照备案登记、实际受理渠道和微信隐私指引。[官网配置](../../../apps/website/src/site.config.mjs) · [官网发布记录](../../website/release-v1.2.0/RELEASE.md)
- **本轮公网实测。** 主域 NS 为 `bonus.dnspod.net`、`stephanie.dnspod.net`，API 子域独立委派到 `f1g1ns1.dnspod.net`、`f1g1ns2.dnspod.net`。主域和 API 的 A/AAAA 查询只返回 SOA，`www` 返回 NXDOMAIN。三个 HTTPS 请求均因解析失败未建立连接。本机 `3101` 的 `/api/v1/health`、`/api/v1/ready`、`/admin` 均为 HTTP 200。ECS 内部现行 Nginx、端口监听、证书、安全组、Aegis、UFW、待重启和数据库状态需后续现场核对。[DNS 与 HTTP 原始记录](evidence/connectivity.log) · [历史生产探测](../../website/production-v1.1.1/REPORT.md)
- **总任务书服务器基线。** 目标为阿里云成都 ECS `8.156.72.144`，Ubuntu 22.04.5 LTS、2 核、2 GB 内存、4 GB Swap、40 GB 系统盘。任务书记录 Nginx 1.18.0 当时仅运行默认站点，未见 TLS，且未安装 Node.js、PostgreSQL 或 Docker。UFW、Aegis 和待重启状态按获准后的现场结果更新。

## 6. 上线门禁

P0 补齐认证、生产数据库权限、部署制品、商家证据闭环、权限问责、真实审核及上传。P1 验收搜索、消息、收藏、举报、商家运营及非现金积分。P2 验收容量、备份恢复、监控与体验。

阶段 1 提交后暂停。生产服务器变更、DNS、真实短信、密钥配置、不可逆迁移及重启，分别提交具体操作、影响和回滚方案，由用户确认。[实施计划](implementation-plan.md)
