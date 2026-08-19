const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-report-permissions-')), 'test.sqlite');
process.env.JWT_SECRET = 'report-permissions-test-secret';

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

test('a role can access only its selected report types', async () => {
  const admin = await login('admin', 'admin123');
  const roleResponse = await api(admin.token, '/users/roles', {
    method: 'POST',
    body: JSON.stringify({
      role_name: 'Aging Report Viewer',
      description: 'Can view only the Aging Report.',
      permissions: [
        { module_key: 'reports', access_level: 'view' },
        { module_key: 'report:aging-report', access_level: 'view' },
      ],
    }),
  });
  assert.equal(roleResponse.status, 201);
  const role = await roleResponse.json();

  const userResponse = await api(admin.token, '/users', {
    method: 'POST',
    body: JSON.stringify({
      username: 'aging_viewer',
      password: 'aging123',
      full_name: 'Aging Viewer',
      role: role.role_key,
    }),
  });
  assert.equal(userResponse.status, 201);

  const rolesResponse = await api(admin.token, '/users/roles');
  assert.equal(rolesResponse.status, 200);
  const savedRole = (await rolesResponse.json()).find(item => item.role_key === role.role_key);
  assert.match(savedRole.description, /view-only access to 1 of \d+ modules and 1 of \d+ report types/i);
  assert.match(savedRole.description, /cannot add, edit, or delete/i);

  await dbRun(
    `INSERT INTO tblRolePermission (role_id, module_key, access_level) VALUES (?, 'report:daily-target', 'view')`,
    [role.id]
  );
  await initializeDatabase();

  const rolesAfterRestartResponse = await api(admin.token, '/users/roles');
  assert.equal(rolesAfterRestartResponse.status, 200);
  const roleAfterRestart = (await rolesAfterRestartResponse.json()).find(item => item.role_key === role.role_key);
  assert.equal(roleAfterRestart.report_type_count, 1);
  assert.deepEqual(
    roleAfterRestart.permissions.filter(item => item.module_key.startsWith('report:')),
    [{ module_key: 'report:aging-report', access_level: 'view' }]
  );

  const viewer = await login('aging_viewer', 'aging123');
  assert.equal(viewer.user.permissions['report:aging-report'], 'view');
  assert.equal(viewer.user.permissions['report:collection-report'], undefined);

  const allowed = await api(viewer.token, '/reports/aging-report?date_to=2026-08-15');
  assert.equal(allowed.status, 200);

  const blockedCollection = await api(viewer.token, '/reports/daily-collection?date_from=2026-08-15&date_to=2026-08-15');
  assert.equal(blockedCollection.status, 403);

  const blockedExpenseInput = await api(viewer.token, '/reports/expenses/personnel', {
    method: 'POST',
    body: JSON.stringify({ employee_name: 'Blocked Employee', position: 'Collector' }),
  });
  assert.equal(blockedExpenseInput.status, 403);
});
