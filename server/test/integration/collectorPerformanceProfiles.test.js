const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const testRoot = mkdtempSync(join(tmpdir(), 'melann-collector-profiles-'));
process.env.DB_PATH = join(testRoot, 'test.sqlite');
process.env.UPLOADS_PATH = join(testRoot, 'uploads');
process.env.JWT_SECRET = 'collector-profile-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;
let token;

const api = (path, options = {}) => fetch(`${baseUrl}/api${path}`, {
  ...options,
  headers: {
    authorization: `Bearer ${token}`,
    ...options.headers,
  },
});

test.before(async () => {
  await initializeDatabase();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  ({ token } = await loginResponse.json());
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await closeDb();
});

test('collector photos and profile edits are stored on the server and shared by API clients', async () => {
  const branch = await dbGet('SELECT id FROM tblBranch ORDER BY id LIMIT 1');
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES ('COL-SHARED-PHOTO', 'Shared', 'Collector', ?, 1)
  `, [branch.id]);

  const uploadBody = new FormData();
  uploadBody.append('file', new Blob(['shared-photo-bytes'], { type: 'image/jpeg' }), 'collector.jpg');
  const uploadResponse = await api('/collector-performance/profile-photo', {
    method: 'POST',
    body: uploadBody,
  });
  const upload = await uploadResponse.json();

  assert.equal(uploadResponse.status, 201, upload.error);
  assert.equal(upload.stored, true);
  assert.match(upload.url, /^\/uploads\/collectors\//);

  const saveResponse = await api('/collector-performance/profiles', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profiles: {
        [collector.lastID]: {
          photo: upload.url,
          fullName: 'Shared Collector Profile',
          area: 'Shared Area',
        },
      },
    }),
  });
  const saved = await saveResponse.json();

  assert.equal(saveResponse.status, 200, saved.error);
  assert.equal(saved.profiles[collector.lastID].photo, upload.url);

  const readResponse = await api('/collector-performance/profiles');
  const read = await readResponse.json();
  assert.equal(readResponse.status, 200, read.error);
  assert.deepEqual(read.profiles[collector.lastID], {
    photo: upload.url,
    fullName: 'Shared Collector Profile',
    area: 'Shared Area',
  });

  const photoResponse = await fetch(`${baseUrl}${upload.url}`);
  assert.equal(photoResponse.status, 200);
  assert.equal(await photoResponse.text(), 'shared-photo-bytes');
});
