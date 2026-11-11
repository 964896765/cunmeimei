'use strict';

const fs = require('node:fs');
const path = require('node:path');

// The caller supplies an access-restricted directory outside the repository.
// Recovery data contains credentials and must never enter logs or Git.
module.exports = async function storageRecovery(getMini, reconnect) {
  const filename = process.env.PRISM_RECOVERY_FILE;
  if (!filename) throw Error('PRISM_RECOVERY_FILE must point to a protected external directory');
  const absolute = path.resolve(filename);
  const repository = path.resolve(__dirname, '..');
  const relative = path.relative(repository, absolute);
  if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
    throw Error('Storage recovery file must be outside the repository');

  async function restore(snapshot) {
    async function apply() {
      const restored = await getMini().evaluate((saved) => {
        const entries = new Map(saved.storage);
        for (const key of wx.getStorageInfoSync().keys)
          if (!entries.has(key)) wx.removeStorageSync(key);
        for (const [key, value] of entries) wx.setStorageSync(key, value);
        const runtime = require('utils/runtime.js');
        runtime.apiBaseUrl = saved.origin;
        return runtime.apiBaseUrl === saved.origin && saved.storage.every(
          ([key, value]) => JSON.stringify(wx.getStorageSync(key)) === JSON.stringify(value)
        ) && wx.getStorageInfoSync().keys.length === entries.size;
      }, snapshot);
      if (!restored) throw Error('Simulator storage restoration verification failed');
    }
    try {
      await apply();
    } catch {
      await reconnect();
      await apply();
    }
    fs.unlinkSync(absolute);
    return { storageRestored: true, authStorageUnchanged: true, runtimeOriginRestored: true };
  }

  if (fs.existsSync(absolute)) {
    await restore(JSON.parse(fs.readFileSync(absolute, 'utf8')));
    console.log('Recovered interrupted simulator session');
  }
  const snapshot = await getMini().evaluate(() => ({
    storage: wx.getStorageInfoSync().keys.map(key => [key, wx.getStorageSync(key)]),
    origin: require('utils/runtime.js').apiBaseUrl
  }));
  const temporary = absolute + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(snapshot), { mode: 0o600 });
  fs.renameSync(temporary, absolute);
  return { restore: () => restore(snapshot) };
};
