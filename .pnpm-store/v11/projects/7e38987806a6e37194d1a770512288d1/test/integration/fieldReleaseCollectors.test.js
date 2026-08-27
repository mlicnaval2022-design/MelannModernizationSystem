const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-field-release-')), 'test.sqlite');
process.env.JWT_SECRET = 'field-release-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;
let token;

const api = (path, options = {}) => fetch(`${baseUrl}/api${path}`, {
  ...options,
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...options.headers,
  },
});

test.before(async () => {
  await initializeDatabase();
  const app = createApp();
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  ({ token } = await login.json());
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await closeDb();
});

test('user-selected active collectors populate the Field Release list', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const first = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES ('FR-001', 'Maria', 'Santos', ?, 1)
  `, [branch.id]);
  const second = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES ('FR-002', 'Juan', 'Dela Cruz', ?, 1)
  `, [branch.id]);
  const inactive = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES ('FR-003', 'Inactive', 'Collector', ?, 0)
  `, [branch.id]);

  const configurationResponse = await api('/reports/collection-sheet/field-releases/collectors');
  assert.equal(configurationResponse.status, 200);
  const configuration = await configurationResponse.json();
  assert.ok(configuration.collectors.some(row => row.collector_id === first.lastID && row.selected === 0));
  assert.ok(configuration.collectors.some(row => row.collector_id === second.lastID && row.selected === 0));
  assert.ok(!configuration.collectors.some(row => row.collector_id === inactive.lastID));

  const initiallyEmptyResponse = await api('/reports/collection-sheet/field-releases?date=2026-08-25');
  assert.deepEqual((await initiallyEmptyResponse.json()).releases, []);

  const saveSelectionResponse = await api('/reports/collection-sheet/field-releases/collectors', {
    method: 'PUT',
    body: JSON.stringify({ collector_ids: [first.lastID, second.lastID] }),
  });
  assert.equal(saveSelectionResponse.status, 200);

  const releasesResponse = await api('/reports/collection-sheet/field-releases?date=2026-08-25');
  assert.equal(releasesResponse.status, 200);
  const releases = (await releasesResponse.json()).releases;
  assert.deepEqual(releases.map(row => row.collector_id), [second.lastID, first.lastID]);
  assert.deepEqual(releases.map(row => Number(row.amount)), [0, 0]);

  const amountResponse = await api('/reports/collection-sheet/field-releases', {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-08-25',
      releases: [
        { collector_id: first.lastID, amount: 1250 },
        { collector_id: second.lastID, amount: 750 },
      ],
    }),
  });
  assert.equal(amountResponse.status, 200);

  await api('/reports/collection-sheet/field-releases/collectors', {
    method: 'PUT',
    body: JSON.stringify({ collector_ids: [first.lastID] }),
  });
  const narrowedResponse = await api('/reports/collection-sheet/field-releases?date=2026-08-25');
  const narrowed = (await narrowedResponse.json()).releases;
  assert.equal(narrowed.length, 1);
  assert.equal(narrowed[0].collector_id, first.lastID);
  assert.equal(Number(narrowed[0].amount), 1250);

  const inactiveSelectionResponse = await api('/reports/collection-sheet/field-releases/collectors', {
    method: 'PUT',
    body: JSON.stringify({ collector_ids: [inactive.lastID] }),
  });
  assert.equal(inactiveSelectionResponse.status, 400);
});
