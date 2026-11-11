'use strict';

const storageKey = 'city_life_public_cache_v1';
const maxAge = 10 * 60 * 1000;

function read(key, storage) {
  try {
    const entries = storage.getStorageSync?.(storageKey);
    if (!Array.isArray(entries)) return null;
    const entry = entries.find((item) => item.key === key && Date.now() - item.at < maxAge);
    return entry?.value || null;
  } catch {
    return null;
  }
}

function write(key, value, storage) {
  try {
    const entries = storage.getStorageSync?.(storageKey);
    const previous = Array.isArray(entries) ? entries : [];
    storage.setStorageSync?.(
      storageKey,
      [
        { key, value, at: Date.now() },
        ...previous.filter((item) => item.key !== key && Date.now() - item.at < maxAge)
      ].slice(0, 4)
    );
  } catch {
    /* A full device cache must not interrupt browsing. */
  }
}

module.exports = { read, write };
