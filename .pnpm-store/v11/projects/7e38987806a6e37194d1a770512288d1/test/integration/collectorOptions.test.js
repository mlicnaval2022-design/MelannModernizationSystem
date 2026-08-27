const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-collector-options-')), 'test.sqlite');
process.env.JWT_SECRET = 'collector-options-test-secret';

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
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
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

test('collector options are configurable and renames update saved collectors', async () => {
  const initialResponse = await api('/collectors/options');
  assert.equal(initialResponse.status, 200);
  const initial = await initialResponse.json();
  assert.ok(initial.assigned_areas.some(option => option.option_name === 'ORMOC'));
  assert.ok(initial.supervisors.some(option => option.option_name === 'Omega, Raymund'));

  const createResponse = await api('/collectors/options', {
    method: 'POST',
    body: JSON.stringify({ option_type: 'assigned_area', option_name: '  Palo   Area  ' }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.option_name, 'Palo Area');

  const duplicateResponse = await api('/collectors/options', {
    method: 'POST',
    body: JSON.stringify({ option_type: 'assigned_area', option_name: 'palo area' }),
  });
  assert.equal(duplicateResponse.status, 409);

  await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, assigned_to)
    VALUES ('COL-OPTION-1', 'Test', 'Collector', 'Palo Area')
  `);
  const updateResponse = await api(`/collectors/options/${created.id}`, {
    method: 'PUT',
    body: JSON.stringify({ option_name: 'Palo / Tanauan', is_active: false }),
  });
  assert.equal(updateResponse.status, 200);

  const collector = await dbGet(`SELECT assigned_to FROM tblCollector WHERE collector_code = 'COL-OPTION-1'`);
  assert.equal(collector.assigned_to, 'Palo / Tanauan');
  const updated = await dbGet(`SELECT option_name, is_active FROM tblCollectorOption WHERE id = ?`, [created.id]);
  assert.deepEqual(updated, { option_name: 'Palo / Tanauan', is_active: 0 });
});
