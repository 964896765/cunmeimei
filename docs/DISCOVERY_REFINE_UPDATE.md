# 发现页频道、排序与悬浮图标调整 · 2026-10-18

## 已实施

- 频道栏背景改为透明，去掉覆盖原渐变的矩形色块；原频道、选中色和六主题保持。
- 排序触发器采用细线箭头、44px 点击区域和可关闭的排序面板。打开面板临时隐藏底栏，关闭恢复；原底栏源码及颜色未改。
- 右下角只显示 🔍、🌏，移除圆形背景、边框、阴影和文字；搜索、地图路由及上滑隐藏／下滑恢复保留。

## 排序能力

| 选项 | 实际规则 |
| --- | --- |
| 综合推荐 | 标题关键词匹配优先，其后按真实收藏数与发布时间衰减排序 |
| 最新发布 | 发布时间、ID 降序，保留原默认值 |
| 热门优先 | 活跃账号真实收藏数优先，同数按最新；不虚构浏览量或互动量 |
| 距离最近 | 用户主动选择后获取 GCJ-02 GPS；后端按核验公开商家／可预约服务点位计算球面距离，过滤暂停、未核验与不公开记录 |
| 价格从低到高／高到低 | 发现页仅在房产、闲置、服务频道可选；数字价格全库排序后分页，面议等不可比较值排后 |
| 薪资从高到低 | 显示条件说明并禁用；招聘与可比较薪资字段尚未开放 |

排序在后端完成后分页；前端不对当前20条数据伪造全局排序。切换频道会重置不适用的排序。原全局搜索 sortIndex 的三个编码保留兼容。

GPS 坐标仅保存在页面内存，用于本次距离查询，不覆盖浏览城市，不写入用户档案或发布地址；没有接入腾讯逆地理编码，也不需要腾讯 Key。个人发布不会因距离排序获得公开住址。近似位置沿用数据库已有公开精度。

## 修改位置

- `miniprogram/pages/discover/index.{js,wxml,wxss}`：视觉、面板、条件和定位交互。
- `miniprogram/utils/discovery-sorts.js`、`feed-query.js`：排序条件与兼容查询。
- `backend/src/server.js`、`pg-repository.js`、`memory-repository.js`：排序校验、真实收藏／距离排序；内存模式不编造地理点位。
- `backend/tests/discovery-sorts.test.js`：四项条件、兼容、取消／拒绝定位与 HTTP 边界测试。
- `backend/tests/postgres.test.js`：新增真实收藏、分页、价格、停用账号、核验距离及暂停拦截子测试。
- `backend/tests/page-quality.test.js`：补充新依赖的测试替身，原断言保留。
- `scripts/check_discovery_refine_ui.js`：真实模拟器联调及状态恢复。
- `miniprogram/utils/runtime.js`、`scripts/start_sorting_local.ps1`：更新后的本地 API 接入。

没有新增数据库结构或改写历史迁移。

## 本地运行

停止旧3100进程的操作被自动审批策略拒绝，因此保留原进程，并以原 `backend/.env.local` 的数据库连接另启更新后端：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start_sorting_local.ps1
```

更新后端只监听 `127.0.0.1:3101`，小程序 runtime 已指向该端口。旧3100服务和原持久开发数据库均保留。脚本检查端口与项目进程归属，不停止其他服务，不永久修改执行策略。正式发布检查仍应拒绝本地 HTTP 与开发登录。

## 实际证据

| 范围 | 通过 | 失败 | 跳过 | 证据 |
| --- | ---: | ---: | ---: | --- |
| 排序、页面竞态及冻结颜色专项 | 27 | 0 | 0 | `discover-refine-unit.log` |
| 严格 PostgreSQL 门禁 | 34 | 0 | 0 | `discover-refine-regression.log` |
| 主套件 | 175 | 0 | 0 | 同上 |
| e2e | 15 | 0 | 0 | 同上 |
| 权限 | 9 | 0 | 0 | 同上 |
| 商家入驻 | 4 | 0 | 0 | 同上 |
| 微信发现页专项 | 24 | 0 | 0 | `discover-refine-ui-result.json` |

各命令覆盖重叠，不合计为独立测试总数。数据库门禁真实运行，专属临时容器、网络和卷已清理。新增测试最初使用了未规范化的区县字段和错误的暂停枚举，修正测试数据为现有真实约束后重跑，没有改写迁移或放宽状态限制。

微信工具曾保留旧 JavaScript 缓存，关闭工程后重新 auto 编译，已验证实际新处理器、真实 API 请求与六主题。截图：`discover-refine-before.png`、`discover-refine-main.png`、`discover-refine-sort.png`、`discover-refine-distance.png`、`discover-refine-{prism,dark,clear,quiet,warm,gentle}.png`。

模拟器中距离验收使用明确标记的既有开发服务、临时核验点位和 SDK 模拟 GPS。结束恢复原点位的全部字段、账号、主题与浏览城市；不冒充真实地址或真实设备定位。真机 GPS 授权、手势、软键盘与读屏器仍待人工验收。
