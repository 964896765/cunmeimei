# 首页位置入口调整 · 2026-10-18

根据参考图，将原来仅有城市文字与字符箭头的入口改为：线性定位图标、加粗城市名、细线下箭头。统一垂直对齐，点击区域至少44px，长地区名称省略显示，大字模式同步适配。

- 仅修改 `miniprogram/pages/home/index.wxml`、`index.wxss`；图标源为 `scripts/build_location_icon.js`，生成七个现有主题变体。
- 颜色继续使用原主题 ink／muted，不修改冻结色源、全局样式、底部导航、首页 JavaScript 或城市存储逻辑。
- 原 `showArea` 城市选择处理器保留；已在微信模拟器实际打开城市选择页。
- 六主题（含清晰主题大字）逐一渲染，检查图标、文字颜色、点击高度与箭头位置；未更改原浏览城市。证据：`home-location-ui-result.json`、`home-location-ui.log`。
- 现有颜色及主题测试4项通过，失败0、跳过0；项目结构、WXML 和 V0.25 完整性检查通过。
- 修改前后：`home-location-before.png`、`home-location-after.png`。真机点击及读屏器仍待人工验收。
