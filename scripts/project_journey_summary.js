'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const fullLogFile = 'docs/prelaunch-followup-full-verification.log';
const clientLogFile = 'docs/information-design-client-regression.log';
const nativeLogFile = 'docs/information-design-final-native-verification.log';
const log = fs.readFileSync(path.join(root, fullLogFile), 'utf8');
const inventory = read('docs/project-journeys/inventory.json');
const journeys = read('docs/project-journeys/integration-result.json');

assert.equal(inventory.verified, 418);
assert.equal(inventory.pending, 0);
assert.equal(journeys.status, 'pass');
assert.equal(journeys.items.length, 418);
for (const item of inventory.items) {
  assert.equal(item.verification, 'isolated_api_pass');
  assert.ok(item.steps.every(step => item.evidence.steps.includes(step)), item.projectId);
}

const strict = JSON.parse(log.match(/\{\s*"verification": "isolated_postgresql"[\s\S]*?\r?\n\}/)[0]);
assert.ok(strict.ok);
assert.equal(strict.counts.failed + strict.counts.cancelled + strict.counts.skipped, 0);
const suitePattern = /# tests (\d+)\r?\n# suites \d+\r?\n# pass (\d+)\r?\n# fail (\d+)\r?\n# cancelled (\d+)\r?\n# skipped (\d+)/g;
const suites = [...log.matchAll(suitePattern)].map(match => ({
  tests: +match[1], passed: +match[2], failed: +match[3],
  cancelled: +match[4], skipped: +match[5]
}));
assert.equal(suites.length, 4);
for (const suite of suites) {
  assert.equal(suite.tests, suite.passed);
  assert.equal(suite.failed + suite.cancelled + suite.skipped, 0);
}
const recovery = JSON.parse(log.split(/\r?\n/).find(line => line.startsWith('{"verification":"backup_restore_drill"')));
assert.ok(recovery.ok);
assert.equal(recovery.tables, 72);
assert.ok(log.includes('PASS: real portable PostgreSQL verification and cleanup.'));

const clientLog = fs.readFileSync(path.join(root, clientLogFile), 'utf8');
const clientMatches = [...clientLog.matchAll(suitePattern)];
assert.equal(clientMatches.length, 1);
const client = {
  tests: +clientMatches[0][1], passed: +clientMatches[0][2], failed: +clientMatches[0][3],
  cancelled: +clientMatches[0][4], skipped: +clientMatches[0][5],
  skipReason: 'PostgreSQL connection absent in client run; database suites verified separately'
};
assert.equal(client.failed + client.cancelled, 0);
assert.equal(client.tests, client.passed + client.skipped);

const nativeLog = fs.readFileSync(path.join(root, nativeLogFile), 'utf8');
assert.ok(nativeLog.includes('PASS: real portable PostgreSQL verification and cleanup.'));
const native = {};
const nativeDirectories = {
  business: 'project-journeys', login: 'login-v1', workflows: 'business-workflows',
  privacy: 'workflow-privacy', centers: 'centers-browse', navigation: 'navigation-filters'
};
for (const [name, directory] of Object.entries(nativeDirectories)) {
  const result = read('docs/' + directory + '/ui-result.json');
  assert.equal(result.status, 'pass', name);
  assert.ok(result.cleanup.authStorageUnchanged && result.cleanup.runtimeOverlayRemoved, name);
  assert.equal(result.exceptions.length, 0, name);
  native[name] = {
    passed: result.passed, physicalDevice: false,
    checkedAt: result.checkedAt, screenshots: result.screenshots
  };
}

const report = {
  status: 'pass_for_verified_local_scope',
  checkedAt: new Date().toISOString(),
  projects: 418, resident: 43, industry: 375, bookable: 198,
  informationMaintenance: inventory.items.filter(item => item.informationOnly).length,
  perProjectPassed: 418,
  sources: {fullLogFile, clientLogFile, nativeLogFile, perProjectCheckedAt: journeys.checkedAt},
  suites: {
    main: suites[0], strictPostgres: strict.counts, latestClient: client,
    e2e: suites[1], permissions: suites[2], merchant: suites[3]
  },
  countsOverlap: true,
  recovery,
  native,
  density: read('docs/centers-browse/density-result.json'),
  guidanceLayout: read('docs/centers-browse/guidance-layout.json'),
  pages: read('miniprogram/app.json').pages.length,
  migrations: require('../backend/src/schema-migrations').manifest().length,
  newMigrationsAppliedToOriginalDevelopment: false,
  developmentApiReady: false,
  physicalDevice: false,
  productionAccessed: false,
  productionDeployed: false,
  paymentScope: 'excluded_by_user_information_platform',
  pending: [
    'physical WeChat device acceptance deferred by user',
    'real operator, privacy email, retention policy and platform privacy guide',
    'real WeChat identity/phone permissions, server credentials and HTTPS domain',
    'actual project qualifications, merchant verification, benefit supply and advertisement review',
    'original Docker development database recovery, backup and migrations 030-032',
    'production infrastructure, performance and release gates'
  ]
};
fs.writeFileSync(path.join(root, 'docs/project-journeys/summary.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  projects: report.projects, perProjectPassed: report.perProjectPassed,
  main: suites[0].passed, strictPostgres: strict.counts.passed, backupTables: recovery.tables,
  native: Object.fromEntries(Object.entries(native).map(([name, result]) => [name, result.passed])),
  physicalDevice: false, paymentScope: report.paymentScope, developmentApiReady: false
}));
