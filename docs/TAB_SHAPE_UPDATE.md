# 底栏外形调整 · 2026-10-18

按用户要求仅更换五导航图标和中央隆起的曲线分隔线；五入口、名称、配色、动态选中色、角标、发现页隐藏与恢复规则保留。

微信原生 TabBar 无法提供该曲线外形，因此新增 `custom-tab-bar` 组件与 `utils/tab-bar.js`，`app.json` 仅为原底栏配置增加 `custom: true`。原 list 和色彩字段、旧图标资产保留；主题、角标、发现滚动以及页面底部安全区做必要的渲染适配。

新增图标和曲线由 `scripts/build_curved_tab_assets.js` 生成，继续使用冻结的六主题。`palettes.js` 及 `scripts/prism-color-baseline.json` 哈希与 `tab-shape-before.json` 一致；单元测试同时精确检查原底栏字段未改。

修改前：`tab-shape-before-{home,discover,publish,messages,me}.png`；修改后：`tab-shape-after-{home,discover,publish,messages,me}.png`。消息页随后按新的用户指示进一步调整布局，其最新截图见 `MESSAGES_LAYOUT_UPDATE.md`。

验证：`tab-shape-ui-result.json` 记录20项通过，涵盖五入口、六主题、滚动隐藏恢复、身份角标隔离、二级页面不重复出现底栏及运行异常检查。`messages-layout-regression.log` 为包含后续消息布局的最新完整数据库回归结果。

主题专项最初遇到登录账号的服务端偏好同步覆盖本地临时测试值，改为隔离的游客偏好样本后五种补充主题全部通过，结束恢复用户状态。游客角标检查脚本已支持实际自定义组件，同时保留原生 fallback 检查。

微信模拟器已验收；真机触摸、不同设备底部安全区及读屏器仍待人工验收。未使用 Git、未复制整套工程、未打包或部署。
