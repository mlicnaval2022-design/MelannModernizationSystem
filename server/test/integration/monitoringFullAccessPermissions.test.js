const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-monitoring-permissions-')), 'test.sqlite');
process.env.JWT_SECRET = 'monitoring-permissions-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;

async function api(token, path, options = {}) {
  return fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

async function login(username, password) {
  const response = await api(null, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, body.error);
  return body;
}

test.before(async () => {
  await initializeDatabase();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await closeDb();
});

test('3-Day Monitoring Full Access grants every management feature to a custom role', async () => {
  const admin = await login('admin', 'admin123');
  const roleResponse = await api(admin.token, '/users/roles', {
    method: 'POST',
    body: JSON.stringify({
      role_name: 'IT/Accounting Clerk',
      permissions: [{ module_key: 'monitoring', access_level: 'crud' }],
    }),
  });
  assert.equal(roleResponse.status, 201);
  const role = await roleResponse.json();

  const userResponse = await api(admin.token, '/users', {
    method: 'POST',
    body: JSON.stringify({
      username: 'monitoring_full_access_clerk',
      password: 'test-password',
      full_name: 'Monitoring Full Access Clerk',
      role: role.role_key,
    }),
  });
  assert.equal(userResponse.status, 201);

  const clerk = await login('monitoring_full_access_clerk', 'test-password');
  assert.equal(clerk.user.permissions.monitoring, 'crud');

  const scanResponse = await api(clerk.token, '/monitoring/run-daily', { method: 'POST' });
  assert.equal(scanResponse.status, 200);

  const readSettingsResponse = await api(clerk.token, '/settings');
  assert.equal(readSettingsResponse.status, 200);

  const saveSettingsResponse = await api(clerk.token, '/settings', {
    method: 'POST',
    body: JSON.stringify({ settings: { daily_cutoff: '21:00' } }),
  });
  assert.equal(saveSettingsResponse.status, 200);
});

test('3-Day Monitoring Input access cannot run scans or change settings', async () => {
  const admin = await login('admin', 'admin123');
  const roleResponse = await api(admin.token, '/users/roles', {
    method: 'POST',
    body: JSON.stringify({
      role_name: 'Monitoring Encoder',
      permissions: [{ module_key: 'monitoring', access_level: 'input' }],
    }),
  });
  assert.equal(roleResponse.status, 201);
  const role = await roleResponse.json();

  const userResponse = await api(admin.token, '/users', {
    method: 'POST',
    body: JSON.stringify({
      username: 'monitoring_input_clerk',
      password: 'test-password',
      full_name: 'Monitoring Input Clerk',
      role: role.role_key,
    }),
  });
  assert.equal(userResponse.status, 201);

  const clerk = await login('monitoring_input_clerk', 'test-password');
  const scanResponse = await api(clerk.token, '/monitoring/run-daily', { method: 'POST' });
  assert.equal(scanResponse.status, 403);
  const saveSettingsResponse = await api(clerk.token, '/settings', {
    method: 'POST',
    body: JSON.stringify({ settings: { daily_cutoff: '21:00' } }),
  });
  assert.equal(saveSettingsResponse.status, 403);
});
