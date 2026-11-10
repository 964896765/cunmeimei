# 小程序媒体与编辑稳定性补强

日期：2026-11-01。范围：本地小程序、测试及验证脚本。没有连接云服务器、执行数据库迁移、更改生产配置或改动后端业务实现。

本报告保留媒体补强阶段的262项通过记录；后续搜索、发现及预约的最新结果见[搜索与预约稳定性报告](SEARCH_BOOKING_STABILITY_UPDATE.md)。

## 用户可见变化

- 图片上传、商家证照上传与普通接口共用账号校验和登录续期；旧账号的成功结果、401和退出响应不能覆盖新账号。自动续期最多一次，只能在同一用户身份下重试。
- 私有图片下载增加15秒超时、同账号401续期；切换账号或退出后拒绝晚到结果。失败/作废下载产生的临时文件会尽力删除，成功文件交由正常预览/缓存流程使用，不清空用户存储。
- 图片发送前检查非空、2MB上限和JPG/PNG文件头，证照类型从实际字节识别，不依赖临时文件扩展名。客户端预检不代替服务端完整解码、文件检查及资源保护。
- 选图窗口防重复打开，兼容chooseMedia/chooseImage；取消静默返回，账号变化则拒绝旧选择。旧窗口complete回调不会解锁另一个待处理窗口。
- “我的发布”和商家服务表单绑定编辑版本，关闭、替换表单或离开页面后，旧选图、上传、图片读取不再回填；已移除照片不会被晚到读取恢复。单个表单仍最多6张。
- 发布记录与服务列表新增加载和错误重试提示。加载失败保留上次记录，不显示“没有记录”的成功空状态；服务权限重新读取失败时暂停编辑，重试成功保留未提交照片。
- 撤回发布、暂停/重提服务及提交商家核验材料，在确认窗口返回时重新检查账号。商家证照上传绑定原申请，不能在申请替换后上传旧材料。

## 改动文件

业务前端：

- `miniprogram/utils/api.js`、`miniprogram/utils/image-picker.js`
- `miniprogram/pages/my-posts/index.js`、`index.wxml`
- `miniprogram/pages/merchant-services/index.js`、`index.wxml`
- `miniprogram/pages/merchant/index.js`

新增测试：`backend/tests/media-session-client.test.js`（13项）、`media-editors-client.test.js`（13项）、`image-picker-client.test.js`（6项）。原商家防重复提交测试补充真实使用的wx.getStorageSync模拟，原有断言保留。

## 验证证据

| 验证 | 本轮结果 | 边界/证据 |
| --- | --- | --- |
| 旧实现复现 | 初始媒体12项中10失败；编辑器10项全部失败 | `local-ui-audit/media-races-before.log`、`media-editors-before.log`；后续增加用例未计入这两份初始日志 |
| 最新非PG全量 | 269项：262通过、0失败、7个PG套件跳过 | `local-ui-audit/media-hardening-non-pg.log`；子进程显式清空DATABASE_URL与PG_TEST_DATABASE_URL |
| 微信媒体/编辑UI | 13通过、0捕获异常 | `local-ui-audit/media-native-result.json`；工具2.02.2608080、SDK3.17.4 |
| 微信积分回归 | 12通过、0捕获异常 | `local-ui-audit/points-native-result.json`，共享API修复后重新执行 |
| 语法检查 | 改动JS及新验证脚本通过node --check | 不代替微信编译和真实设备测试 |
| 清理复核 | 返回首页，媒体/积分测试钩子均不存在，两种临时测试身份均未残留 | 原存储键逐项还原；只删除本次生成的测试图片 |

媒体原生验证使用真正微信编译器、渲染器、页面控件、本地文件系统与wx.request，HTTP只连随机回环端口的内存夹具服务；选图回调仍模拟。验证结束关闭该临时服务。积分原生验证使用内存请求夹具。两者均未连接业务数据库，均不是微信真实登录、真实商家/交易或真机验收。

初版媒体脚本直接在automation evaluate环境回调wx.request，出现逻辑数据与渲染不同步；改用独立回环HTTP服务后复核通过。最终脚本没有强制setData来绕过页面断言，控件触发后等待实际状态更新再断言。期间只重启当前项目的开发工具会话、清理编译缓存，没有清除用户登录、草稿或文件缓存。

截图已逐张抽查：

- [发布读取失败与重试](local-ui-audit/publication-retry-native.png)
- [无效服务图片提示与保留照片](local-ui-audit/service-photo-error-native.png)
- [服务列表重试](local-ui-audit/service-retry-native.png)

复现入口：`node scripts/check_media_native_audit.js`，需已安装的微信开发者工具和项目自动化端口9420。脚本保存/还原原存储与请求钩子，只创建本次独立文件；不启动业务服务或迁移。不要并行运行两份微信验证脚本。

## 仍需完成

1. 微信iOS/Android实际相册、拍照、授权拒绝、HEIC等不支持格式提示、弱网/超时与键盘遮挡验收。当前支持JPG/PNG，不承诺客户端可处理全部手机原图格式。
2. 本地业务库备份、隔离恢复与018–024升级获准后，进行真实后端/PG及权限端到端联调。本轮没有为让测试通过而迁移现有库。
3. 2GB服务器上传解码并发门、像素上限、OSS及备份运维仍属于部署阻塞；本轮客户端预检不能消除服务端Sharp内存风险。
4. 正式小程序包HTTPS/开发登录/域名检查、平台资格与真实微信能力仍按[部署审计](deployment/SERVER_AUDIT.md)验收，没有自动发布。
