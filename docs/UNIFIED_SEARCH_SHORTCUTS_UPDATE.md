# 快捷入口、统一搜索与消息页调整 · 2026-10-19

配色继续冻结，不改版本、不使用 Git、不复制工程、不生成 ZIP，不部署生产或接入支付。

## 本轮实际调整

- 快捷入口只呈现一份27行业列表，按原分类顺序排列，选中以现有主题标色并显示“−”，未选显示“＋”；点击整行切换，提供选中计数和完成保存。移除搜索、重复的已选区、该页更多按钮及其拖动代码。未对首页的末尾更多、两行横滑和账号存储逻辑作变更，原有选择顺序仍保存在账号本机设置中。
- 发现页用CSS线性放大镜与地球替换Emoji，沿用主题色，46px方形圆角表面、细边界和按压反馈；仍为搜索在上、地图在下，保留沉浸滚动隐藏及原地图入口。
- 消息页删除内容区左上角标题，原生头部标题改为居中的“消息中心”；现有联系申请、通知、权限及隐私逻辑未修改。
- 继续使用原有搜索路由。首页搜索与发现搜索均进入 `pages/search/index`，无全局/发现模式切换。顶部减少留白、白色/主题实体搜索框、一行城市/分类/排序/高级筛选。结果、加载、无结果、失败重试和分页留在此页。
- 最近搜索仅本机当前账号存储，最多10条、去重，可确认清空；过滤明显号码、邮箱、地址和已识别的敏感词。这是基础保护，不宣称能够识别所有自然语言隐私表达。
- 本地精选从现有审核公开信息API读取，继承城市、可见性、审核、状态及测试数据隔离；无公开内容则整个模块隐藏。当前东莞普通浏览数据为0条，未造房源或商家。

## 真实热搜的范围

新增迁移 `014_search_popularity.sql`，001–013均未改写。按城市、日期和普通词白名单存匿名次数，无用户ID、IP或任意原始查询字段。仅明确提交并成功返回的搜索发起统计；筛选、重试、翻页不增加次数。服务端排除开发测试请求、关闭分类、敏感和非白名单词；同一进程同来源/城市/词一分钟去重。最近7日达到3次才进入动态排名，无数据不填固定榜单；聚合表保留30天。

这是最小的单体统计能力，不是复杂推荐或推广系统。普通词白名单是准入范围，不是固定热度排名。跨实例防刷和更完整隐私识别未在本轮实施。

## 本地环境

Docker Desktop此前未启动，开发容器恢复后随机映射端口发生变化；只更新服务端私密配置中的开发数据库端口，保留原持久卷。新增迁移已应用。只在核验PID、启动时间、命令及3101端口归属后重启本工程3101进程；未操作3100进程或其他Docker数据。

修复启动脚本中PowerShell将JSON时间自动反序列化为DateTime导致字符串比较失败的问题，改为比较UTC ticks，保持进程归属检查严格。安全策略只对子进程使用ExecutionPolicy Bypass，未修改Windows永久策略。

## 当批验证证据（后续地区与高级筛选见 SEARCH_FILTERS_UPDATE.md）

| 命令/范围 | 通过 | 失败 | 跳过 |
| --- | ---: | ---: | ---: |
| 严格 `npm run verify:pg` | 35 | 0 | 0 |
| 隔离数据库环境 `npm test` | 180 | 0 | 0 |
| `npm run test:e2e` | 15 | 0 | 0 |
| `npm run test:permissions` | 9 | 0 | 0 |
| `npm run test:merchant-application` | 4 | 0 | 0 |
| 最终客户端及热搜控制器专项 | 24 | 0 | 0 |

专项与主套件有重复，不能相加为独立业务数量。原始回归日志：`search-shortcuts-postgres.log`；控制器日志：`search-client-final.log`。早期无测试DSN的直接npm test曾有2项跳过，随后已在真实隔离PostgreSQL完整重跑；不将早期跳过当作数据库通过。

严格门禁使用本机postgres:16-alpine、随机本地端口、独占Compose项目和临时卷；验证初始化健康、原迁移、并发业务、城市隔离、热搜真实读写及并发累计、过期排除。结束仅删除该测试项目容器、网络、卷，清理验证通过。

18路由/五导航、20个WXML配对、JS语法及V0.25完整性检查通过。冻结配色和底栏8文件哈希保持一致。

当批微信模拟器23项通过，证据以最终 `unified-search-ui-result.json` 和 `unified-search-ui.log` 为准。快捷入口全选/取消已逐项触发验证；完成保存处理器返回首页及首页更多保留另见 `shortcuts-two-states-result.json`。模拟器自动化曾遇路由超时，重启工具复验；不将超时轮次计为通过。

## 实际截图

- `unified-shortcuts.png`：27类单一列表、标色减号/未选加号。
- `unified-search-idle.png`：真实空记录、空热搜、精选隐藏。
- `unified-search-results.png`、`unified-search-empty.png`：实际接口搜索的同页状态。
- `unified-discover.png`：替换后的线性悬浮按钮。
- `unified-messages.png`：居中原生消息中心标题。
- `unified-search-{prism,dark,clear,quiet,warm,gentle}.png`：六主题，clear同时启用大字。

截图中没有将示意榜单或房源写入正式页面。界面验收的显式查询采用开发测试标记排除热搜计数，验收结束恢复账号显示偏好、浏览城市、最近搜索与快捷项存储。原有业务数据不删除。

## 主要源码

- 小程序：`pages/categories`、`pages/discover`、`pages/messages`、`pages/search`的相关JS/WXML/WXSS/JSON；`utils/search-history.js`。
- 后端：`src/server.js`、`src/search-popularity.js`、两种repository、迁移014。
- 验证：`tests/page-quality.test.js`、`tests/search-popularity.test.js`、`tests/product-capabilities.test.js`、`scripts/check_unified_search_ui.js`；旧页面结构脚本同步27项/两状态断言，保留原有业务断言。
- 本地脚本：`scripts/start_local.ps1`、`scripts/start_sorting_local.ps1`的启动时间比较。

## 尚待验收

Android/iPhone真机触摸、键盘、小屏/大字的物理设备显示、读屏与持续弱网未验收。当前普通城市内容为空，所以本轮正式浏览的有结果卡片与热搜排名截图缺少真实运营样本；对应API读写/审核/分页/统计在隔离PostgreSQL测试中验证，不用伪造公开信息补图。腾讯位置服务Key仍未配置，自动逆地理解析不在本轮完成范围。
