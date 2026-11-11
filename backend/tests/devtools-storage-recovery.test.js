'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const recovery = require('../../scripts/devtools_storage_recovery');

function simulator() {
  const storage = new Map([['original-session', 'test-only-session'], ['city', { code: '510100' }]]);
  const runtime = { apiBaseUrl: 'http://127.0.0.1:3101' };
  let disconnected = false;
  return {
    storage, runtime,
    disconnect() { disconnected = true; },
    reconnect() { disconnected = false; },
    async evaluate(fn, value) {
      if (disconnected) throw Error('Transport closed');
      return vm.runInNewContext('(' + fn.toString() + ')(value)', {
        value: structuredClone(value), require: () => runtime,
        wx: {
          getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
          getStorageSync: key => storage.get(key),
          setStorageSync: (key, item) => storage.set(key, item),
          removeStorageSync: key => storage.delete(key)
        }
      });
    }
  };
}

test('simulator storage recovery persists before mutation and reconnects to restore every key', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'citylife-recovery-'));
  const previous = process.env.PRISM_RECOVERY_FILE;
  process.env.PRISM_RECOVERY_FILE = path.join(folder, 'session.json');
  t.after(() => {
    if (previous === undefined) delete process.env.PRISM_RECOVERY_FILE;
    else process.env.PRISM_RECOVERY_FILE = previous;
    fs.rmSync(folder, { recursive: true, force: true });
  });
  const mini = simulator();
  let reconnects = 0;
  const reconnect = async () => { reconnects++; mini.reconnect(); };
  const session = await recovery(() => mini, reconnect);
  assert.ok(fs.existsSync(process.env.PRISM_RECOVERY_FILE));
  mini.storage.set('original-session', 'fixture-session');
  mini.storage.set('fixture-only', true);
  mini.runtime.apiBaseUrl = 'http://127.0.0.1:9999';
  mini.disconnect();
  assert.equal((await session.restore()).storageRestored, true);
  assert.equal(reconnects, 1);
  assert.equal(mini.storage.get('original-session'), 'test-only-session');
  assert.equal(mini.storage.has('fixture-only'), false);
  assert.equal(mini.runtime.apiBaseUrl, 'http://127.0.0.1:3101');
  assert.equal(fs.existsSync(process.env.PRISM_RECOVERY_FILE), false);

  // A terminated process leaves its file for the next invocation to recover.
  await recovery(() => mini, reconnect);
  mini.storage.set('original-session', 'interrupted-fixture');
  const resumed = await recovery(() => mini, reconnect);
  assert.equal(mini.storage.get('original-session'), 'test-only-session');
  await resumed.restore();
});
