# VM Design System 1.0 阶段二

## Design Token

采用用户指定的八个基础色值。页面底色为 `#FAF9F8`，内容表面为 `#FFFFFF`，主要文字为 `#242329`，次级文字为 `#66616B`，品牌强调为 `#A67E91`，浅强调为 `#F4EBF0`，氛围辅助为 `#EEEAF4`，边框为 `#EAE6E9`。

按钮文字使用衍生色 `#17151B`，链接使用加深强调色 `#745269`。文字与按钮对比度至少为 4.5∶1，图标与输入边界至少为 3∶1。已有 gentle 偏好键对应柔和中性色。

字号、间距和行高统一在 `styles/vm-design.wxss`。默认视觉标题为 48rpx，页面标题为 38rpx，模块标题为 36rpx，卡片标题为 32rpx，正文为 30rpx，辅助信息为 26rpx。常用操作为 96rpx，列表行为 104rpx。

页面使用平面底色，内容使用实体阅读面。底部导航高度为 56px 加底部安全区，中心发布按钮完整放在导航内部。导航采用实体表面与细边框。

## 公共能力对应实现

| 能力 | 复用实现 |
| --- | --- |
| AppHeader | page-header，动态胶囊测量，增加左对齐品牌标题 |
| BottomNavigation | custom-tab-bar，五路由与未读绑定 |
| SearchBar | search-bar，统一输入与清空、提交状态 |
| CategoryTabs | channel-tabs |
| FilterBar | browse-filters、active-conditions |
| ContentCard | content-card 的 stream / article 布局 |
| MerchantCard | content-card 的 merchant 布局 |
| ServiceCard | content-card 的 service 布局 |
| PrimaryButton / SecondaryButton | 共享 btn / btn.light 规范与原生按钮状态 |
| FormField | publication-fields 与共享 field / field-area / field-label |
| StatusTag | status-badge |
| LoadingSkeleton | feedback-state 的 loading 状态 |
| EmptyState | feedback-state 的 empty 状态 |
| ErrorState | feedback-state 的 error 状态 |
| BottomSheet | 新增 bottom-sheet，安全区与可滚动内容 |
| ConfirmDialog | confirm-dialog 复用 bottom-sheet |

完整修改清单见 `CHANGED_FILES.json`，包含语义色板、样式入口、共享组件、图标资源、颜色测试和截图脚本。

## 实测结果

- 默认回归共 462 项，448 通过、0 失败、14 个数据库项按原规则跳过。
- 颜色与导航专项 5 项通过。
- 项目结构检查通过，44 份 WXML 嵌套检查通过。
- 五个主页面在真实微信开发者工具中完成首屏截图，见 `visual/RESULTS.json`。
- 首页截图增加真实资讯 API 数据断言，并在当前已处于该导航时显式刷新生命周期。
- 本轮模拟器存储与 API 地址恢复验证通过。

## 待处理与回滚

五个主页面的专属结构将在阶段三实施，阶段四检查页首、中段、底部及业务状态。表单与弹层的设备键盘行为仍待真机验证。

回滚本阶段时针对阶段二提交执行 `git revert`，并重新生成、核对图标与冷启动色值。阶段一回滚基线为 `c6083b1`。
