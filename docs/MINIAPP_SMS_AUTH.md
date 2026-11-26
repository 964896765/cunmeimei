# 村美美小程序短信验证码接入

## 小程序流程

- 登录页具备微信登录和短信登录。用户同意当前协议后，自行选择方式。短信登录使用本次短信验证码和当前小程序微信身份。首次注册和号码绑定在同一事务内完成，已有用户继续使用同一账号。
- 已登录用户可以在「我的 → 手机号验证与撤回」使用短信绑定或换绑。换绑同时核对原号码和新号码，完成后同步关闭各条信息上的原公开电话。首次绑定及换绑仍走现有发布、联系等业务门禁。
- 无法核验旧号码时，可继续使用原微信账号登录，并联系官方渠道人工核对。短信验证码复用统一账号和会话，号码默认不公开。
- `SMS_AUTH_ENABLED=false` 为部署模板默认值。未启用时客户端只显示现有登录方式。

## RAM 权限与服务端配置

1. 在阿里云短信控制台检查国内短信签名「东莞市石排青方睐软件中心」及模板 `SMS_512583575` 的审核状态、可发场景和变量 `code`。签名与模板应在同一阿里云账户下。
2. 创建仅供 API 使用的 RAM 子用户，为其分配 API 访问凭证和以下自定义策略。运行账号仅需发送权限。签名、模板与发送回执可由管理员在控制台核对。 [阿里云 SendSms 授权说明](https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms)

```json
{
  "Version": "1",
  "Statement": [
    { "Effect": "Allow", "Action": "dysms:SendSms", "Resource": "*" }
  ]
}
```

3. 将凭证注入 API 进程的受限环境。保留现有 `PHONE_ENCRYPTION_KEY`，另生成 32 字节随机材料作为 `SMS_CODE_PEPPER`，以 Base64 编码存入同一受限配置。若使用 Linux 环境文件，将文件保存在源码及网站目录之外，限制为服务管理员可读，例如权限 `0600`。
4. 安装锁定的依赖后，使用现有数据库迁移流程应用 `035_sms_auth.sql`，并执行 `npm run db:check --prefix backend`。迁移保留现有账号及绑定。遇到存量重复号码时，应由运营方核对归属。
5. 确认 HTTPS 请求域名和微信隐私保护指引已配置，官方联系邮箱使用 `chenjun@qingfanglai.cn`。生产使用原运行方式启动 API，启用之前先核对下表。

| 变量 | 内容 |
| --- | --- |
| `SMS_AUTH_ENABLED` | 配置和迁移就绪后设为 `true` |
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | RAM 子用户 AccessKey ID |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | RAM 子用户 AccessKey Secret |
| `ALIBABA_CLOUD_SMS_SIGN_NAME` | 东莞市石排青方睐软件中心 |
| `ALIBABA_CLOUD_SMS_TEMPLATE_CODE` | `SMS_512583575` |
| `ALIBABA_CLOUD_SMS_ENDPOINT` | `dysmsapi.aliyuncs.com` |
| `SMS_CODE_PEPPER` | 用于验证码和限流维度摘要的独立 Base64 密钥 |

## 接口

正式小程序使用 `POST /api/v1/auth/sms/send` 和 `POST /api/v1/auth/sms/verify`。服务端同时支持 `/api/auth/sms/send` 和 `/api/auth/sms/verify`。

| 用途 | 发送 | 验证 |
| --- | --- | --- |
| 注册或登录 | `purpose: "signin"`、`phone`、`deviceId`、新取得的 `wechatCode` 和当前协议确认字段 | 同样的字段，附 `challengeId` 和 6 位字符串 `code`。本次 `wechatCode` 须重新取得 |
| 绑定手机号 | `purpose: "bind"`、`phone`、`deviceId`、`phoneConsent: true` 和当前会话 | 同样的字段，附 `challengeId`、`code` 和同一会话 |
| 更换手机号 | 为原号码发送 `purpose: "change_old"`，为新号码发送 `purpose: "bind"`，两次均使用当前会话 | 以 `bind` 提交新号码，附加 `previous: {phone, challengeId, code}` |

登录确认字段为 `consent: true`、`termsVersion`、`privacyVersion`、`legalHash`。成功发送返回 `challengeId`、`expiresIn: 300`、`retryAfter: 60` 和 `delivery`。投递状态不确定时，返回 `delivery: "unknown"`，已收到短信的用户仍可填写。接口错误沿用 `{error,message}`，常见状态码为 400、401、409、429、502 和 503。登录返回现有的 `{token,expiresIn,userId}`，绑定和更换返回 `{ok:true}`。

验证码由后端安全生成。每个号码每 60 秒最多发送一次，24 小时最多五次，服务端同时按安装标识、来源 IP 和账号或微信身份施加共享限流。每个挑战最多允许五次错误，过期或消费后失效。上游明确拒收后清除验证码摘要。超时保持结果待确认，SDK 禁用自动重试。

## 验收

本地使用隔离数据库和模拟发送器运行 `node --test backend/tests/sms-auth.test.js`。真实发送验收由管理员配置好 RAM 凭证后，在本人控制的手机上执行一次，核对控制台回执、手机收件、验证码有效期、重复使用和频率限制。

2026 年 11 月 24 日，全量本地回归通过 536 项。需数据库的项目在该轮跳过 20 项，受影响的数据库与账号测试使用独立 PostgreSQL 复验，63 项通过。官网静态检查 16 项通过。微信开发者工具验收了短信登录、发送倒计时、切出去查看短信后返回、新旧号码换绑及脱敏号码刷新。

隔离测试使用模拟发送端和微信响应夹具。阿里云账号下的签名、模板状态及真实投递回执待管理员现场核对。

## 修改范围

| 范围 | 文件 |
| --- | --- |
| 短信服务及安全配置 | `backend/src/aliyun-sms.js`、`sms-auth.js`、`sms-repository.js`、`server.js`、`deployment-check.js`、`.env.example` |
| 数据与既有账号 | `backend/migrations/035_sms_auth.sql`、`backend/src/pg-repository.js`、`trust-repository.js`、`trust-routes.js`、`maintenance.js` |
| 小程序 | 登录页、手机号验证页、`components/auth-panel`、`components/sms-code-form`、`utils/api.js` |
| 隐私及验收 | 小程序隐私政策、官网小程序隐私查阅稿、`backend/tests/sms-auth.test.js`、协议版本与资源检查 |
