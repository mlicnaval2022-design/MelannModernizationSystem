const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../../src/app');

function withProductionHttpsEnv(callback) {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    JWT_SECRET: process.env.JWT_SECRET,
    ENFORCE_HTTPS: process.env.ENFORCE_HTTPS,
    TRUST_PROXY: process.env.TRUST_PROXY,
  };

  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGINS = 'https://branch.example.com';
  process.env.JWT_SECRET = 'production-test-secret-with-enough-length';
  delete process.env.ENFORCE_HTTPS;
  process.env.TRUST_PROXY = '1';

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('production server rejects plain HTTP requests without trusting the Host header', async () => {
  await withProductionHttpsEnv(async () => {
    const server = await listen(createApp());
    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(response.status, 426);
      assert.equal((await response.json()).error, 'HTTPS is required');
    } finally {
      server.close();
    }
  });
});

test('production server trusts HTTPS forwarded by the reverse proxy', async () => {
  await withProductionHttpsEnv(async () => {
    const server = await listen(createApp());
    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { 'x-forwarded-proto': 'https', origin: 'https://branch.example.com' },
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, 'ok');
      assert.match(response.headers.get('strict-transport-security') || '', /max-age=31536000/);
    } finally {
      server.close();
    }
  });
});
