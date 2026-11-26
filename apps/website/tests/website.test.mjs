import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { before, after, test } from 'node:test';
import { build, dist, publicAssets, validateSettings } from '../scripts/build.mjs';
import { preview } from '../scripts/preview.mjs';
import { paths, renderPages } from '../src/pages.mjs';
import { site } from '../src/site.config.mjs';
import { services } from '../src/content/catalog.mjs';

let server;
let origin;
before(async () => {
  await build();
  server = preview();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

const titles = ['连接城乡生活，', '让本地生活信息更好找', '按生活场景找信息', '小程序使用帮助', '用户服务协议', '隐私政策', '联系与反馈'];
const pages = new Map();
for (const [index, path] of paths.entries()) {
  test('直接访问与刷新 ' + path, async () => {
    for (const cache of ['default', 'reload']) {
      const response = await fetch(origin + path, { cache });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      const html = await response.text();
      assert.ok(html.includes(titles[index]));
      assert.ok(html.includes('href="' + site.origin + path + '"'));
      assert.ok(html.includes(site.operator) && html.includes(site.icp));
      assert.match(html, /href="https:\/\/beian\.miit\.gov\.cn\/">粤ICP备2025514981号-1/);
      assert.doesNotMatch(html, /api\.dgqfl\.xyz|\{\{[A-Z_]+\}\}/);
      pages.set(path, html);
    }
  });
}

test('站内导航、锚点及资源均有实际目标', async () => {
  for (const [path, html] of pages) {
    for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (!/^[/#]/.test(target)) continue;
      const [targetPath, hash] = target.split('#');
      if (hash) {
        assert.ok(pages.get(targetPath || path)?.includes('id="' + hash + '"'), path + ' -> ' + target);
      } else {
        const result = await fetch(origin + target, { method: 'HEAD' });
        assert.equal(result.status, 200, target);
        assert.ok(Number(result.headers.get('content-length')) > 0);
      }
    }
  }
});

test('尾斜杠重定向，未知路径返回有效 404', async () => {
  const redirect = await fetch(origin + '/help/?from=menu', { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/help?from=menu');
  for (const path of ['/unknown', '/404.html', '/index.html', '/media/missing.png', '/backend/.env', '/api/v1/health', '/admin', '/apps/website/package.json']) {
    const result = await fetch(origin + path);
    assert.equal(result.status, 404, path);
    assert.match(await result.text(), /页面未找到/);
  }
});

test('首页显示原版小程序码，联系页显示已确认的官方邮箱', async () => {
  const home = pages.get('/');
  assert.equal((home.match(/class="category-card art-/g) || []).length, 6);
  assert.equal((home.match(/class="photo-card art-/g) || []).length, 6);
  assert.match(home, /class="mini-code" src="\/media\/mini-program-code.jpg"/);
  assert.match(home, /小程序待发布，正式开放后可在微信扫码进入/);
  assert.match(home, /href="\/media\/mini-program-code.jpg" download="青方睐村美美小程序码.jpg"/);
  const code = await readFile(join(dist, 'media/mini-program-code.jpg'));
  assert.equal(createHash('sha256').update(code).digest('hex'), '0ccba96852789f8721d33475dc6a267ec0b8d84f2de89cfa25d8e306fb1488eb');
  assert.match(pages.get('/help'), /小程序待发布，可先查看和保存<a href="\/#mini-program">首页小程序码/);
  assert.match(pages.get('/contact'), /<dt>网站及产品名称<\/dt><dd>青方睐村美美<\/dd>/);
  assert.match(pages.get('/contact'), /id="website-privacy-requests"[\s\S]+?href="mailto:chenjun@qingfanglai\.cn"/);
  assert.match(pages.get('/contact'), /id="miniprogram-privacy-requests"/);
  assert.match(pages.get('/contact'), /href="mailto:chenjun@qingfanglai\.cn">chenjun@qingfanglai\.cn/);
  for (const html of pages.values()) {
    assert.doesNotMatch(html, /待公布|待填写|href="tel:|联系(?:电话|地址|邮箱)：\s*</);
    const addresses = [...html.matchAll(/href="mailto:([^"]+)"/g)].map(match => match[1]);
    assert.ok(addresses.every(address => address === 'chenjun@qingfanglai.cn'));
  }
});

test('小程序码未配置时保留使用说明和帮助入口', () => {
  const settings = structuredClone(site);
  settings.miniProgram.codeImage = '';
  const rendered = new Map(renderPages(settings, {
    agreement: '## 协议', privacy: '## 隐私'
  }).map(page => [page.path, page.html]));
  assert.match(rendered.get('/'), /本站目前未提供官方小程序码/);
  assert.doesNotMatch(rendered.get('/'), /class="mini-code"|扫一扫/);
  assert.match(rendered.get('/help'), /若已从官方渠道获得入口，请在微信中打开/);
});

test('两个条款页面保留官网和小程序两段适用范围、详细条款和可展开目录', () => {
  for (const path of ['/agreement', '/privacy']) {
    const html = pages.get(path);
    assert.match(html, /href="#website-terms">官方网站/);
    assert.match(html, /href="#mini-terms">微信小程序/);
    assert.match(html, /适用于访问 dgqfl\.xyz 公开页面/);
    assert.match(html, /适用于微信内「青方睐村美美」小程序/);
    assert.match(html, /<details id="legal-toc" class="legal-toc"><summary>查看小程序条款目录/);
    assert.match(html, /id="clause-1"/);
    assert.match(html, /个人数据/);
  }
  assert.match(pages.get('/agreement'), /勾选同意小程序当时展示的用户协议和隐私政策/);
  const privacy = pages.get('/privacy');
  assert.doesNotMatch(privacy, /登录本身不获取头像、昵称或手机号|平台目前不提供独立手机号登录/);
  assert.match(privacy, /手机号通过单独的验证功能处理/);
  assert.match(privacy, /微信登录和手机号授权有各自的入口，手机号授权须由您另行点击/);
  assert.match(privacy, /<h4>5\. 短信验证码验证<\/h4>/);
  assert.doesNotMatch(privacy, /短信验证码验证（待开放）|短信验证码功能待开放|短信验证开放后/);
  assert.match(privacy, /阿里云国内短信服务投递/);
  assert.match(privacy, /验证码为 6 位数字，有效期为 5 分钟/);
  assert.match(privacy, /href="#clause-3">微信手机号授权与短信验证/);
  assert.match(privacy, /href="\/contact#miniprogram-privacy-requests">个人信息请求/);
  assert.match(privacy, /现有生产配置不开放商家资质证据和证照图片的线上上传/);
  assert.match(privacy, /<th scope="row">私信和联系申请<\/th>/);
  assert.match(privacy, /href="mailto:chenjun@qingfanglai\.cn"/);
});

test('官网访问日志说明与交付的轮转期限一致', async () => {
  const rule = await readFile(new URL('../../../infrastructure/nginx/dgqfl-website.logrotate.example', import.meta.url), 'utf8');
  assert.equal(Number(/^\s*rotate (\d+)$/m.exec(rule)?.[1]), site.accessLogRetentionDays);
  assert.equal(Number(/^\s*maxage (\d+)$/m.exec(rule)?.[1]), site.accessLogRetentionDays);
  assert.match(rule, /daily/);
  assert.match(rule, /create 0600 root root/);
  assert.ok(pages.get('/privacy').includes('常规保存 ' + site.accessLogRetentionDays + ' 天'));
});

test('首页使用本地 WebP，服务内页使用统一的霓虹线条插画', async () => {
  for (const asset of ['aurora-silk.webp', 'butterfly-crystal.webp', 'neon-shield.webp']) {
    assert.ok(pages.get('/').includes('src="/media/' + asset + '"'));
    assert.equal((await readFile(join(dist, 'media', asset))).toString('ascii', 8, 12), 'WEBP');
  }
  const hashes = new Set();
  for (const { id } of services) {
    const asset = 'media/local-' + id + '.webp';
    assert.ok(pages.get('/').includes('src="/' + asset + '"'));
    assert.ok(pages.get('/services').includes('id="service-' + id + '-light"'));
    const binary = await readFile(join(dist, asset));
    assert.equal(binary.toString('ascii', 8, 12), 'WEBP');
    hashes.add(createHash('sha256').update(binary).digest('hex'));
  }
  assert.equal(hashes.size, 6);
  assert.doesNotMatch(pages.get('/services'), /src="\/media\/service-/);
});

test('可配置联系方式与小程序码，约束外链和 HTML 注入', () => {
  const settings = structuredClone(site);
  settings.contact = { phone: '+86 0769-12345678', email: 'office@example.com', address: '<示例地址>', privacyEmail: 'privacy@example.com' };
  settings.miniProgram.codeImage = '/media/local-test-code.png';
  settings.miniProgram.releaseStatus = 'published';
  validateSettings(settings);
  const rendered = new Map(renderPages(settings, {
    agreement: '## 协议\n{{ADDRESS}}', privacy: '## 隐私\n{{PRIVACY_EMAIL}}'
  }).map(page => [page.path, page.html]));
  assert.match(rendered.get('/'), /src="\/media\/local-test-code.png"/);
  assert.match(rendered.get('/help'), /用微信扫一扫识别<a href="\/#mini-program">首页小程序码/);
  assert.doesNotMatch(rendered.get('/'), /小程序待发布/);
  assert.match(rendered.get('/contact'), /href="mailto:office@example\.com"/);
  assert.match(rendered.get('/contact'), /href="mailto:privacy@example\.com"/);
  assert.match(rendered.get('/privacy'), /href="\/contact#website-privacy-requests">查看提交说明/);
  assert.match(rendered.get('/contact'), /href="tel:\+86076912345678"/);
  assert.match(rendered.get('/contact'), /&lt;示例地址&gt;/);
  assert.match(rendered.get('/privacy'), /privacy@example\.com/);
  settings.miniProgram.codeImage = '/media/../private.png';
  assert.throws(() => validateSettings(settings), /小程序码/);
  settings.miniProgram.codeImage = '/media/brand.png';
  assert.throws(() => validateSettings(settings), /单独的官方小程序码/);
});

test('静态制品只包含页面、站点索引和明确的资源文件', async () => {
  const entries = (await readdir(dist, { recursive: true, withFileTypes: true }))
    .filter(entry => !entry.isDirectory())
    .map(entry => join(entry.parentPath || entry.path, entry.name).slice(dist.length + 1).replaceAll('\\', '/'));
  assert.deepEqual(entries.sort(), [
    ...paths.map(path => path === '/' ? 'index.html' : path.slice(1) + '/index.html'),
    '404.html', 'robots.txt', 'sitemap.xml', ...publicAssets()
  ].sort());
  const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
  assert.equal((sitemap.match(/<loc>/g) || []).length, 7);
});
