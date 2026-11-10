# 我的事务：草稿数量与统一顶部导航

2026-10-20，按用户最后确认的要求实施。

## 最终行为

- “草稿箱”改为“我的草稿”，下方显示当前账号的实际草稿数量。
- 读取现有本机草稿和账号草稿。同一份内容的本机/账号版本合并计数，独立草稿分别计数。现有存储仍是一个本机槽位、一个账号槽位，没有新增多草稿业务系统。
- 进入或返回个人中心、手动重试时重新读取数量；编辑后返回会先保存草稿，提交成功后移除本机草稿并更新数字。没有跨设备实时推送能力，不冒充即时同步。
- 草稿读取失败不编造零值：保留上次成功数量，显示重试提示；首次尚未读取成功显示“—”。账号切换、页面卸载和迟到响应不会覆盖新账号数量。
- 四个事务页使用唯一顶部导航：左侧无文字返回箭头，居中“管理我的发布 / 草稿 / 收藏 / 预约”。移除右侧返回文案和内容区重复标题、箭头。
- 使用共享 `page-header`，四个所在路由使用自定义导航，避免原生导航和页面导航重复。按 `wx.getWindowInfo()` 与 `wx.getMenuButtonBoundingClientRect()` 的真实值计算状态栏、导航高度与标题可用区域，并支持窗口变化。
- 四页箭头直接回个人中心主面板。资料、隐私等其他页内面板保留用户此前确认的左侧子标题、右侧返回方式。
- 原配色、五导航、六主题、业务权限和已有数据保留。未修改后端、数据库结构或部署环境。

## 文件与证据

- `miniprogram/utils/draft-summary.js`：草稿合并统计与实际读取。
- `miniprogram/pages/me/index.*`：数字、错误重试、返回主面板和收藏导航。
- `miniprogram/pages/publish/index.*`：我的草稿、编辑返回保存、统一导航。
- `miniprogram/pages/my-posts/index.*`、`my-bookings/index.*`：去重后的顶部导航、直达个人中心。
- `miniprogram/components/page-header/index.*`：胶囊安全区域与单一返回入口。
- `miniprogram/utils/navigation.js`：统一返回目的地。
- `backend/tests/draft-summary.test.js`、`me-layout.test.js`、`profile-client.test.js`：相关客户端专项16项通过，0失败/跳过，日志 `my-workspace-client.log`。
- `scripts/check_my_workspace_ui.js`：微信实际编译后的14项检查通过，包含四页导航与返回、数量0/1/2、重复草稿去重、编辑保存、真实提交后清理；结果 `my-workspace-ui-result.json`，日志 `my-workspace-ui.log`。
- 工程检查：18路由，21份WXML嵌套及处理器检查通过。原8份冻结配色/全局/底栏文件的SHA-256一致。

截图：`my-workspace-管理我的发布.png`、`my-workspace-管理我的草稿.png`、`my-workspace-管理我的收藏.png`、`my-workspace-管理我的预约.png`；`my-workspace-count-two.png`记录实际两份草稿计数。

微信检查使用隔离开发账号、真实本机API和PostgreSQL，未让验收内容公开上线。检查后恢复原登录。原生系统手势、真机触控和读屏器尚未验收；导航自动化通过共享组件真实返回事件验证，不能等同于物理手指测试。
