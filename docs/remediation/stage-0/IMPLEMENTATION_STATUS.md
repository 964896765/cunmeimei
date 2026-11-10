# 阶段 0 工程基线

日期为 2026-11-10，范围为当前工作区，来源压缩包未在本轮提供。

## 核对结果

- 原目录未初始化 Git，建立本地原始基线与独立整改分支。
- 27 个已注册小程序页面，五个底部导航，418 个细分类目。
- 32 份历史迁移保留原文，记录 SHA-256。
- 使用 Git 属性禁用迁移文件换行转换，保证后续检出仍与数据库校验和一致。
- 本地 Docker 数据库为 citylife_dev，已应用 001–029，缺少 030–032，已应用文件无校验和差异。
- 原代码、重要配置和数据库备份在仓库外的受限目录，路径为 `C:/Users/chejun/Desktop/city-life-miniapp-backups/2026-11-10-stage0`。
- 原始项目 ZIP 包含本地配置，仅限本机备份。Git 排除环境变量、运行时状态、私有附件及开发者个人配置。

## 阶段 1 计划

1. 统一后台接口的服务端默认拒绝权限策略，检查主入口及分拆路由。
2. 明确 superadmin、operator、verifier 三种角色与独立隐私、证据权限。
3. 阻止缺失或拼错 NODE_ENV 的启动，正式启动强制生产模式。
4. 将发布校验与客户端模板版本解耦，编辑时校验合并后的持久化内容及分类。
5. 增加权限正反向、生产入口和发布降级回归测试，运行真实 PostgreSQL。

## 预计修改文件

- `backend/src/server.js`、`deployment-check.js`、`preflight.js`。
- 新增集中式后台权限策略，调整需要传递角色能力的路由和后台入口。
- `backend/src/product-repository.js`、`memory-repository.js`、`miniprogram/utils/publication-schemas.js`。
- `backend/package.json`、`backend/.env.example` 与对应后台角色 UI。
- 对应后端单元、HTTP、PostgreSQL 回归测试。

UI 系统与全页面改造属于后续阶段，本轮先验收安全基础。
