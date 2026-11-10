# 左右分类目录布局调整 · 2026-10-18

用户描述的“左侧行业、右侧分组项目、草稿箱”在当前源码中位于发布页，因此调整 `pages/publish`，不将其误报为发现页频道改造。

- 整体无外围卡片，左右列按28:72分配；连续浅主题侧栏，局部选中态保留圆角。
- 最新补充：移除两侧顶部重复的选中行业名及其占位、分隔线；左侧选中态与正常的右侧分组联动保留。
- 右侧分组只显示原组名，采用现有 ink 文字色及较强字重；不再额外拼接行业名。跨行业搜索另行显示来源行业。
- 项目比组标题缩进7px，左右列间隔8px；行底部极浅细线从左侧缩进7px，不为整个右栏增加圆角或边框，项目行背景透明。
- 分组标题15px／600，项目文字15px／400；组间距18px，首组顶部无额外间隔。项目正常行高50px，容纳最多两行；大字保留144rpx行高。未开放标记仍在右侧。
- 搜索按钮移至顶部草稿箱左侧；原项目搜索、草稿管理、目录ID与发布准入保留。目录仍注明建议稿性质。

修改：`miniprogram/pages/publish/index.wxml`、`index.wxss`、`index.js`；`scripts/check_page_structure_ui.js` 的位置断言同步为“搜索在草稿箱左侧”，原搜索和表单断言保留。没有改后端、数据库、冻结颜色或底栏源码。

此前批次验证（非本轮重跑）：结构、20个WXML、18路由和V0.25完整性检查通过；现有分类合同与账号草稿测试6项通过、0失败、0跳过。微信模拟器专项18项通过，实际遍历27行业／83组／418项目，逐项检查标题、组名与行高，测量28:72比例、6–8px间隔与缩进，并验证搜索进入原服务需求表单及草稿入口。六主题通过，clear同时开启大字。

证据：`publish-directory-ui-result.json`、`publish-directory-ui.log`、`publish-directory-checks.log`。

实际截图：`publish-directory-before.png`、`publish-directory-after.png`、`publish-directory-search.png`、`publish-directory-{prism,dark,clear,quiet,warm,gentle}.png`。模拟器验收暂用游客显示偏好，备份并恢复游客本机草稿，未提交发布或写入账号草稿。真机触摸、键盘和读屏仍待人工验收。

## 本次补充：移除左右顶部行业名

已移除 WXML 两个重复行业标题、JS 的 `selectedCategoryName` 展示字段及专用样式；保留左侧选中态、原 `selectCategory` 行业切换与分组加载逻辑。结构检查通过（18路由、五导航），20个WXML标签配对检查及发布页JS语法检查通过。微信工具重开编译后取得本轮实际截图 `publish-directory-no-headings.png`，可见左右顶部均无行业标题及占位。自动化方法调用遇到工具错误 `No context found for objectId 1`，因此本轮未完成模拟器点击切换回归；前述18项为上一批验收结果，不算本次重跑。配色与底栏未改动。

## 本轮补充：目录尺寸与透明列表

只调整发布目录局部WXSS。微信开发者工具 `auto` 成功后实测：两列宽度比例27.999:72.001、间距8px、正常项目行高50px、组标题15px/600、项目15px/400、组间距18px，项目背景透明。点击家政维修后右侧分组正确切换，再恢复二手闲置；重复行业标题仍不存在。临时开启页面大字样式实测行高74px、文字行高23px，截图后恢复原显示偏好，未写用户偏好、草稿或业务数据。

本轮20个WXML与18页面/五导航结构检查通过，冻结配色和底栏8个文件哈希均与基线一致。测量记录：`publish-directory-refined-result.json`；实际截图：`publish-directory-refined.png`、`publish-directory-refined-large.png`。本轮仅模拟器验收，真机显示、触摸及读屏待人工确认；未重跑后端与数据库测试。
