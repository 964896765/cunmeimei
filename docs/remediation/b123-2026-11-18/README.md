# B1—B3 修复与 176 项 3D 插画交付

日期：2026-11-18。实施基线：`8d1a45d`。本次按用户确认实施 B1—B3 和剩余 176 项资源；保持五大导航、七个发现频道、27 行业/83 分组/418 细项、线下交易、非现金积分及现有页面布局。

## 已实现的修改

| 批次 | 修改后的行为 | 主要文件 |
| --- | --- | --- |
| B1 | 后台工作流操作使用继承后的角色权限，超级管理员可以正常处理权益、业务争议、行业审核和资质。无运营/证据权限时隐藏相应操作，服务端授权继续强制执行 | `backend/admin/workflows.js`、`backend/admin/app.js`、角色 UI 回归测试 |
| B2 居民发布 | 输入节流保存至独立的本机恢复区；隐藏/退出时刷新最新内容。草稿箱可恢复；不自动覆盖显式本机草稿或账号草稿 | `pages/publish-form`、`utils/form-recovery.js`、`pages/drafts`、`utils/draft-summary.js` |
| B2 行业发布 | 表单 → 下一步预览 → 当前发布须知确认 → 最终提交。返回修改后须重新确认；阅读须知后返回时，内容未变则保留预览 | `pages/industry`、`utils/industry-preview.js` |
| B2 数据保护 | 恢复记录按账号隔离、携带分类版本/行业策略/原业务 revision；过期账号的恢复内容需登录；切换账号或版本冲突不覆盖原内容；保存/提交成功只清理对应恢复记录 | `form-recovery`、两类表单与草稿测试 |
| B3 本人列表 | 我的发布和我的预约每次20条，可继续加载；按创建时间+ID游标翻页，保留已有记录并去重；兼容旧调用 | `pg-repository.js`、`memory-repository.js`、`server.js`、my-posts/my-bookings |
| B3 后台列表 | 用户、资质、风险、申诉、审计日志分别翻页；老记录可继续访问。核验前按用户和范围读取真实 revision，不依赖当前资质列表页 | `trust-pagination.js`、`trust-routes.js`、`admin-permissions.js`、`admin/app.js` |
| B3 聊天 | 每页50条，可加载更早消息。保留阅读锚点；后台轮询合并新消息，不清掉已加载历史。账号切换和失去访问权时清除旧内容/分页状态 | `trust-repository.js`、`trust-routes.js`、`pages/chat` |
| 回归发现并修复 | 预约 INSERT 等待资质锁期间，来源可能撤销；现在重新核对资格后记录“服务不可用”，避免误报“时段过期”，保留幂等的确定结果 | `backend/src/booking-submissions.js`；原业务并发测试保留并通过 |

自动保存只负责本机异常恢复，不代表已经提交、云端同步或审核通过。须知确认不自动恢复，平台审核责任保持不变。存储空间不足、版本冲突及清理失败均有反馈；不会因此覆盖他人/另一设备的数据，或把已提交成功误报为失败。

## 插画

剩余176项已逐项制作并接入，使用项目自建 Blender 几何、既有珍珠白/烟玫瑰/淡紫材质与灯光，导出160×160透明 WebP。先检查4个代表场景，再批量渲染、检查五张总览，随后修订摩托车、舞蹈、助行器、海葬船、奶牛及雨伞等轮廓。

- [176项完整资源记录](assets.json)：ID、模型、路径、字节数、当前与替换前哈希。
- [插画前后对照](illustrations-before-after.png)：左侧原临时图标，右侧本次3D；这是资源对照，不冒充页面前后截图。
- [第一批](scenes-1.png)、[第二批](scenes-2.png)、[第三批](scenes-3.png)、[第四批](scenes-4.png)、[第五批](scenes-5.png)。
- [资源与包体估算校验](resource-results.json)。

现在418份分类图片的文件哈希互不相同，页面可见临时图标为0。描述器仍有3个占位，但都被既有房产插画覆盖，保留用户确认的房产样式。另有原有72张3D初稿，本轮未将其冒称为最终视觉定稿。文件不重复也不等于所有业务轮廓都已获得用户审美验收。

制作源：`scripts/build_completion_specs.js`、`category-completion-specs.json`、`render_category_completion.py`；复用 `render_category_scenes.py` 原有工作室。原始256 PNG保存在本机备份目录，项目中保留可复现的模型/场景和WebP，不向小程序包塞入渲染源。

## API 与数据库

没有新增数据库迁移，没有删除表或修改历史迁移。

| 接口 | 兼容变更 |
| --- | --- |
| `GET /api/v1/me/publications`、`/api/v1/me/bookings` | 新增 `limit=1..100`、`cursor`；分页响应含 items/hasMore/nextCursor。旧无参数调用保持既有格式 |
| `GET /api/v1/me/chats/:id` | 新增双键 cursor，响应附 hasMore/nextCursor；保留旧 before 参数。时间游标保留 PostgreSQL 微秒，拒绝歧义/非法日期 |
| `GET /admin/api/trust` | limit/cursor/section 分页，section为 users/qualifications/risks/appeals/audit；敏感管理列表仍按服务端权限过滤或拒绝 |
| `GET /admin/api/trust/users/:id/qualification?scope=...` | 新增最小化核验状态查询，供核验角色/超级管理员读取 revision；不返回证照文件或材料引用 |

## 验证证据

- [完整 PostgreSQL 回归日志](full-pg.log)：1115通过，0失败/跳过；[418类业务链](project-journeys/integration-result.json)全部通过。均为隔离测试库及明确标记的测试身份，不是生产运营或真实资质认证。
- [分页 PostgreSQL 专项](pagination-pg.log)：201条发布、201条预约、201条审计，以及120条同时间聊天消息完整遍历；并发新增、他人/未登录访问、核验角色权限和无效参数。
- [最终发布/草稿/权限针对性测试](final-targeted.log)、[聊天针对性测试](chat-targeted.log)。与全量测试有重叠，不能相加宣称独立测试总量。
- [官方本地视图编译](view-compilation.json)：49个WXML、52个WXSS编译通过；这不是微信上传包体测量或真机验收。
- [原本地数据库只读核对](persistent-db-readonly.json)：主要业务表计数与审计时一致；这不代表逐字节行内容比对。测试数据未导入原本地库。[开发API重载检查](local-service.json)确认本轮代码已在 `127.0.0.1:3101` 运行、健康/就绪通过、私有接口仍拒绝未登录访问，未应用新迁移。
- [开发者工具与浏览器验收结果](ui-result.json)：10项检查通过，418张分类图加载成功，未捕获运行时异常；原登录存储保持不变，内存覆盖已清理。早期编译进程端口残留、截图超时和测试脚本等待问题保留在 ui-attempt*.json/log，未删除失败证据。

页面截图：[首页](home-after.png)、[发现](discover-after.png)、[发布](publish-after.png)、[消息](messages-after.png)、[我的](me-after.png)、[发布记录翻页](my-posts-pagination.png)、[聊天历史](chat-history.png)。新增预览和资源组截图以最终 UI 验收报告中的截图列表为准。

新增截图：[居民发布预览](resident-preview.png)、[行业发布预览](industry-preview.png)、[汽车用车](publish-C10G03.png)、[运动场馆](publish-C18G02.png)、[殡葬信息查询](publish-C23G02.png)。[汇总测试报告](test-results.json)与[修改文件清单](changed-files.txt)包含验证范围与遗留项。

## 保留的限制

1. Android/iPhone真机尚未执行；模拟器截图不能代替设备验收。
2. 微信预览已尝试，但IDE配置的代理 `127.0.0.1:10808` 拒绝连接，未获得实际上传包体报告。源码估算主包/资源分包均在限额内，实际上传测量继续待验收。
3. 没有执行生产部署、DNS修改、开通外部服务或更换真实密钥；正式微信身份、手机号、地图、联系信息、资质及备案事项沿用审计中的待办。
4. 本轮未实施B4/B5或C阶段：统一业务索引、正式商家材料开放、具名管理员/五岗位授权、普通反馈等仍须后续按计划补齐。不能因此宣布整个系统已经达到上线标准。

## 回滚

本轮没有结构迁移，回滚代码不需要删库/恢复数据库。各批代码和资源按独立提交回退；不要对包含用户其他工作的目录执行 hard reset。

对应提交：B1 `71ec3d2`，B2 `f9d8c34`，B3 `ebec4a6`，176项资源 `c61ab3f`；审计存档为 `c5d1e6a`。如确需撤回全部本轮业务改动，先确认后按资源→B3→B2→B1顺序执行对应 `git revert`，保留后续用户更改与数据库记录。

资源替换前176张WebP保留为本目录 `分类ID-before.webp`，哈希见 assets.json。回滚资源时同时回退 `miniprogram/data/category-art-scenes.js`，避免描述器将旧临时图标标为新渲染。优先使用对应资源提交回退以保持代码、映射和测试一致。

本机恢复记录使用独立版本化键 `city_life_form_recovery_v1_账号ID`。代码回退无需删除这些记录；保留后可重新升级恢复。显式本机草稿、账号草稿及已有业务记录不受资源回退影响。
