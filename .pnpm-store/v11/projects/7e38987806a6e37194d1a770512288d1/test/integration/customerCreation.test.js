const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-customer-creation-')), 'test.sqlite');
process.env.JWT_SECRET = 'customer-creation-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

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
      id_type: 'Philippine Identification (PhilID / ePhilID)',
      id_number: '24029158710035018',
      proposed_principal: 5000,
      loan_type: 'New',
    }),
  });
  const body = await response.json();
  const detailsResponse = await fetch(`${baseUrl}/api/customers/${body.id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const details = await detailsResponse.json();
  const customer = await dbGet('SELECT id, first_name, last_name, id_type, id_number FROM tblCustomer WHERE id = ?', [body.id]);
  const loan = await dbGet('SELECT id FROM tblLoan WHERE customer_id = ?', [body.id]);

  assert.equal(response.status, 201, body.error);
  assert.equal(detailsResponse.status, 200, details.error);
  assert.equal(details.id_type, 'Philippine Identification (PhilID / ePhilID)');
  assert.deepEqual(customer, {
    id: body.id,
    first_name: 'Customer',
    last_name: 'Only',
    id_type: 'Philippine Identification (PhilID / ePhilID)',
    id_number: '24029158710035018',
  });
  assert.equal(loan, undefined);
});

test('an ID number cannot be saved without an ID type', async () => {
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
      first_name: 'Missing',
      last_name: 'Id Type',
      id_number: '123456789',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, 'Type of ID is required when an ID number is provided.');
});

test('a fully paid customer classified as Reloan is eligible without a previous loan record', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await loginResponse.json();
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  };

  const customerResponse = await fetch(`${baseUrl}/api/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      first_name: 'Eligible',
      last_name: 'Reloan',
      customer_classification: 'Reloan',
    }),
  });
  const customer = await customerResponse.json();
  const loanBeforeInput = await dbGet('SELECT id FROM tblLoan WHERE customer_id = ?', [customer.id]);

  assert.equal(customerResponse.status, 201, customer.error);
  assert.equal(loanBeforeInput, undefined);
  await dbRun(`UPDATE tblCustomer SET status = 'FULLY PAID' WHERE id = ?`, [customer.id]);

  const eligibilityResponse = await fetch(`${baseUrl}/api/customers/${customer.id}/reloan-eval`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const eligibility = await eligibilityResponse.json();

  assert.equal(eligibilityResponse.status, 200, eligibility.error);
  assert.equal(eligibility.is_eligible, true);
  assert.equal(eligibility.can_proceed, true);

  const loanResponse = await fetch(`${baseUrl}/api/customers/${customer.id}/reloan`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      principal: 5000,
      loan_period: 45,
      interest_rate: 15,
      date_released: '2026-08-21',
      loan_type: 'Reloan',
    }),
  });
  const loanResult = await loanResponse.json();
  const savedLoan = await dbGet(
    'SELECT loan_type, principal, status FROM tblLoan WHERE customer_id = ?',
    [customer.id]
  );

  assert.equal(loanResponse.status, 200, loanResult.error);
  assert.deepEqual(savedLoan, { loan_type: 'Reloan', principal: 5000, status: 'active' });
});

test('creating and releasing a 30-day loan keeps maturity at exactly 30 calendar days', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await loginResponse.json();
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  };
  const branch = await dbGet('SELECT id FROM tblBranch LIMIT 1');
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id)
    VALUES (?, ?, ?, ?, ?)
  `, ['C-30-DAY', 'Thirty', 'Day', 'Thirty Day', branch.id]);

  const createResponse = await fetch(`${baseUrl}/api/loans`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customer_id: customer.lastID,
      branch_id: branch.id,
      principal: 5000,
      interest_rate: 15,
      loan_period: 30,
      date_released: '2026-07-17',
      loan_type: 'New',
      status: 'approved',
    }),
  });
  const created = await createResponse.json();

  assert.equal(createResponse.status, 201, created.error);
  assert.equal(created.date_maturity, '2026-08-16');

  const releaseResponse = await fetch(`${baseUrl}/api/loans/${created.id}/release`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ date_released: '2026-07-17' }),
  });
  const released = await releaseResponse.json();
  const savedLoan = await dbGet(
    'SELECT loan_period, date_released, date_maturity, status FROM tblLoan WHERE id = ?',
    [created.id]
  );

  assert.equal(releaseResponse.status, 200, released.error);
  assert.deepEqual(savedLoan, {
    loan_period: 30,
    date_released: '2026-07-17',
    date_maturity: '2026-08-16',
    status: 'active',
  });
});
