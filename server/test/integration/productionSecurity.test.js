const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.NODE_ENV = 'production';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-production-security-')), 'test.sqlite');
process.env.JWT_SECRET = 'production-security-test-secret-32-characters';
process.env.INITIAL_ADMIN_PASSWORD = 'ProductionTest123!';
process.env.CORS_ORIGINS = 'https://branch.test';
process.env.ENFORCE_HTTPS = 'true';
process.env.TRUST_PROXY = '1';
delete process.env.TLS_PFX_PATH;

const { createApp } = require('../../src/app');
const { closeDb, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;

test.before(async () => {
  await initializeDatabase();
  server = await new Promise(resolve => {
    const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await closeDb();
});

test('production login uses a secure HttpOnly cookie without exposing the JWT to JavaScript', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://branch.test',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify({ username: 'admin', password: 'ProductionTest123!' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200, body.error);
  assert.equal(body.user.username, 'admin');
  assert.equal(Object.hasOwn(body, 'token'), false);
  const cookie = response.headers.get('set-cookie') || '';
  assert.match(cookie, /melann_token=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Strict/i);
});

test('production responses include security and no-cache headers', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: {
      origin: 'https://branch.test',
      'x-forwarded-proto': 'https',
    },
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('strict-transport-security') || '', /max-age=31536000/);
});
