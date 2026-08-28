const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const {
  loadTlsOptions,
  validateProductionTransport,
} = require('../../src/config/tls');

function withEnv(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('direct production hosting fails closed when no TLS bundle is configured', () => {
  withEnv({
    NODE_ENV: 'production',
    ENFORCE_HTTPS: 'true',
    TRUST_PROXY: '0',
    TLS_PFX_PATH: undefined,
  }, () => {
    assert.throws(() => validateProductionTransport(), /TLS_PFX_PATH/);
  });
});

test('production may run behind an explicitly trusted HTTPS proxy', () => {
  withEnv({
    NODE_ENV: 'production',
    ENFORCE_HTTPS: 'true',
    TRUST_PROXY: '1',
    TLS_PFX_PATH: undefined,
  }, () => assert.doesNotThrow(() => validateProductionTransport()));
});

test('configured TLS bundle is read with TLS 1.2 minimum', () => {
  const pfxPath = join(mkdtempSync(join(tmpdir(), 'melann-tls-')), 'server.pfx');
  writeFileSync(pfxPath, Buffer.from('test-pfx'));
  withEnv({ NODE_ENV: 'production', TLS_PFX_PATH: pfxPath, TLS_PFX_PASSPHRASE: 'test-passphrase' }, () => {
    const options = loadTlsOptions();
    assert.equal(options.pfx.toString(), 'test-pfx');
    assert.equal(options.passphrase, 'test-passphrase');
    assert.equal(options.minVersion, 'TLSv1.2');
  });
});
