import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, dist, publicAssets } from './build.mjs';
import { paths } from '../src/pages.mjs';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

export function preview(settings, directory = dist) {
  const routes = new Map(paths.map(path => [path, path === '/' ? 'index.html' : path.slice(1) + '/index.html']));
  for (const asset of [...publicAssets(settings), 'sitemap.xml', 'robots.txt']) routes.set('/' + asset, asset);

  return createServer(async (request, response) => {
    const head = request.method === 'HEAD';
    const [path, ...query] = request.url.split('?');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET' && !head) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const withoutSlash = path.slice(0, -1);
    if (path.length > 1 && path.endsWith('/') && paths.includes(withoutSlash)) {
      response.writeHead(308, { Location: withoutSlash + (query.length ? '?' + query.join('?') : '') }).end();
      return;
    }
    const page = routes.get(path);
    const file = page || '404.html';
    try {
      const body = await readFile(join(directory, file));
      response.writeHead(page ? 200 : 404, {
        'Content-Type': types[extname(file).toLowerCase()],
        'Content-Length': body.length
      }).end(head ? undefined : body);
    } catch {
      response.writeHead(500, { 'Content-Type': types['.txt'] }).end(head ? undefined : 'Unable to load site build.');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await build();
  const port = Number(process.env.WEBSITE_PREVIEW_PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid WEBSITE_PREVIEW_PORT');
  preview().listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
}
