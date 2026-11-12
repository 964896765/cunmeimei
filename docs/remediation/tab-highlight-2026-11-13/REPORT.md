# 底部导航选中着色修正

选中态原来将图标容器扩大为36×32px，并对发现入口增加整块圆形底色。此次将选中效果改为图标资源内部填充，首页、发现、消息、我的使用对应图形轮廓，发布入口在原有圆角框内填色。各入口切换时使用固定容器尺寸。

重新导出六套主题的24份选中图标。头像、房屋、指南针和消息图形依据普通态的轮廓生成。深色主题的指南针与消息内部标记使用深色对比色。

## 验证

- 六套主题的四类填充图标均通过像素边界检查，抗锯齿边缘容差1像素。
- 五个主页面分别读取原生导航尺寸，选中与普通态的容器宽高一致，并通过底部安全区检查。
- 微信开发者工具截图裁切为导航区域，内容来自实际渲染。
- 默认回归共482项，467项通过，失败0项，15项数据库专项跳过。导航专项3项全部通过。44份WXML嵌套检查通过。

| 当前选中入口 | 截图 |
| --- | --- |
| 首页 | [首页选中](navigation-home.png) |
| 发现 | [发现选中](navigation-discover.png) |
| 发布 | [发布选中](navigation-publish.png) |
| 消息 | [消息选中](navigation-messages.png) |
| 我的 | [我的选中](navigation-me.png) |

原生测量结果保存在本目录。[测量结果](RESULTS.json)

## 待验收与回滚

双端真机显示验收沿用用户此前的设备安排。当前截图为开发者工具中的默认主题，其他五主题完成图标像素检查。

本轮基于 `423ae17`，交付提交标题为 `Constrain selected navigation color to icon outlines`。通过 `git log --oneline --grep="Constrain selected navigation color to icon outlines" -1` 查询提交，再执行 `git revert <该提交ID>` 回滚。完整文件与测试记录位于本目录。[修改清单](CHANGED_FILES.json) · [验证汇总](EVIDENCE.json)
