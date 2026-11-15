# 五个主页面吸顶与滚动验收

基线版本为 `3c5d8c5`。本次在现有页面上调整滚动容器、吸顶偏移和安全区域，并修复首页轻微上滑时搜索栏与品牌头部重叠的问题。

## 页面行为

- 首页上滑后收起品牌，城市搜索栏固定在顶部胶囊左侧。四个信息频道到达搜索栏下方后吸顶，返回顶部恢复品牌与完整搜索栏。
- 发现页标题固定，七个频道与紧凑工具栏吸顶。城市、排序与全部筛选保留独立入口，完整筛选条件在面板中展开，搜索与地图继续位于右下角。
- 发布页上滑收起宣传卡片，搜索与快捷按钮固定，左右分类栏独立滚动。四个快捷操作放入纵向浮层菜单，点击外部关闭。右侧重复行业标题已移除。
- 消息页固定标题、会话与通知切换及搜索，分别记忆两个列表的滚动位置。切换账号清空位置记录。
- 我的页面保留固定标题，个人资料区随滚动适度收缩，其余入口正常滚动。
- 聊天详情固定对象信息和输入区域，中间历史独立滚动，并根据键盘高度调整可用空间。

顶部与底部尺寸通过运行时测量获得。滚动状态只在边界变化时更新，减少连续滚动中的界面通信。

## 前后截图

| 页面 | 调整前 | 调整后 |
| --- | --- | --- |
| 首页 | [原首页](before-home.png) | [当前首页](after-home.png) |
| 发现 | [原发现页](before-discover.png) | [当前发现页](after-discover.png) |
| 发布 | [原发布页](before-publish.png) | [当前发布页](after-publish.png) |
| 消息 | [原消息页](before-messages.png) | [当前消息页](after-messages.png) |
| 我的 | [原个人中心](before-me.png) | [当前个人中心](after-me.png) |

关键滚动状态与操作截图如下。

- [首页轻微上滑](home-scroll-before-pin.png)与[头部收起后的交接位置](home-scroll-header-handover.png)
- [首页两层吸顶](fixture-home-sticky.png)与[首页大字模式](fixture-home-large-text.png)
- [发现页吸顶](fixture-discover-sticky.png)、[全部筛选面板](discover-filters.png)与[发现页大字模式](discover-large-text.png)
- [发布页宣传卡片收起](publish-collapsed.png)、[恢复](publish-restored.png)、[快捷操作下拉菜单](publish-dropdown.png)、[搜索](publish-search.png)与[大字模式](publish-large-text.png)
- [消息列表滚动](fixture-messages-scroll.png)与[个人资料收缩](me-scrolled.png)
- [聊天历史滚动](fixture-chat-scroll.png)与[键盘高度布局模拟](fixture-chat-keyboard.png)

## 验证环境与证据范围

截图来自独立副本中的真实微信开发者工具模拟器，尺寸为 390 × 844。基线截图来自独立的 `3c5d8c5` 工作树。

带 `fixture-` 前缀的截图以及首页交接截图使用明确标注的运行时布局记录，以提供足够长的列表。测试服务使用隔离内存仓库，数据随进程退出释放。键盘截图通过模拟键盘高度验证布局。

发布页右侧内容区由基线约 429px 提升至当前展开状态约 492px，宣传卡片收起后约 581px。双栏外框由 494px 扩展至 583px，底部内容停在导航栏上方。

后端完整测试共 523 项，通过 505 项，失败 0 项。18 项 PostgreSQL 测试因未配置 `PG_TEST_DATABASE_URL` 跳过。开发者工具的逐项检查与尺寸记录见 [界面测试结果](ui-result.json)，汇总与源码一致性记录见 [测试汇总](test-results.json)。

界面检查覆盖 418 项分类图片加载、七频道切换、四个快捷入口往返、五个底部导航、搜索、筛选、左右独立滚动、消息位置恢复和聊天布局。测试结束核对登录存储恢复和运行时接口覆盖清理。

## 待验收项目

- 红米 Note 12 Turbo 扫码真机调试，检查持续快速滑动、反向滑动、字体、软键盘、弹层及滚动性能。
- iPhone 真机检查安全区域、键盘及滚动行为。
- 配置独立 PostgreSQL 测试数据库后补跑已跳过的 18 项测试。
- 微信开发者工具正式编译上传后的实际分包体积核验。

## 修改文件与回滚

完整文件清单见 [changed-files.txt](changed-files.txt)。

本次独立本地提交的标题为 `Unify main-page scrolling and fix home header handover`。通过 `git log --oneline --grep="Unify main-page scrolling"` 找到提交号后，可使用 `git revert <提交号>` 回滚本次布局、测试和验收资料。提交前的参考基线为 `3c5d8c5`，对应源码工作树位于 `C:/Users/chejun/.codex/backups/city-life-miniapp/scroll-baseline-3c5d8c5`。回滚后重新编译小程序，再复查五个主页面与聊天详情。
