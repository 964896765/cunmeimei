# 生产环境变量清单

日期：2026-11-01。以下依据 `backend/src/server.js` 及实际引用源码。仅写变量名和格式，不包含真实凭据，不是可直接加载的生产.env。

## API运行配置

| 变量 | 当前默认/行为 | 拟定生产值与校验 |
| --- | --- | --- |
| `NODE_ENV` | 缺省非production逻辑 | 必须 `production` |
| `DATA_DRIVER` | 入口默认postgres；旧example写memory | 必须 `postgres`，禁止memory生产持久化 |
| `HOST` | `127.0.0.1` | API容器内 `0.0.0.0`，宿主端口仅回环发布 |
| `PORT` | `3100` | 容器3100，与Nginx/upstream/health统一 |
| `DATABASE_URL` | PG模式必需 | `postgresql://<runtime_role>:<encoded_password>@postgres:5432/<db>`，无真实值；密码URL编码；运行账号不可超级用户 |
| `ALLOW_DEV_LOGIN` | 仅字符串true开启 | 必须 `false`；生产代码也拒绝开发登录 |
| `WECHAT_APPID` | 空，真实登录不可用 | 与小程序发布主体一致的真实wx AppID，项目文件格式合法不证明账号授权 |
| `WECHAT_SECRET` | 空 | 服务器专用真实Secret，禁止放入小程序/文档/镜像/命令行 |
| `ADMIN_PASSWORD` | 空，未配置时后台角色不可登录 | 至少16字符独立高熵密码，建议24位以上；操作者角色 |
| `VERIFICATION_ADMIN_PASSWORD` | 空，该角色不可登录 | 核验员独立高熵密码，不能复用操作者密码；权限分别验收 |
| `PHONE_ENCRYPTION_KEY` | 空，手机验证/联系方式能力受限 | Base64编码的32随机字节；本地生成、单独安全保管并验证解码长度；不可随重启更换 |
| `SERVICE_AREAS` | 空列表 | 逗号分隔、源码规则允许的真实服务地区；仅空表首次初始化，后续修改env不会覆盖已有地区 |
| `PRIVATE_UPLOAD_DIR` | 项目 `private-data` | 容器内绝对路径如 `/var/lib/citylife/private`，源码外、非Web根、持久挂载、最小权限 |
| `TRUSTED_PROXY_IPS` | 空，不信代理头 | 实测API收到的Nginx TCP来源IP，明确IP列表，不支持CIDR；固定网络后验证伪造头不能绕过限流 |
| `PLATFORM_PUBLISH_APPROVED` | 非true即关闭相应能力 | 根据实际平台资质核验结论设置；未获批准维持false，不能为通过测试而开启 |
| `PLATFORM_CONTACT_APPROVED` | 非true即关闭相应能力 | 根据真实联系服务资质设置；与手机号/电话授权不是同一许可 |
| `TENCENT_MAP_KEY` | 空，可选增强不可用 | 需要服务端地理接口时配置并设来源/IP/API/额度约束；手动地区选择仍可用 |

密钥配置完整不表示微信手机号权限、业务资格或服务可用。证照/商家材料的生产503关闭写在源码中，不受上述审批开关自动解除。

## 工具、数据库与容器变量

| 变量 | 使用场景 | 隔离要求 |
| --- | --- | --- |
| `PG_TEST_DATABASE_URL` | 严格PG回归 | 仅本机隔离 `*_test` 库及安全测试角色，绝不能生产连接串 |
| `RECOVERY_DATABASE_URL` | 备份/恢复工具 | 备份用最小权限账号；恢复必须新建空 `restore_drill_*` 库；两种用途使用不同安全文件 |
| `PG_TOOL_CONTAINER` | 备份工具调用容器内PG客户端 | 指定实际容器名；不会自动创建/启动容器 |
| `PG_LOCAL_PASSWORD` | 现有开发/测试PowerShell与Compose | 本地专用，不能作为生产默认密码 |
| `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`、`PGDATA` | 官方PG镜像首次初始化 | 不是API读取变量；已存在数据卷时改密码env不会替已建角色改密码 |
| `NODE_OPTIONS` | Node运行时（拟新增部署配置） | 可设 `--max-old-space-size=256`；不是业务源码读取参数，不限制Sharp native内存 |

当前源码未消费 `OSS_*`、`REDIS_URL`、`PG_POOL_MAX`、`CORS_ORIGIN` 等配置。不能填写这些变量就宣称实现OSS、共享限流、连接池调优或CORS。

## 配置加载和保护

普通 `npm start`/`preflight`/`migrate`读取 `process.env`，不会自动加载 `.env.local`。现有本地启动脚本有自己的加载方式；未来容器用受控env_file/secret注入。不要把 `.env.example`改名后直接上线：它是过时开发模板，缺核验员、手机号密钥、平台批准状态等关键项，且有memory与开发占位密码。

计划服务器配置目录位于发布源码外，例如 `/etc/citylife/`，目录0700、秘密文件0600；容器运行文件与一次性迁移文件分开，迁移凭据不挂入API。env只读、非root运行、受限Docker权限。环境变量可能被拥有容器管理权限者读取，必须限制主机与Docker账号；禁止输出 `docker inspect` 完整环境、`printenv`、连接串或完整请求到工单。

电话密钥需与数据库/私有附件共同备份但分开保存访问权限。现代码未提供多版本密钥轮换，直接替换可能使存量密文不可读；轮换须先实现可回退的解密重加密流程。管理员/微信密钥轮换需结合会话退出、平台吊销与恢复演练。

## 预检覆盖边界

`npm run preflight`只检查生产driver、开发登录、AppID/Secret最小格式、管理员密码长度、地区格式、私有目录路径、代理IP格式。**不会完整校验**手机号密钥、核验员密码强度、真实资质批准、DNS/HTTPS、DB连通性、微信服务端权限、默认占位值是否可用。

必须补充人工/受控自动验证：

1. 在不输出值的条件下检查密钥存在、随机性来源、解码长度、角色独立性和文件权限。
2. 用 `npm run db:check`只读检查目标库完整迁移；部署启动后再检查ready。
3. 用真实微信账号在合法域名打开登录与手机号授权，验证拒绝、撤销和过期路径。
4. 审核平台批准凭据再设标志，记录责任人与有效期。
5. 对独立正式小程序包检查HTTPS `https://api.dgqfl.xyz`、`devLogin:false`、域名检查true，不将Secret带入包。
