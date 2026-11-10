'use strict';
// Node 20 on Windows does not expand shell globs. Pass each test path explicitly.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const cwd = path.resolve(__dirname, '..');
const files = fs.readdirSync(path.join(cwd, 'tests')).filter(f => f.endsWith('.test.js')).sort().map(f => path.join('tests', f));
if (!files.length) throw new Error('No tests discovered');
const result = spawnSync(process.execPath, ['--test', ...files], {cwd, stdio: 'inherit', env: process.env});
process.exitCode = result.error || result.signal ? 1 : result.status ?? 1;
