"use strict";

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const dns = require("node:dns").promises;
const root = path.resolve(__dirname, "../../..");

function save(name, value) {
  fs.writeFileSync(path.join(__dirname, name), JSON.stringify(value, null, 2) + "\n");
}

async function observeDatabase() {
  const target = require(path.join(root, "scripts/local_database")).resolveLocalDatabase();
  const { Pool } = require(path.join(root, "backend/node_modules/pg"));
  const pool = new Pool({
    connectionString: target.dsn,
    max: 1,
    connectionTimeoutMillis: 5000,
    options: "-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000",
  });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    const migrationTools = require(path.join(root, "backend/src/schema-migrations"));
    const applied = (await client.query("SELECT name,checksum FROM schema_migrations ORDER BY name")).rows;
    const migrations = migrationTools.compareMigrations(migrationTools.manifest(), applied);
    const server = (await client.query("SELECT current_setting('server_version') AS version,current_setting('transaction_read_only') AS read_only,pg_database_size(current_database()) AS bytes")).rows[0];
    const role = (await client.query("SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename);
    const indexes = (await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
    const counts = {};
    const selected = ["publications", "booking_requests", "verified_merchants", "merchant_applications", "user_reports", "privacy_requests", "industry_entries", "business_cases", "benefit_orders", "admin_audit_events", "content_images"];
    for (const table of selected.filter(name => tables.includes(name))) {
      counts[table] = Number((await client.query('SELECT count(*) AS count FROM "' + table + '"')).rows[0].count);
    }
    await client.query("ROLLBACK");
    save("database-observation.json", {
      checkedAt: new Date().toISOString(),
      scope: "existing local development database",
      loopbackPort: target.port,
      readOnly: true,
      server,
      currentRoleCapabilities: role,
      migrations,
      tables,
      indexes,
      aggregateCounts: counts,
    });
    console.log(JSON.stringify({ databaseReadOnly: server.read_only, serverVersion: server.version, migrations, tables: tables.length, indexes: indexes.length }));
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

function request(url) {
  return new Promise(resolve => {
    const req = https.get(url, { timeout: 6000 }, res => {
      const socket = res.socket;
      const certificate = socket.getPeerCertificate();
      let bytes = 0;
      let body = "";
      res.on("data", chunk => {
        bytes += chunk.length;
        if (body.length < 1500) body += chunk.toString();
      });
      res.on("end", () => {
        let json;
        try { json = JSON.parse(body); } catch {}
        resolve({
          url,
          status: res.statusCode,
          tlsAuthorized: socket.authorized,
          certificateExpires: certificate.valid_to,
          contentType: res.headers["content-type"],
          bytes,
          ...(url.includes("/api/v1/")
            ? { body: json || "non-JSON response" }
            : { adminTitlePresent: body.includes("青方睐村美美"), redirect: res.headers.location }),
        });
      });
    });
    req.on("timeout", () => req.destroy(Object.assign(Error(), { code: "TIMEOUT" })));
    req.on("error", error => resolve({ url, error: error.code || error.name }));
  });
}

async function observePublicEndpoints() {
  const domains = await Promise.all(["api.dgqfl.xyz", "admin.dgqfl.xyz"].map(async host => ({
    host,
    ipv4: await dns.resolve4(host).catch(error => ({ error: error.code })),
    ipv6: await dns.resolve6(host).catch(error => ({ error: error.code })),
  })));
  const probes = await Promise.all([
    "https://api.dgqfl.xyz/api/v1/health",
    "https://api.dgqfl.xyz/api/v1/ready",
    "https://admin.dgqfl.xyz/",
  ].map(request));
  const result = { checkedAt: new Date().toISOString(), kind: "passive DNS and public HTTPS GET", domains, probes };
  save("public-endpoints.json", result);
  console.log(JSON.stringify(result));
}

const operation = process.argv[2];
const action = operation === "database" ? observeDatabase : observePublicEndpoints;
action().catch(error => { console.error("Read-only observation failed", error.code || error.name); process.exitCode = 1; });
