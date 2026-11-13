# 按原版视觉进行局部修正

上轮对配色和个人中心结构改动过大。本轮以用户查看五个主页面时的版本 `0819c7f` 为视觉基准，恢复原有珍珠白与玫瑰色、首页摄影和白字，以及个人中心的统计、积分条、功能宫格和菜单排版。

## 原版基础上的调整

相对视觉基准，小程序代码差异集中在3个文件。

| 文件 | 局部调整 |
| --- | --- |
| `miniprogram/pages/home/index.wxss` | 摄影遮罩左端透明度从0.58调整为0.50 |
| `miniprogram/pages/me/index.wxml` | 去掉与顶部统计重复的四个宫格按钮，功能区形成一行四项，清理缓存集中到功能宫格，头像与手机号认证各提供一个编辑入口 |
| `miniprogram/pages/me/index.wxss` | 清理头像重复小图标的两条样式 |

个人中心一行功能为消息通知、通知设置、清理缓存和浏览记录。下方使用原版的服务中心、帮助与反馈、账号与安全、隐私与设置、个人数据和关于小程序菜单。

默认页面底色为原版 `#FBF8FA`。运行时Token、原生导航、冷启动与色彩验收基线使用该版本的同一套定义。

## 验证与截图

五个主页面共25张微信开发者工具截图，包含相关个人中心面板、访客及大字状态。主页面底色取样均为RGB `[251,248,250]`，7组胶囊与底部导航几何检查通过，捕获运行异常0项。原存储、认证和API地址恢复校验通过。

截图内容来自隔离PostgreSQL测试schema，并带验收标记。home-local-data.png展示恢复后的本地数据。当前验证环境为390×844模拟器。

| 内容 | 截图 |
| --- | --- |
| 首页 | [首页实拍](visual/home-normal.png) |
| 我的 | [个人中心实拍](visual/me-normal.png)、[访客](visual/me-guest.png) |
| 发现、发布、消息 | [发现](visual/discover-normal.png)、[发布](visual/publish-normal.png)、[消息](visual/messages-normal.png) |
| 头像与认证 | [个人资料](visual/me-profile.png)、[账号与安全](visual/me-account.png) |

默认回归483项，468项通过，失败0项，15项数据库专项跳过。个人中心与配色专项11项全部通过，44份WXML嵌套检查通过。官方预览包与源码指纹收录在验证汇总中。[验证汇总](EVIDENCE.json) · [原生界面结果](visual/RESULTS.json)

真机视觉与用户视觉确认继续待验收。

## 交付与回滚

本轮提交标题为 `Restore original visual style with minimal refinements`。完整文件清单记录了相对上一提交的恢复和调整。[修改清单](CHANGED_FILES.json)

原版视觉回退基准为 `0819c7f`。需要撤回本轮局部微调时，可执行 `git restore --source 0819c7f -- miniprogram/pages/home/index.wxss miniprogram/pages/me/index.wxml miniprogram/pages/me/index.wxss`。
