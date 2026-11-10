# 微信上传包体超限修复

2026-10-20。用户真机调试日志显示错误 80051：source size 2156KB exceed max limit 2MB。该条失败由源码包体超限触发。

修改 `project.config.json`：

- 在 packOptions.ignore 中精确排除 `data/city-catalog.json`、`data/city-centers.json`、`data/industry-catalog.json`。这些是生成/审计用台账，源文件保留，未删除行政区划或行业数据。
- 已核查客户端分别 require 对应 JS 生成模块；三对 JS/JSON 数据逐项深度比对一致。
- 开启 `setting.minified`，保留现有 WXSS/WXML 压缩。
- `uploadWithSourceMap` 保持 true，继续支持源码调试。未通过放宽 2MB 限制来绕开问题。

源码文件统计共 1,738,690 字节；排除三份重复 JSON 后为 1,270,104 字节，减少 468,586 字节。源码统计不等同于微信编译包大小。

微信开发者工具 CLI 的真实 preview 上传成功，编译包 **1,256,884 字节（约 1.20 MiB）**，低于 2 MiB，上限余量约 0.80 MiB。证据：`package-limit-preview-info.json`、`package-limit-preview.log`。此次为开发预览上传，未提交审核或生产发布；用户仍需重新点击真机调试并连接手机完成设备验证。

校验：目录、城市、地理数据相关 12 项测试通过；20 路由/5 Tab/24 WXML 结构检查通过。统计见 `package-limit-source-size.json`，测试见 `package-limit-data-regression.log`。视觉配色、业务准入、用户数据和接口未修改。
