const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-compliance-permissions-')), 'test.sqlite');
process.env.JWT_SECRET = 'government-compliance-permissions-test-secret';

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
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await closeDb();
});

test('configured Government Compliance CRUD grants a custom role access to every agency', async () => {
  const admin = await login('admin', 'admin123');
  const roleResponse = await api(admin.token, '/users/roles', {
    method: 'POST',
    body: JSON.stringify({
      role_name: 'IT/Accounting Clerk',
      permissions: [{ module_key: 'government-compliance', access_level: 'crud' }],
    }),
  });
  assert.equal(roleResponse.status, 201);
  const role = await roleResponse.json();

  const userResponse = await api(admin.token, '/users', {
    method: 'POST',
    body: JSON.stringify({
      username: 'it_accounting_clerk',
      password: 'test-password',
      full_name: 'IT Accounting Clerk',
      role: role.role_key,
    }),
  });
  assert.equal(userResponse.status, 201);

  const clerk = await login('it_accounting_clerk', 'test-password');
  assert.equal(clerk.user.permissions['government-compliance'], 'crud');

  for (const agency of ['CIC', 'SEC', 'BIR']) {
    const listResponse = await api(clerk.token, `/government-compliance/${agency}`);
    assert.equal(listResponse.status, 200, `${agency}: ${await listResponse.text()}`);
  }

  const createResponse = await api(clerk.token, '/government-compliance/CIC', {
    method: 'POST',
    body: JSON.stringify({ due_date: '2026-08-31', status: 'Pending' }),
  });
  assert.equal(createResponse.status, 201);
  const { id } = await createResponse.json();

  const updateResponse = await api(clerk.token, `/government-compliance/CIC/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ due_date: '2026-08-31', status: 'Submitted' }),
  });
  assert.equal(updateResponse.status, 200);

  const deleteResponse = await api(clerk.token, `/government-compliance/CIC/${id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
});
