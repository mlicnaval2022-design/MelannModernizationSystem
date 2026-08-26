const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-payment-reversal-')), 'test.sqlite');
process.env.JWT_SECRET = 'payment-reversal-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;
let token;

test.before(async () => {
  await initializeDatabase();
  server = await new Promise(resolve => {
    const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  ({ token } = await login.json());
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await closeDb();
});

test('batch reversal stores its reason and recalculates the loan', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id)
    VALUES ('C-REVERSE', 'Reverse', 'Client', 'Reverse Client', ?)
  `, [branch.id]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (loan_code, customer_id, branch_id, principal, loan_period, date_released, balance, status)
    VALUES ('LN-REVERSE', ?, ?, 1000, 30, '2026-08-20', 900, 'active')
  `, [customer.lastID, branch.id]);
  const payment = await dbRun(`
    INSERT INTO tblPayment (loan_id, customer_id, or_number, date_paid, amount_paid, balance_before, balance_after, status)
    VALUES (?, ?, 'OR-REVERSE', '2026-08-21', 100, 1000, 900, 'active')
  `, [loan.lastID, customer.lastID]);

  const response = await fetch(`${baseUrl}/api/reversals/batch`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ payment_ids: [payment.lastID], reason: 'Wrong payment entry' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200, body.error);
  const reversedPayment = await dbGet(
    `SELECT status, reversal_reason, reversed_at, reversed_by FROM tblPayment WHERE id = ?`,
    [payment.lastID]
  );
  assert.equal(reversedPayment.status, 'reversed');
  assert.equal(reversedPayment.reversal_reason, 'Wrong payment entry');
  assert.ok(reversedPayment.reversed_at);
  assert.ok(reversedPayment.reversed_by);

  const updatedLoan = await dbGet(`SELECT balance, total_paid FROM tblLoan WHERE id = ?`, [loan.lastID]);
  assert.equal(updatedLoan.balance, 1000);
  assert.equal(updatedLoan.total_paid, 0);

  // The route intentionally recalculates monitoring in the background.
  // Let that work finish before the isolated test database is closed.
  await new Promise(resolve => setTimeout(resolve, 50));
});
