const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-customer-creation-')), 'test.sqlite');
process.env.JWT_SECRET = 'customer-creation-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbGet, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;

test.before(async () => {
  await initializeDatabase();
  const app = createApp();
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await closeDb();
});

test('creating a customer does not automatically create a loan', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await loginResponse.json();

  const response = await fetch(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      first_name: 'Customer',
      last_name: 'Only',
      customer_classification: 'New Client',
      proposed_principal: 5000,
      loan_type: 'New',
    }),
  });
  const body = await response.json();
  const customer = await dbGet('SELECT id, first_name, last_name FROM tblCustomer WHERE id = ?', [body.id]);
  const loan = await dbGet('SELECT id FROM tblLoan WHERE customer_id = ?', [body.id]);

  assert.equal(response.status, 201, body.error);
  assert.deepEqual(customer, { id: body.id, first_name: 'Customer', last_name: 'Only' });
  assert.equal(loan, undefined);
});
