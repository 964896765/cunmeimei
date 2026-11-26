import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { paths } from '../src/pages.mjs';
import { dist } from '../scripts/build.mjs';

const name = 'dgqfl-website-qa-' + process.pid + '-' + Date.now();
const config = fileURLToPath(new URL('../../../infrastructure/nginx/dgqfl-website.conf.example', import.meta.url));
const image = process.env.WEBSITE_NGINX_IMAGE || 'nginx:latest';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' }).trim();
const startup = [
  'install -d -m 0750 -o root -g nginx /var/log/dgqfl-website',
  'openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj /CN=dgqfl.xyz -addext subjectAltName=DNS:dgqfl.xyz,DNS:www.dgqfl.xyz,DNS:api.dgqfl.xyz -keyout /tmp/website-key.pem -out /tmp/website-cert.pem >/dev/null 2>&1',
  'mv /etc/nginx/conf.d/default.conf /tmp/default.conf',
  'echo "server { listen 80 default_server; server_name api.dgqfl.xyz; location = /api/v1/health { return 200 api-baseline; } }" > /etc/nginx/conf.d/canary.conf',
  'echo "server { listen 443 ssl default_server; server_name api.dgqfl.xyz; ssl_certificate /tmp/website-cert.pem; ssl_certificate_key /tmp/website-key.pem; location = /api/v1/health { return 200 api-baseline-tls; } }" >> /etc/nginx/conf.d/canary.conf',
  'nginx -t',
  'exec nginx -g "daemon off;"'
].join('\n');

function request(port, host, path, ca) {
  return new Promise((resolve, reject) => {
    const client = ca ? https : http;
    const req = client.get({
      hostname: '127.0.0.1', port, path, timeout: 6000,
      headers: { Host: host }, ...(ca ? { servername: host, ca } : {})
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
      response.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Nginx request timed out')));
    req.on('error', reject);
  });
}

docker('run', '--rm', '-d', '--name', name, '-p', '127.0.0.1::80', '-p', '127.0.0.1::443',
  '--mount', 'type=bind,source=' + config + ',target=/tmp/website.conf,readonly',
  '--mount', 'type=bind,source=' + dist + ',target=/srv/dgqfl-website/current,readonly',
  '--entrypoint', 'sh', image, '-ec', startup);
try {
  const tcpPort = port => Number(docker('port', name, port + '/tcp').split(':').at(-1));
  const plain = tcpPort(80);
  const tls = tcpPort(443);
  let baseline;
  for (let i = 0; i < 25; i++) {
    baseline = await request(plain, 'api.dgqfl.xyz', '/api/v1/health').catch(() => null);
    if (baseline?.status === 200) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(baseline?.body, 'api-baseline');
  const cert = docker('exec', name, 'cat', '/tmp/website-cert.pem');
  const baselineTls = await request(tls, 'api.dgqfl.xyz', '/api/v1/health', cert);
  assert.equal(baselineTls.status, 200);
  assert.equal(baselineTls.body, 'api-baseline-tls');
  docker('exec', name, 'sh', '-ec', [
    'sed -e s@/path/to/verified/fullchain.pem@/tmp/website-cert.pem@g -e s@/path/to/verified/privkey.pem@/tmp/website-key.pem@g /tmp/website.conf > /etc/nginx/conf.d/website.conf',
    'nginx -t',
    'nginx -s reload'
  ].join('\n'));
  let online;
  for (let i = 0; i < 25; i++) {
    online = await request(plain, 'dgqfl.xyz', '/help').catch(() => null);
    if (online?.status === 301) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(online?.status, 301);
  const httpRedirects = await Promise.all(['dgqfl.xyz', 'www.dgqfl.xyz'].map(host => request(plain, host, '/help?source=test')));
  const httpsRedirect = await request(tls, 'www.dgqfl.xyz', '/help?source=test', cert);
  for (const result of [...httpRedirects, httpsRedirect]) {
    assert.equal(result.status, 301);
    assert.equal(result.headers.location, 'https://dgqfl.xyz/help?source=test');
  }
  for (const path of paths) {
    const result = await request(tls, 'dgqfl.xyz', path, cert);
    assert.equal(result.status, 200, path);
    assert.match(result.headers['content-type'], /^text\/html; charset=utf-8$/i);
    assert.match(result.headers['content-security-policy'], /default-src 'none'/);
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    assert.equal(result.headers['x-frame-options'], 'DENY');
    assert.match(result.headers['permissions-policy'], /geolocation=\(\)/);
    assert.ok(result.body.includes('href="https://dgqfl.xyz' + path + '"'));
  }
  const redirect = await request(tls, 'dgqfl.xyz', '/agreement/?q=1', cert);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.location, '/agreement?q=1');
  for (const path of ['/unknown', '/404.html', '/backend/.env', '/api/v1/health', '/admin']) {
    const result = await request(tls, 'dgqfl.xyz', path, cert);
    assert.equal(result.status, 404, path);
    assert.match(result.body, /页面未找到/);
  }
  const mime = new Map([
    ['/styles.css', /^text\/css/],
    ['/menu.js', /javascript/],
    ['/butterfly-motion.js', /javascript/],
    ['/media/neighborhood.webp', /^image\/webp/],
    ['/media/local-job.webp', /^image\/webp/],
    ['/media/butterfly-crystal.webp', /^image\/webp/],
    ['/media/mini-program-code.jpg', /^image\/jpeg/],
    ['/sitemap.xml', /xml/]
  ]);
  for (const [path, type] of mime) {
    const result = await request(tls, 'dgqfl.xyz', path, cert);
    assert.equal(result.status, 200, path);
    assert.match(result.headers['content-type'], type);
  }
  const existing = await request(plain, 'api.dgqfl.xyz', '/api/v1/health');
  assert.equal(existing.status, baseline.status);
  assert.equal(existing.body, baseline.body);
  const existingTls = await request(tls, 'api.dgqfl.xyz', '/api/v1/health', cert);
  assert.equal(existingTls.status, baselineTls.status);
  assert.equal(existingTls.body, baselineTls.body);
  await request(tls, 'dgqfl.xyz', '/services?shape=website-test-value', cert);
  const access = docker('exec', name, 'cat', '/var/log/dgqfl-website/access.log');
  assert.match(access, /"HEAD \/help" 301|"GET \/help" 301/);
  assert.match(access, /"GET \/services" 200/);
  assert.match(access, /"GET \/unknown" 404/);
  assert.doesNotMatch(access, /website-test-value|"GET \/api\/v1\/health" 200/);
  docker('exec', name, 'test', '-f', '/var/log/dgqfl-website/error.log');
  docker('exec', name, 'sh', '-ec', [
    'mv /var/log/dgqfl-website/access.log /var/log/dgqfl-website/access.previous',
    'install -m 0600 /dev/null /var/log/dgqfl-website/access.log',
    'nginx -s reopen'
  ].join('\n'));
  let reopened;
  for (let i = 0; i < 25; i++) {
    await request(tls, 'dgqfl.xyz', '/contact', cert);
    reopened = docker('exec', name, 'sh', '-ec', 'test ! -f /var/log/dgqfl-website/access.log || cat /var/log/dgqfl-website/access.log');
    if (reopened.includes('"GET /contact" 200')) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.match(reopened, /"GET \/contact" 200/);
  docker('exec', name, 'sh', '-ec', [
    'mv /etc/nginx/conf.d/website.conf /tmp/website-disabled.conf',
    'nginx -t',
    'nginx -s reload'
  ].join('\n'));
  let afterRollback;
  for (let i = 0; i < 25; i++) {
    afterRollback = await request(plain, 'dgqfl.xyz', '/').catch(() => null);
    if (afterRollback?.status === 404) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(afterRollback?.status, 404);
  const rollbackApi = await request(tls, 'api.dgqfl.xyz', '/api/v1/health', cert);
  assert.equal(rollbackApi.body, baselineTls.body);
  console.log(JSON.stringify({
    image, tlsVerification: 'local test certificate matches both website host names',
    pages: paths.length, redirects: 4, notFound: 5, resources: mime.size,
    securityHeaders: 'CSP, MIME sniffing, framing and permission restrictions verified',
    logs: 'access log excludes query parameters, dedicated error log present, new log receives records after reopen',
    existingVirtualHost: 'HTTP and HTTPS status and body unchanged across reload',
    rollback: 'first-install website disable and API return verified'
  }, null, 2));
} catch (error) {
  try { console.error(docker('exec', name, 'nginx', '-t')); } catch (diagnostic) {
    if (diagnostic.stderr) console.error(diagnostic.stderr.trim());
  }
  throw error;
} finally {
  try { docker('stop', name); } catch { /* Container already exited. */ }
}
