import { mkdir, readFile, writeFile, copyFile, mkdtemp, rename, rm, lstat } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { site } from '../src/site.config.mjs';
import { paths, renderPages } from '../src/pages.mjs';
import { escape } from '../src/legal.mjs';
import { services } from '../src/content/catalog.mjs';

export const appRoot = fileURLToPath(new URL('../', import.meta.url));
export const dist = resolve(appRoot, 'dist');
const sourceDir = join(appRoot, 'public');
const baseAssets = [
  'styles.css', 'menu.js', 'butterfly-motion.js', 'media/brand.png', 'media/neighborhood.webp', 'media/neighborhood-morning.webp',
  'media/aurora-silk.webp', 'media/butterfly-crystal.webp', 'media/neon-shield.webp',
  ...services.map(({ id }) => `media/local-${id}.webp`)
];

export function validateSettings(settings) {
  const { contact, miniProgram } = settings;
  for (const key of ['phone', 'email', 'address', 'privacyEmail']) {
    if (typeof contact[key] !== 'string' || /[\u0000-\u001f]/u.test(contact[key])) {
      throw Error(`联系方式配置无效：${key}`);
    }
  }
  for (const key of ['email', 'privacyEmail']) {
    if (contact[key] && !/^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(contact[key])) {
      throw Error(`邮箱配置无效：${key}`);
    }
  }
  if (contact.phone && !/^\+?[0-9() -]*[0-9][0-9() -]*$/.test(contact.phone)) {
    throw Error('电话号码配置无效');
  }
  if (miniProgram.codeImage && !/^\/media\/[a-z0-9][a-z0-9_-]*\.(?:png|jpg|jpeg|webp)$/i.test(miniProgram.codeImage)) {
    throw Error('小程序码必须指向 public/media 内的 PNG、JPEG 或 WebP 文件');
  }
  if (baseAssets.includes(miniProgram.codeImage.slice(1).toLowerCase())) {
    throw Error('请配置单独的官方小程序码图片');
  }
  if (miniProgram.releaseStatus !== undefined && !['pending', 'published'].includes(miniProgram.releaseStatus)) {
    throw Error('请选择有效的小程序发布状态');
  }
  if (settings.accessLogRetentionDays !== undefined &&
    (!Number.isInteger(settings.accessLogRetentionDays) || settings.accessLogRetentionDays <= 0)) {
    throw Error('访问日志保存天数必须为正整数');
  }
}

export function publicAssets(settings = site) {
  const codeImage = settings.miniProgram.codeImage;
  return codeImage ? [...new Set([...baseAssets, codeImage.slice(1)])] : baseAssets;
}

async function cleanOutput(path) {
  const target = resolve(path);
  if (dirname(target) + sep !== appRoot || (target !== dist && !basename(target).startsWith('.website-build-'))) {
    throw Error('官网构建目录校验失败');
  }
  const info = await lstat(path).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!info) return;
  if (!info.isDirectory() || info.isSymbolicLink()) throw Error('官网构建目录必须为独立目录');
  await rm(path, { recursive: true, force: true });
}

export async function build(settings = site) {
  validateSettings(settings);
  const [agreement, privacy] = await Promise.all([
    readFile(join(appRoot, 'src/content/miniapp-agreement.md'), 'utf8'),
    readFile(join(appRoot, 'src/content/miniapp-privacy.md'), 'utf8')
  ]);
  const pages = renderPages(settings, { agreement, privacy });
  const stage = await mkdtemp(join(appRoot, '.website-build-'));
  try {
    for (const { path, html } of pages) {
      const name = path === '/404' ? '404.html' : path === '/' ? 'index.html' : path.slice(1) + '/index.html';
      const target = join(stage, name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, html);
    }
    for (const asset of publicAssets(settings)) {
      const sourcePath = join(sourceDir, asset);
      const info = await lstat(sourcePath);
      if (!info.isFile() || (await lstat(dirname(sourcePath))).isSymbolicLink()) {
        throw Error(`官网公开资源必须是普通文件：${asset}`);
      }
      const target = join(stage, asset);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(sourcePath, target);
    }
    const sitemap = paths.map(path => `  <url><loc>${escape(settings.origin + path)}</loc></url>`).join('\n');
    await writeFile(join(stage, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap}\n</urlset>\n`);
    await writeFile(join(stage, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${settings.origin}/sitemap.xml\n`);
    await cleanOutput(dist);
    await rename(stage, dist);
  } finally {
    await cleanOutput(stage);
  }
  console.log(`Built ${paths.length} pages and a 404 page in ${dist}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await build();
}
