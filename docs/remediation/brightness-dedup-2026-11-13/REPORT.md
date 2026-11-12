# 个人中心入口去重与全站亮度统一

## 个人中心结构

发布、收藏、草稿和预约集中到顶部四项统计，各提供一个入口。下方使用连续菜单，依次为服务中心、浏览记录、通知设置、帮助与反馈、账号与安全、隐私与设置、个人数据和清理缓存。

“关于小程序”位于帮助与反馈，屏蔽管理位于隐私与设置。消息通过底部消息导航进入。个人资料使用一个头像编辑入口及昵称、简介、城市三行资料。账号与安全使用一个手机号与认证入口，服务中心集中展示商家和行业事项。

原有入口处理函数及账号、资质、权限接口继续承担各项操作。自动化已读取资料、账号、服务、帮助、通知与隐私页面，并检查实际返回的状态与控件。

## 亮度调整

默认主题采用更亮的珍珠白底色 `#FDFCFB`、纯白内容表面 `#FFFFFF`、浅粉强调底 `#FCF4F7` 和浅紫辅助底 `#F5F2F9`。运行时Token、冷启动颜色、原生导航背景与27个路由的色彩验收基线同步更新。

首页摄影和广告主视觉采用浅色渐变阅读层及墨灰文字。深色主题使用暗色阅读层。积分入口使用主题浅色表面。

五个主页面在相同设备坐标取样，渲染底色均为RGB `[253,252,251]`。该检查对应页面底色，图片、按钮和内容区域按各自角色呈现。

## 截图与测试

截图来自微信开发者工具390×844模拟器，共25张。内容、计数和会话来自带有验收标记的独立PostgreSQL测试schema。资料页显示隔离验收账号，home-local-data.png展示恢复后的当前本地数据。

| 页面或状态 | 截图 |
| --- | --- |
| 首页 | [提亮后的首页](visual/home-normal.png) |
| 个人中心 | [入口去重](visual/me-normal.png)、[页面底部](visual/me-bottom.png) |
| 发现、发布、消息 | [发现](visual/discover-normal.png)、[发布](visual/publish-normal.png)、[消息](visual/messages-normal.png) |
| 资料与账号 | [个人资料](visual/me-profile.png)、[账号与安全](visual/me-account.png) |
| 功能面板 | [服务中心](visual/me-service.png)、[帮助](visual/me-help.png)、[通知设置](visual/me-notifications.png)、[隐私设置](visual/me-privacy.png) |
| 大字与访客状态 | [首页大字](visual/home-accessible.png)、[我的大字](visual/me-accessible.png)、[访客](visual/me-guest.png) |

- 默认回归484项，469项通过，失败0项，15项数据库专项跳过。
- 个人中心及色彩专项12项全部通过，覆盖入口唯一性、头像和认证入口去重、真实计数、账号隔离、配色与文字对比度。
- 44份WXML嵌套检查通过。
- 五个主页面的实际底色检查通过，7组胶囊及底部导航几何检查通过，捕获运行异常0项。
- 原存储、认证和API地址恢复检查通过，测试schema清理完成。
- 官方预览成功，主包2046138字节，低于2097152字节限制。

源代码指纹、截图环境和实际取样数据收录在验证记录中。[界面结果](visual/RESULTS.json) · [测试与包体积](EVIDENCE.json)

## 待验收

本轮原生截图覆盖五个主页面及相关个人中心面板，其他页面通过共享Token和27路由色彩契约检查。全站视觉确认与Android、iPhone真机验收按此前设备安排继续待办。

## 文件与回滚

本轮基于提交 `0819c7f`，交付提交标题为 `Deduplicate personal center and brighten shared canvas`。使用 `git log --oneline --grep="Deduplicate personal center and brighten shared canvas" -1` 查询提交，再执行 `git revert <该提交ID>` 回滚本轮页面、Token、基线和验收记录。完整文件列表位于本目录。[修改清单](CHANGED_FILES.json)
