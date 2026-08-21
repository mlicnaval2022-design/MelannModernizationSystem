const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

function onceReady(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    // Full-suite runs initialize several isolated SQLite databases in parallel.
    // Allow enough time for a contended CI or branch server without masking a
    // real startup failure (the child exit handler still fails immediately).
    const timer = setTimeout(() => reject(new Error(`server did not start. Output:\n${output}`)), 30000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('Running on http://localhost:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited before readiness with code ${code}. Output:\n${output}`));
    });
  });
}

test('server boots, initializes an isolated database, and serves login flow', async () => {
  const port = 56231;
  const dbPath = join(mkdtempSync(join(tmpdir(), 'melann-e2e-')), 'test.sqlite');
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: join(__dirname, '../..'),
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, JWT_SECRET: 'e2e-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await onceReady(child);

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);

    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'user', password: 'user123' }),
    });
    const body = await login.json();

    assert.equal(login.status, 200);
    assert.equal(body.user.username, 'user');
    assert.equal(body.user.role, 'user');
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
});
