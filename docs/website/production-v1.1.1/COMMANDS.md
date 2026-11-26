# V1.1.1 部署、备份与回滚命令

以下命令适用于已核验的 Linux ECS 与系统服务管理的 Nginx。上线前先处理 DNS、证书和现有虚拟主机归属。备份、上传、配置切换、服务重载及 DNS 记录修改均须取得用户确认。本轮仅准备命令与本地制品。

## 生产只读核验

从已授权的 ECS 登录入口执行。确认系统正在运行的 Nginx 与实际配置路径。Nginx 如果运行在容器或面板中，使用对应的配置路径与重载方式。

```bash
hostnamectl
sudo systemctl is-active nginx
sudo nginx -v
sudo ss -ltnp '( sport = :80 or sport = :443 )'
sudo nginx -t
sudo nginx -T 2>&1 | grep -E '(^# configuration file |^[[:space:]]*(server_name|listen|root|ssl_certificate|access_log|error_log)[[:space:]])'
```

核对根域、www 与 API 的站点文件和证书。官网配置项应位于现有 Nginx 的加载路径中。若已有根域或 www 虚拟主机，先确定原文件归属，避免重复启用相同域名。再对 API 记录现有的外网、Nginx 本机虚拟主机和上游响应，包含既有错误状态。若线上 API 尚未具备公网访问能力，至少记录 ECS 上可确认的现状后再启用官网。

```bash
host=api.dgqfl.xyz
for path in health ready; do
  curl -sS --connect-timeout 5 --max-time 10 -w '\nHTTP %{http_code}\n' "https://$host/api/v1/$path" || true
done
# 确认实际绑定地址后替换回环地址，沿用现场现有 CA 信任。
curl -sS --connect-timeout 5 --max-time 10 --resolve "$host:443:127.0.0.1" "https://$host/api/v1/health"
```

DNSPod 记录核对使用权威服务器。根域 A 应指向 8.156.72.144。www 可使用同一 A 记录，或指向根域的 CNAME。无实际 IPv6 服务时清除错误的官网 AAAA 记录应单独经批准。API 和其他记录保持原配置。若确认要调整 DNSPod 中的官网记录，先保存旧值与 TTL。

```bash
for ns in stephanie.dnspod.net bonus.dnspod.net; do
  for domain in dgqfl.xyz www.dgqfl.xyz api.dgqfl.xyz; do
    for type in A AAAA CNAME; do dig @"$ns" "$domain" "$type" +noall +answer +comments; done
  done
done
```

## 获准后上传与安装

将官网 tar.gz、同名 sha256、Nginx 模板通过已授权的 SSH 或 SFTP 上传至 ECS 的独立私有目录。以下 PowerShell 示例使用事先配置且已确认的主机别名。服务器端以实际上传目录设置 `incoming`。

```powershell
$websiteEcsAlias = '已授权的ECS主机别名'
scp apps/website/release/dgqfl-website-1.1.1.tar.gz apps/website/release/dgqfl-website-1.1.1.tar.gz.sha256 infrastructure/nginx/dgqfl-website.conf.example "${websiteEcsAlias}:~/dgqfl-website-incoming/"
```

以经现场审核的路径设置 `site_conf`、`fullchain`、`private_key`。示例适用于两域名共用一张有效的受信任证书。若使用两张证书，按各虚拟主机分别填写并保留 Nginx 模板其余站点隔离约束。若 `site_conf` 已存在且包含 API 或其他站点配置，暂停并拆分确定变更范围。

```bash
set -euo pipefail

incoming="$HOME/dgqfl-website-incoming"
site_conf=/etc/nginx/conf.d/dgqfl-website.conf
fullchain=/path/to/verified/fullchain.pem
private_key=/path/to/verified/privkey.pem
base=/srv/dgqfl-website
release="$base/releases/v1.1.1"
backup="/var/backups/dgqfl-website/$(date -u +%Y%m%dT%H%M%SZ)"

(cd "$incoming" && sha256sum -c dgqfl-website-1.1.1.tar.gz.sha256)
sudo test -r "$fullchain"
sudo test -r "$private_key"
sudo openssl x509 -in "$fullchain" -noout -subject -issuer -dates -ext subjectAltName
sudo openssl x509 -in "$fullchain" -noout -checkend 0
sudo nginx -t
if sudo test -e "$base/current" && ! sudo test -L "$base/current"; then
  printf 'current 不是符号链接，停止切换\n' >&2
  exit 1
fi
sudo test ! -e "$release"

# 在安装官网或修改配置前保留原状。先确认 /etc/nginx 外的已加载文件另有备份。
sudo install -d -m 0700 /var/backups/dgqfl-website
sudo mkdir -m 0700 "$backup"
sudo tar -C /etc -czf "$backup/nginx.tar.gz" nginx
sudo tar -tzf "$backup/nginx.tar.gz" >/dev/null
printf '%s\n' "$site_conf" | sudo tee "$backup/site.path" >/dev/null
if sudo test -e "$site_conf" || sudo test -L "$site_conf"; then
  sudo cp -a -- "$site_conf" "$backup/site.conf"
fi
if sudo test -L "$base/current"; then
  sudo readlink "$base/current" | sudo tee "$backup/current.target" >/dev/null
fi
printf '备份目录 %s\n' "$backup"

# 解包到新版本，现有 current 暂不改变。
sudo install -d -m 0755 "$base/releases"
sudo mkdir -m 0755 "$release"
sudo tar --no-same-owner -xzf "$incoming/dgqfl-website-1.1.1.tar.gz" -C "$release"
sudo test -r "$release/index.html"
sudo test -r "$release/404.html"

# 只安装已审定的官网配置文件，先检查再切换。
candidate="$(mktemp)"
trap 'rm -f -- "$candidate"' EXIT
sed -e "s|/path/to/verified/fullchain.pem|$fullchain|g" \
    -e "s|/path/to/verified/privkey.pem|$private_key|g" \
    "$incoming/dgqfl-website.conf.example" > "$candidate"
sudo test ! -e "$site_conf.new"
sudo test ! -L "$site_conf.new"
sudo install -m 0644 "$candidate" "$site_conf.new"
sudo mv -Tf -- "$site_conf.new" "$site_conf"
nginx_check="$(sudo nginx -t 2>&1)" || { printf '%s\n' "$nginx_check"; exit 1; }
printf '%s\n' "$nginx_check"
if grep -qi 'conflicting server name' <<< "$nginx_check"; then
  printf '站点名称冲突，请先执行回滚\n' >&2
  exit 1
fi
sudo ln -s "$release" "$base/.next-v1.1.1"
sudo mv -Tf -- "$base/.next-v1.1.1" "$base/current"
sudo systemctl reload nginx
```

证书名称与完整链须在执行上述变更前确认。配置检查、切换或重载任何一步异常均按下方回滚。对备份中的配置和日志保留访问权限限制。

## 上线验收

先强制目标 IP 核对证书、虚拟主机和重定向，再在 DNS 生效后去掉 `--resolve` 从外网复测。验收时禁止使用跳过证书校验的选项。

```bash
set -euo pipefail
ip=8.156.72.144
domain=dgqfl.xyz
for host in "$domain" "www.$domain"; do
  curl --noproxy '*' -sSI --connect-timeout 5 --max-time 10 --resolve "$host:80:$ip" "http://$host/"
done
curl --noproxy '*' -sSI --connect-timeout 5 --max-time 10 --resolve "www.$domain:443:$ip" "https://www.$domain/privacy"
for page in / /about /services /help /agreement /privacy /contact; do
  status="$(curl --noproxy '*' -sS --connect-timeout 5 --max-time 10 --resolve "$domain:443:$ip" -o /dev/null -w '%{http_code}' "https://$domain$page")"
  printf '%s %s\n' "$page" "$status"
  test "$status" = 200
done
curl --noproxy '*' -sSI --connect-timeout 5 --max-time 10 --resolve "$domain:443:$ip" "https://$domain/website-404-check"
curl --noproxy '*' -sSI --connect-timeout 5 --max-time 10 --resolve "$domain:443:$ip" "https://$domain/styles.css"
```

验收报告记录 HTTP 到 HTTPS、HTTPS www 到根域的 Location、未知路径 404、资源类型、安全头、官网标题及备案号链接。检查官网和小程序两段条款及真实公开入口。再按只读核验段执行 API 检查并对比原状态。

```bash
sudo stat -c '%a %U:%G %n' /var/log/nginx/dgqfl-website.access.log /var/log/nginx/dgqfl-website.error.log
sudo tail -n 20 /var/log/nginx/dgqfl-website.access.log
sudo tail -n 20 /var/log/nginx/dgqfl-website.error.log
sudo logrotate -d /etc/logrotate.conf
```

访问日志应记录主站请求、状态和路径，格式省略查询参数及来源页。核对轮转是否匹配这两个日志文件及实际保留期。保留脱敏摘要，保护原始 IP、请求和用户代理信息。

## 回滚命令

使用本次安装打印的确切备份目录。回滚只恢复官网配置项与官网 current。已有站点使用当前生效的原配置，不将整个备份覆盖到运行目录。

```bash
set -euo pipefail
backup=/var/backups/dgqfl-website/本次发布的UTC目录
base=/srv/dgqfl-website
expected_config=/etc/nginx/conf.d/dgqfl-website.conf
site_conf="$(sudo cat "$backup/site.path")"
test "$site_conf" = "$expected_config"
if sudo test -e "$backup/site.conf" || sudo test -L "$backup/site.conf"; then
  sudo cp -a --remove-destination -- "$backup/site.conf" "$site_conf"
else
  sudo rm -f -- "$site_conf"
fi
if sudo test -f "$backup/current.target"; then
  previous="$(sudo cat "$backup/current.target")"
  next="$base/.rollback-$(date -u +%s)"
  sudo ln -s "$previous" "$next"
  sudo mv -Tf -- "$next" "$base/current"
elif sudo test -L "$base/current"; then
  sudo unlink "$base/current"
fi
sudo nginx -t
sudo systemctl reload nginx
```

复查旧官网和 API，保留新旧版本与备份供追踪。若批准的发布同时改过官网 DNS，在 DNSPod 按变更前的快照恢复对应根域及 www 记录。
