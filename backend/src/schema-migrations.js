'use strict';
// All migration reads and writes use the same PostgreSQL connection under one advisory lock.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const DIR = path.resolve(__dirname, '../migrations');
const LOCK_NAME = 'city-life-schema-migrations-v1';
function manifest(directory = DIR) {
  return fs.readdirSync(directory).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort()
    .map(name => { const sql = fs.readFileSync(path.join(directory, name), 'utf8');
      return {name, sql, checksum:crypto.createHash('sha256').update(sql).digest('hex')}; });
}
function compareMigrations(expected, applied) {
  const byName = new Map(applied.map(x => [x.name, x.checksum]));
  const expectedNames = new Set(expected.map(x => x.name));
  const altered = expected.filter(x => byName.has(x.name) && byName.get(x.name) !== x.checksum).map(x => x.name);
  const missing = expected.filter(x => !byName.has(x.name)).map(x => x.name);
  const unexpected = [...byName.keys()].filter(x => !expectedNames.has(x));
  return {altered, missing, unexpected, ok:!altered.length&&!missing.length&&!unexpected.length};
}
async function history(client, {create = false} = {}) {
  if (create) await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name varchar(128) PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  else {
    const table = await client.query("SELECT to_regclass('schema_migrations') AS table_name");
    if (!table.rows[0]?.table_name) return [];
  }
  return (await client.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
}
async function checkMigrations(pool) {
  const c = await pool.connect();
  try { return compareMigrations(manifest(), await history(c)); }
  finally { c.release(); }
}
async function applyMigrations(pool) {
  const c = await pool.connect(), expected = manifest(), appliedNow = [];
  try {
    // Session advisory lock protects the initial table creation as well as each transaction.
    await c.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_NAME]);
    await history(c, {create:true});
    const status = compareMigrations(expected, await history(c));
    if (status.altered.length || status.unexpected.length)
      throw Error('Migration history mismatch; manual investigation required: '+JSON.stringify(status));
    for (const item of expected) {
      if (!status.missing.includes(item.name)) continue;
      await c.query('BEGIN');
      try {
        await c.query(item.sql);
        await c.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [item.name,item.checksum]);
        await c.query('COMMIT');
        appliedNow.push(item.name);
      } catch (e) { await c.query('ROLLBACK'); throw Error('Migration '+item.name+' rolled back: '+e.message, {cause:e}); }
    }
    return {appliedNow, status:compareMigrations(expected, await history(c))};
  } finally {
    try { await c.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_NAME]); }
    finally { c.release(); }
  }
}
module.exports = {manifest, compareMigrations, checkMigrations, applyMigrations};
