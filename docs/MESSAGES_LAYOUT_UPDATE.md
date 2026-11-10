# 消息页布局调整 · 2026-10-18

范围：按用户提供的三张参考图调整消息页布局，原配色体系、六主题、底部导航及现有业务限制保留。本次不实现即时聊天或积分系统。

## 实际变化

- 页面标题改为“消息”，聊天／通知使用左侧紧凑页签，右侧分别为搜索／全部已读。
- 联系记录使用线性图标、标题、摘要、状态、右侧时间和细分隔线。列表中的标题来自关联信息，不虚构联系人昵称、头像或未读聊天数；待回复点与通知未读点分别使用真实状态。
- 点击联系记录展开申请正文、回复及原有同意、拒绝、撤回、屏蔽操作；新增当前已加载联系记录的本地搜索。
- 通知页为审核／预约／商家／积分四入口及最近通知列表。前三项筛选已加载的真实通知，可继续分页；积分明确标注“规划中”，不显示虚假动态。
- 保留失败重试、未登录、空列表、无匹配、加载、通知分页；补上账号切换和卸载后拒绝迟到响应、重复已读点击保护。
- 修正微信默认禁用按钮样式对“全部已读”的覆盖，六主题下均保持透明工具栏和既有次级文字颜色；用实际计算样式断言验证。
- 继续显示后端中性通知摘要，客户端不恢复已被隐私设置隐藏的内容。

## 源码位置

- `miniprogram/pages/messages/index.{js,wxml,wxss,json}`：布局、交互和原生导航空标题，仍由微信处理胶囊与顶部安全区。
- `miniprogram/utils/message-view.js`：通知分类、日期和联系记录筛选。
- `scripts/build_message_icons.js`、`miniprogram/assets/icons/message-*.png`：六种小型线性图标，颜色直接取冻结主题现有 muted 值。
- `backend/tests/messages-layout.test.js`：八项状态、权限方向、隐私摘要、竞态和失败恢复测试。
- `scripts/check_messages_layout_ui.js`：真实本地 API／PostgreSQL 和微信模拟器专项验收。

`palettes.js`、冻结色彩合同和底栏源码未因本次消息布局调整而修改。没有后端接口、数据库结构或历史迁移修改。

## 可核验对照

- 修改前：`messages-layout-before.png`（此前实际消息页截图）。
- 联系列表：`messages-layout-chat.png`。
- 通知列表：`messages-layout-notices.png`。
- 六主题：`messages-layout-{prism,dark,clear,quiet,warm,gentle}.png`，其中 clear 同时开启大字。

截图中的验收信息来自独立开发账号和真实审核、联系记录，均明确注明本地验收用途；不将其视为真实商业内容。普通用户账号、城市、主题偏好在脚本结束后恢复。

## 已验证

| 命令／范围 | 通过 | 失败 | 跳过 | 证据 |
| --- | ---: | ---: | ---: | --- |
| 消息、底栏、主题、冻结颜色单元测试 | 15 | 0 | 0 | `messages-layout-unit.log` |
| 严格 `npm run verify:pg` | 33 | 0 | 0 | `messages-layout-regression.log` |
| `npm test`，含真实数据库子项 | 164 | 0 | 0 | 同上 |
| `npm run test:e2e` | 15 | 0 | 0 | 同上 |
| `npm run test:permissions` | 9 | 0 | 0 | 同上 |
| `npm run test:merchant-application` | 4 | 0 | 0 | 同上 |
| 消息微信模拟器专项 | 21 | 0 | 0 | `messages-layout-ui-result.json` |
| 曲线底栏模拟器专项 | 20 | 0 | 0 | `tab-shape-ui-result.json` |
| 游客显示与角标回归 | 1 | 0 | 0 | `messages-layout-guest.log` |

以上为各命令统计，存在覆盖重叠，不合并成独立测试总量。隔离 PostgreSQL 随机端口初始化、健康检查及本次项目专属容器／网络／卷清理成功；持久开发数据库保留。

`python scripts/check_wxml.py`、`python scripts/check_project.py`、`python scripts/check_v25.py` 通过；18 路由、五导航、20 个 WXML 保留；107 个项目 JavaScript 文件语法检查通过。完整页面及主题回归结果另见 `messages-layout-all-pages.log` 和 `prism4-after-colors-result.json`。

完整页面回归结果：18／18 路由及10／10主题／状态样本通过，无捕获的应用运行异常。随后仅针对上述禁用按钮规则提高选择器优先级，消息专项六主题重新通过，实际背景与文字色均作断言。

验收脚本曾发现异步渲染读取过早，以及未模拟时调用 restoreWxMethod 的清理问题；已修正等待和模拟生命周期后重跑。`check_v25.py` 的定位用途说明断言对齐工程原本已有的文案，权限项目及 API 白名单仍作完整精确检查，本次没有修改定位权限。

## 验收边界

- 微信开发者工具实际编译及模拟器页面已运行。
- 联系回复通过模拟器真实按钮与真实后端完成；系统弹窗输入使用微信自动化 SDK 模拟确认。
- Android／iPhone 真机触摸、软键盘、安全区、读屏器：待人工验收。
- 即时聊天与积分仍未上线；此次仅调整布局及现有联系功能体验。
