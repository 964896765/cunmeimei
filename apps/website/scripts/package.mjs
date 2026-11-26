import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { appRoot, build, dist } from './build.mjs';

await build();
const { version } = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'));
const folder = join(appRoot, 'release');
const name = 'dgqfl-website-' + version + '.tar.gz';
const archive = join(folder, name);
const deployments = [
  'infrastructure/nginx/dgqfl-website.conf.example',
  'infrastructure/nginx/dgqfl-website.logrotate.example',
  'docs/website/DEPLOYMENT.md'
];
const deployName = 'dgqfl-website-' + version + '-deploy.tar.gz';

async function describe(filename) {
  const path = join(folder, filename);
  const contents = await readFile(path);
  const checksum = createHash('sha256').update(contents).digest('hex');
  await writeFile(path + '.sha256', checksum + '  ' + filename + '\n');
  return {archive: path, bytes: contents.length, checksum};
}

await mkdir(folder, { recursive: true });
execFileSync('tar', ['-czf', archive, '-C', dist, '.'], { stdio: 'inherit' });
const staticFiles = await describe(name);
execFileSync('tar', ['-czf', join(folder, deployName), '-C', folder, name, name + '.sha256',
  '-C', resolve(appRoot, '../..'), ...deployments], { stdio: 'inherit' });
console.log(JSON.stringify({ ...staticFiles, deployment: await describe(deployName) }, null, 2));
