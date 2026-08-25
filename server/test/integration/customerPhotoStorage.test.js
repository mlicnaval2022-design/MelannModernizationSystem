const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, unlinkSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const testRoot = mkdtempSync(join(tmpdir(), 'melann-customer-photo-'));
const sourcePhotoPath = join(testRoot, 'source-photo.jpg');
process.env.DB_PATH = join(testRoot, 'test.sqlite');
process.env.UPLOADS_PATH = join(testRoot, 'uploads');
process.env.JWT_SECRET = 'customer-photo-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;
let token;

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

test('customer photo remains available after the original source file is deleted', async () => {
  const photoBytes = Buffer.from('independent-server-photo-copy');
  writeFileSync(sourcePhotoPath, photoBytes);

  const uploadBody = new FormData();
  uploadBody.append(
    'file',
    new Blob([readFileSync(sourcePhotoPath)], { type: 'image/jpeg' }),
    'source-photo.jpg'
  );
  const uploadResponse = await fetch(`${baseUrl}/api/customers/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: uploadBody,
  });
  const upload = await uploadResponse.json();

  assert.equal(uploadResponse.status, 200, upload.error);
  assert.equal(upload.stored, true);
  assert.match(upload.url, /^\/uploads\//);

  unlinkSync(sourcePhotoPath);

  const createResponse = await fetch(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      first_name: 'Photo',
      last_name: 'Persistence',
      photo_client: upload.url,
    }),
  });
  const customer = await createResponse.json();

  assert.equal(createResponse.status, 201, customer.error);

  const detailsResponse = await fetch(`${baseUrl}/api/customers/${customer.id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const details = await detailsResponse.json();
  assert.equal(detailsResponse.status, 200, details.error);
  assert.equal(details.photo_client, upload.url);

  const publicPhotoResponse = await fetch(`${baseUrl}${upload.url}`);
  assert.equal(publicPhotoResponse.status, 401);

  const storedPhotoResponse = await fetch(`${baseUrl}${upload.url}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(storedPhotoResponse.status, 200);
  assert.deepEqual(Buffer.from(await storedPhotoResponse.arrayBuffer()), photoBytes);
});
