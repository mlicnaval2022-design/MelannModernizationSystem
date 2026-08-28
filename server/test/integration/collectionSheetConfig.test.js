const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-cs-config-')), 'test.sqlite');
process.env.JWT_SECRET = 'cs-config-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, initializeDatabase, dbRun } = require('../../src/db/database');

let server;
let baseUrl;

const login = async (username, password) => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  return response.json();
};

const api = (token, path, options = {}) => fetch(`${baseUrl}/api${path}`, {
  ...options,
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...options.headers,
  },
});

test.before(async () => {
  await initializeDatabase();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await closeDb();
});

test('Collection Sheet configuration can be fetched and updated', async () => {
  const admin = await login('admin', 'admin123');

  // 1. Fetch default CS configuration
  const getRes = await api(admin.token, '/reports/collection-sheet/config');
  assert.equal(getRes.status, 200);
  const initialConfig = await getRes.json();
  assert.equal(initialConfig.checkedBy, 'MARILYN O. RELOBA');
  assert.equal(initialConfig.encodedBy, 'IT/ACCOUNTING CLERK');
  assert.equal(initialConfig.approvedBy, 'VICTORIO L. RELOBA JR.');

  // 2. Update CS configuration
  const putRes = await api(admin.token, '/reports/collection-sheet/config', {
    method: 'PUT',
    body: JSON.stringify({
      checkedBy: 'JUAN DELA CRUZ',
      encodedBy: 'MARIA SANTOS',
      approvedBy: 'PEDRO PENDUKO',
    }),
  });
  assert.equal(putRes.status, 200);
  const putBody = await putRes.json();
  assert.equal(putBody.signatures.checkedBy, 'JUAN DELA CRUZ');
  assert.equal(putBody.signatures.encodedBy, 'MARIA SANTOS');
  assert.equal(putBody.signatures.approvedBy, 'PEDRO PENDUKO');

  // 3. Fetch again to verify persistence
  const getUpdatedRes = await api(admin.token, '/reports/collection-sheet/config');
  assert.equal(getUpdatedRes.status, 200);
  const updatedConfig = await getUpdatedRes.json();
  assert.equal(updatedConfig.checkedBy, 'JUAN DELA CRUZ');
  assert.equal(updatedConfig.encodedBy, 'MARIA SANTOS');
  assert.equal(updatedConfig.approvedBy, 'PEDRO PENDUKO');

  // 4. Verify in collection-sheet report endpoint
  // Create a dummy collector first
  await dbRun(`INSERT INTO tblCollector (collector_code, first_name, last_name) VALUES ('C99', 'TEST', 'COLLECTOR')`);
  const sheetRes = await api(admin.token, '/reports/collection-sheet?collector_id=1&date=2026-08-28');
  assert.equal(sheetRes.status, 200);
  const sheetData = await sheetRes.json();
  assert.equal(sheetData.signatures.checkedBy, 'JUAN DELA CRUZ');
  assert.equal(sheetData.signatures.encodedBy, 'MARIA SANTOS');
  assert.equal(sheetData.signatures.approvedBy, 'PEDRO PENDUKO');
});
