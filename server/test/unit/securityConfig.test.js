const test = require('node:test');
const assert = require('node:assert/strict');

const { getJwtSecret } = require('../../src/config/security');

test('JWT configuration rejects missing and known production secrets', () => {
  const previousEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'development';
    assert.throws(() => getJwtSecret(), /JWT_SECRET is required/);

    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'melann_lending_secret_key_2026';
    assert.throws(() => getJwtSecret(), /unique production secret/);

    process.env.JWT_SECRET = 'a-unique-production-secret-that-is-long-enough';
    assert.equal(getJwtSecret(), process.env.JWT_SECRET);
  } finally {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
