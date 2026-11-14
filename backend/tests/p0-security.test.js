'use strict';

const test = require('node:test');
const {acceptedConsent,completedSectorChecks} = require('./helpers/publication-confirmation');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { createApp } = require('../src/server');
const { createMemoryRepository } = require('../src/memory-repository');
const policy = require('../src/admin-permissions');
const { validateDeployment } = require('../src/deployment-check');
const {
  validatePublicationSubmission,
  publicationEditExtras
} = require('../src/product-repository');

const id = '00000000-0000-4000-8000-000000000001';
const passwords = {
  operator: 'isolated-operator-password',
  verifier: 'isolated-verifier-password',
  superadmin: 'isolated-superadmin-password'
};
const publication = () => ({
  type: 'used',
  title: '完整测试闲置物品',
  detail: '这是一条专供隔离数据库安全验证的物品描述。',
  district: '中心街道',
  price: '80',
  imageIds: [id],
  attributes: {
    categoryId: 'C04G01S01',
    categoryVersion: '2.0-audit',
    templateCode: 'GOODS',
    templateVersion: '3',
    cityCode: '310100',
    districtCode: '310101',
    priceMode: 'amount',
    condition: '正常使用'
  }
});
async function httpFixture(t, repo = createMemoryRepository(), options = {}) {
  const app = createApp({
    repo,
    areas: ['中心街道'],
    allowDevLogin: true,
    adminPassword: passwords.operator,
    verificationAdminPassword: passwords.verifier,
    superAdminPassword: passwords.superadmin,
    ...options
  });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    app.closeAllConnections();
    await new Promise((resolve) => app.close(resolve));
  });
  const base = 'http://127.0.0.1:' + app.address().port;
  async function request(route, method = 'GET', data, auth = {}) {
    const response = await fetch(base + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth.cookie ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}),
        ...(auth.token ? { Authorization: 'Bearer ' + auth.token } : {})
      },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0]
    };
  }
  const admins = {};
  for (const role of Object.keys(passwords)) {
    const result = await request('/admin/api/login', 'POST', { role, password: passwords[role] });
    assert.equal(result.status, 200);
    admins[role] = { cookie: result.cookie, csrf: result.data.csrf };
  }
  return { app, base, request, admins };
}

test('P0 admin HTTP rejects verifier operations and independent private-data access before repository calls', async (t) => {
  const repo = createMemoryRepository(),
    events = [];
  repo.recordAdminAccess = async (event) => events.push(event);
  repo.privacyQueue = async () => [{ kind: 'access' }];
  repo.reportEvidence = async () => ({ body: 'private-message' });
  repo.qualify = async () => {};
  repo.changeRisk = async () => {};
  repo.trustStatus = async () => ({});
  repo.queue = async () => ({
    publications: [],
    merchantApplications: [
      { id, registrationCode: 'private-registration', licenseHolder: 'private-holder' }
    ]
  });
  const { request, admins } = await httpFixture(t, repo);
  const operations = [
    ['POST', 'review'],
    ['POST', 'review-service'],
    ['POST', 'review-report'],
    ['POST', 'regions'],
    ['POST', 'regions/status'],
    ['POST', 'categories/status'],
    ['POST', 'comments/review'],
    ['POST', 'emergency-remove'],
    ['POST', 'operations/run'],
    ['GET', 'comments'],
    ['GET', 'operations/health'],
    ['POST', 'trust/users/' + id + '/risk'],
    ['POST', 'trust/risks/' + id],
    ['POST', 'trust/appeals/' + id],
    ['GET', 'points/rules'],
    ['GET', 'points/users/' + id],
    ['POST', 'points/users/' + id + '/adjust'],
    ['POST', 'points/rules/publication_approved'],
    ['POST', 'points/rewards/' + id + '/review'],
    ['POST', 'points/appeals/' + id + '/review'],
    ['GET', 'home-content'],
    ['POST', 'home-content'],
    ['GET', 'home-reports'],
    ['GET', 'home-targets'],
    ['GET', 'commerce/orders'],
    ['POST', 'commerce/slots'],
    ['GET', 'industry/entries'],
    ['POST', 'industry/entries/' + id],
    ['GET', 'industry/reports'],
    ['POST', 'industry-services/' + id + '/review'],
    ['GET', 'business/disputes'],
    ['GET', 'business/cases/' + id],
    ['PUT', 'map-locations/' + id],
    ['GET', 'workbench/publication/' + id]
  ];
  for (const [method, route] of operations) {
    const url = '/admin/api/' + route;
    assert.equal(
      (await request(url, method, method === 'GET' ? undefined : {}, admins.verifier)).status,
      403,
      url
    );
    assert.equal(
      (await request(url, method, method === 'GET' ? undefined : {})).status,
      401,
      url + ' anonymous'
    );
  }
  for (const route of [
    'privacy-requests',
    'privacy-requests/' + id,
    'reports/' + id + '/evidence',
    'trust/risks/' + id + '/evidence',
    'workbench/privacy/' + id
  ]) {
    for (const role of ['operator', 'verifier'])
      assert.equal(
        (await request('/admin/api/' + route, 'GET', undefined, admins[role])).status,
        403,
        role + ' ' + route
      );
  }
  assert.equal(
    (await request('/admin/api/licenses/' + id, 'GET', undefined, admins.operator)).status,
    403
  );
  assert.equal(
    (await request('/admin/api/approve-merchant', 'POST', {}, admins.operator)).status,
    403
  );
  assert.equal(
    (await request('/admin/api/unregistered', 'POST', {}, admins.superadmin)).status,
    403
  );
  assert.equal(
    (await request('/admin/api/privacy-requests', 'GET', undefined, admins.superadmin)).status,
    200
  );
  const queue = await request('/admin/api/queue', 'GET', undefined, admins.operator);
  assert.equal(queue.data.merchantApplications[0].registrationCode, undefined);
  assert.equal(queue.data.merchantApplications[0].licenseHolder, undefined);
  assert.equal(
    (await request('/admin/api/reports/' + id + '/evidence', 'GET', undefined, admins.superadmin))
      .data.body,
    'private-message'
  );
  assert.equal(
    (await request('/admin/api/regions', 'POST', { name: '新增街道' }, admins.operator)).status,
    201
  );
  assert.equal(
    (
      await request(
        '/admin/api/trust/users/' + id + '/risk',
        'POST',
        { level: 'normal', revision: 0 },
        admins.operator
      )
    ).status,
    200
  );
  assert.equal(
    (
      await request(
        '/admin/api/trust/users/' + id + '/qualification',
        'POST',
        { scope: 'housing', status: 'verified', revision: 0 },
        admins.verifier
      )
    ).status,
    200
  );
  assert.equal(
    (
      await request(
        '/admin/api/regions',
        'POST',
        { name: '另一街道' },
        { ...admins.superadmin, csrf: 'wrong' }
      )
    ).status,
    403
  );
  assert.ok(events.some((event) => event.role === 'superadmin' && event.path.includes('evidence')));
  assert.ok(
    events.some(
      (event) =>
        event.role === 'verifier' &&
        event.path === '/admin/api/review' &&
        event.outcome === 'denied'
    )
  );
  assert.equal(
    (await request('/admin/api/login', 'POST', { role: 'unknown', password: passwords.operator }))
      .status,
    400
  );
  assert.equal(
    (
      await request('/admin/api/login', 'POST', {
        role: 'superadmin',
        password: passwords.operator
      })
    ).status,
    401
  );
});

test('P0 optional grants are explicit server configuration and absent from ordinary role defaults', async (t) => {
  assert.deepEqual(policy.permissionsFor('operator'), ['operations']);
  assert.deepEqual(policy.permissionsFor('verifier'), ['qualification']);
  assert.throws(() => policy.permissionsFor('operator', ['*']));
  const repo = createMemoryRepository();
  repo.privacyQueue = async () => [];
  const { request, admins } = await httpFixture(t, repo, { operatorPermissions: ['privacy'] });
  assert.equal(
    (await request('/admin/api/privacy-requests', 'GET', undefined, admins.operator)).status,
    200
  );
  assert.equal(
    (await request('/admin/api/reports/' + id + '/evidence', 'GET', undefined, admins.operator))
      .status,
    403
  );
});

test('P0 production gate rejects missing modes, development launch, invalid flags and shared role credentials', () => {
  const safe = {
    NODE_ENV: 'production',
    DATA_DRIVER: 'postgres',
    DATABASE_URL: 'postgres://fixture:fixture@localhost/citylife',
    ALLOW_DEV_LOGIN: 'false',
    WECHAT_APPID: 'wx1234567890abcdef',
    WECHAT_SECRET: 'isolated-wechat-secret',
    ADMIN_PASSWORD: passwords.operator,
    SUPER_ADMIN_PASSWORD: passwords.superadmin,
    VERIFICATION_ADMIN_PASSWORD: passwords.verifier,
    PHONE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    SERVICE_AREAS: '中心街道',
    PRIVATE_UPLOAD_DIR: path.resolve('C:/citylife-private'),
    PLATFORM_OPERATOR_NAME: '隔离测试运营主体',
    PRIVACY_CONTACT_EMAIL: 'privacy@example.test'
  };
  assert.equal(validateDeployment(safe, undefined, { requireProduction: true }).ok, true);
  for (const NODE_ENV of [undefined, '', 'prod', 'Production', 'development', 'test'])
    assert.equal(
      validateDeployment({ ...safe, NODE_ENV }, undefined, { requireProduction: true }).ok,
      false
    );
  for (const patch of [
    { ALLOW_DEV_LOGIN: 'false ' },
    { DATA_DRIVER: 'memory' },
    { PHONE_ENCRYPTION_KEY: '' },
    { SUPER_ADMIN_PASSWORD: passwords.operator },
    { SUPER_ADMIN_PASSWORD: '' },
    { VERIFICATION_ADMIN_PASSWORD: '' },
    { OPERATOR_ADMIN_PERMISSIONS: 'all' }
  ])
    assert.equal(validateDeployment({ ...safe, ...patch }).ok, false);
  assert.equal(validateDeployment({ NODE_ENV: 'development', HOST: '0.0.0.0' }).ok, false);
  for (const entry of [
    ['src/server.js'],
    ['src/server.js', '--production'],
    ['src/preflight.js']
  ]) {
    const env = { ...process.env, NODE_ENV: '', DATABASE_URL: '', DATA_DRIVER: 'memory' };
    const result = spawnSync(process.execPath, entry, {
      cwd: path.resolve(__dirname, '..'),
      env,
      encoding: 'utf8',
      timeout: 5000
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /NODE_ENV_REQUIRED/);
  }
  const result = spawnSync(process.execPath, ['src/server.js', '--production'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'development' },
    encoding: 'utf8',
    timeout: 5000
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PRODUCTION_MODE_REQUIRED/);
});

test('P0 all submitted template versions enforce current fields and edits validate final stored associations', () => {
  for (const version of [undefined, '1', '2', '3']) {
    const value = publication();
    value.attributes.templateVersion = version;
    if (!version) {
      delete value.attributes.templateVersion;
      delete value.attributes.templateCode;
    }
    if (version === '2') {
      value.attributes.brand = '测试品牌';
      value.attributes.model = '测试型号';
    }
    assert.doesNotThrow(() => validatePublicationSubmission(value));
    for (const field of ['condition', 'cityCode', 'districtCode', 'priceMode', 'categoryId']) {
      const invalid = structuredClone(value);
      delete invalid.attributes[field];
      assert.throws(() => validatePublicationSubmission(invalid), field + ' ' + version);
    }
    assert.throws(() => validatePublicationSubmission({ ...value, imageIds: [] }));
  }
  const current = publication(),
    value = { ...current, description: current.detail, replaceImages: true };
  delete value.attributes;
  assert.equal(
    publicationEditExtras(current, value).attributes.categoryId,
    current.attributes.categoryId
  );
  assert.throws(() =>
    publicationEditExtras(current, { ...value, attributes: {}, replaceAttributes: true })
  );
  const legacy = {
    attributes: {
      cityCode: '310100',
      districtCode: '310101',
      condition: '正常使用',
      priceMode: 'amount'
    },
    imageIds: [id]
  };
  assert.doesNotThrow(() => publicationEditExtras(legacy, { ...value, replaceImages: false }));
  assert.throws(() => validatePublicationSubmission({ ...current, attributes: null }));
});

test(
  'P0 real PostgreSQL HTTP publishing, category retention, role isolation and durable audit',
  { skip: !process.env.PG_TEST_DATABASE_URL && 'isolated PostgreSQL required' },
  async (t) => {
    const dsn = process.env.PG_TEST_DATABASE_URL;
    require('../src/test-database-guard').assertIsolatedDatabase(dsn);
    const { Pool } = require('pg'),
      control = new Pool({ connectionString: dsn }),
      schema = 'p0_' + crypto.randomBytes(6).toString('hex');
    let pool, repo;
    try {
      await control.query(`CREATE SCHEMA "${schema}"`);
      const options = '-c search_path=' + schema;
      pool = new Pool({ connectionString: dsn, options });
      await require('../src/schema-migrations').applyMigrations(pool);
      repo = require('../src/pg-repository').createPgRepository(dsn, { options });
      await repo.seedRegions(['中心街道']);
      const { request, admins, base } = await httpFixture(t, repo);
      const owner = (await request('/api/v1/dev/login', 'POST', { devUser: 'p0-owner' })).data;
      const outsider = (await request('/api/v1/dev/login', 'POST', { devUser: 'p0-outsider' }))
        .data;
      const bytes = await require('sharp')({
        create: { width: 40, height: 40, channels: 3, background: '#00aaaa' }
      })
        .png()
        .toBuffer();
      const upload = await fetch(base + '/api/v1/media', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + owner.token, 'Content-Type': 'image/png' },
        body: bytes
      });
      assert.equal(upload.status, 201);
      const image = (await upload.json()).image;
      const value = { ...publication(), imageIds: [image.id], publicationConsent: acceptedConsent() };
      for (const version of ['1', '2', '3']) {
        const invalid = structuredClone(value);
        invalid.attributes.templateVersion = version;
        delete invalid.attributes.condition;
        assert.equal((await request('/api/v1/publications', 'POST', invalid, owner)).status, 400);
      }
      const created = await request('/api/v1/publications', 'POST', value, owner);
      assert.equal(created.status, 201, JSON.stringify(created.data));
      const publicationId = created.data.publication.id,
        route = '/api/v1/me/publications/' + publicationId;
      assert.equal(
        (await request(route, 'PUT', { ...value, expectedRevision: 1 }, outsider)).status,
        404
      );
      const before = (
        await pool.query('SELECT revision,attributes,status FROM publications WHERE id=$1', [
          publicationId
        ])
      ).rows[0];
      assert.equal(
        (await request(route, 'PUT', { ...value, attributes: {}, expectedRevision: 1 }, owner))
          .status,
        400
      );
      assert.deepEqual(
        (
          await pool.query('SELECT revision,attributes,status FROM publications WHERE id=$1', [
            publicationId
          ])
        ).rows[0],
        before
      );
      const imageOnly = { ...value, expectedRevision: 1 };
      delete imageOnly.attributes;
      assert.equal((await request(route, 'PUT', imageOnly, owner)).status, 200);
      assert.equal(
        (await pool.query('SELECT attributes FROM publications WHERE id=$1', [publicationId]))
          .rows[0].attributes.categoryId,
        value.attributes.categoryId
      );
      const review = {
        ...completedSectorChecks(),
        target: 'publication',
        id: publicationId,
        status: 'published',
        expectedRevision: 2,
        textReviewed: true,
        imagesReviewed: true
      };
      assert.equal(
        (await request('/admin/api/review', 'POST', review, admins.verifier)).status,
        403
      );
      assert.equal(
        (await request('/admin/api/review', 'POST', review, admins.operator)).status,
        200
      );
      assert.equal((await request('/api/v1/items/' + publicationId)).status, 200);
      const verifierImage = await fetch(base + '/admin/api/media/' + image.id, {
        headers: { Cookie: admins.verifier.cookie }
      });
      assert.equal(verifierImage.status, 404);
      const operatorImage = await fetch(base + '/admin/api/media/' + image.id, {
        headers: { Cookie: admins.operator.cookie }
      });
      assert.equal(operatorImage.status, 200);
      assert.equal(
        (await request('/admin/api/privacy-requests', 'GET', undefined, admins.operator)).status,
        403
      );
      assert.equal(
        (await request('/admin/api/privacy-requests', 'GET', undefined, admins.superadmin)).status,
        200
      );
      const audits = (
        await pool.query("SELECT notes FROM admin_audit_events WHERE action='admin_access'")
      ).rows.map((x) => JSON.parse(x.notes));
      assert.ok(audits.some((x) => x.role === 'operator' && x.path === '/admin/api/review'));
      assert.ok(
        audits.some(
          (x) => x.role === 'verifier' && x.path === '/admin/api/review' && x.outcome === 'denied'
        )
      );
      assert.ok(
        audits.some((x) => x.role === 'superadmin' && x.path === '/admin/api/privacy-requests')
      );
      assert.ok(audits.every((x) => !JSON.stringify(x).includes(passwords.operator)));
    } finally {
      if (repo) await repo.close();
      if (pool) await pool.end();
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await control.end();
    }
  }
);
