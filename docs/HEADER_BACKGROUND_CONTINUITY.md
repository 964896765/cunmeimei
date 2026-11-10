# 发布页层级与个人中心顶部衔接

2026-10-20。本轮使用既有色彩令牌，未增加主题或修改品牌色值。

- 发布分类的选中态改为现有主按钮色底和对应反白文字，未选中项加深为正文色。
- 右侧分组采用浅主题色带、品牌色细竖线和强调色标题；项目名称加深，保留原有 28:72 比例、8px 间距、50px 项目行高及开放式右侧布局。
- 发布页与个人中心启用连续背景画布。正文底图固定于视口，固定头部复用同一渐变定义、尺寸和原点；去掉头部纯色底在合成边缘产生的浅色细线。个人中心滚动时仍使用同一底图坐标。
- 六种主题色值、底部导航、纯文字草稿箱入口及原有页面交互保持原有规则。其他页面默认不启用此头部选项。

修改位置：`miniprogram/app.wxss`、`components/page-header/`、`pages/publish/index.wxml` 与 `index.wxss`、`pages/me/index.wxml`。

验证：项目结构和 WXML 检查通过；相关分类与个人中心逻辑回归 12 项通过（`header-continuity-regression.log`）；微信开发者工具检查 26 项通过，包含两页六主题、个人中心滚动、选中态唯一性和纯文字草稿入口（`header-continuity-after-result.json`）。在截图头部边界附近逐行检查左右背景留白的 RGB 差值，虹彩主题最高 4，其余主题为 0；同时人工检查实际截图。自动化不等同于真机验收。

前后截图：

- [发布页之前](header-continuity-before-publish-prism.png) / [发布页之后](header-continuity-after-publish-prism.png)
- [个人中心之前](header-continuity-before-me-prism.png) / [个人中心之后](header-continuity-after-me-prism.png)
- [个人中心滚动之后](header-continuity-after-me-scrolled.png)
