const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-release-cancelled-')), 'test.sqlite');
process.env.JWT_SECRET = 'release-cancelled-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, initializeDatabase, dbRun } = require('../../src/db/database');

let server;
let baseUrl;

const login = async (username, password) => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  return response.json();
};

const api = (token, path, options = {}) => fetch(`${baseUrl}/api${path}`, {
  ...options,
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...options.headers,
  },
});

test.before(async () => {
  await initializeDatabase();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await closeDb();
});

test('cancelled loans are not included or counted in Releases Report, Monthly Releases, and Loan Type reports', async () => {
  const admin = await login('admin', 'admin123');

  // Insert a test customer
  const custRes = await dbRun(
    `INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, status) VALUES (?, ?, ?, ?, ?)`,
    ['CUST-CANCEL-01', 'Josephine', 'Rimandiman', 'Rimandiman, Josephine', 'active']
  );
  const customerId = custRes.lastID;

  // Insert an active loan on 2026-08-18 (Tuesday)
  await dbRun(
    `INSERT INTO tblLoan (loan_code, customer_id, loan_type, principal, date_released, status, amortization, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['LN-ACTIVE-01', customerId, 'Reloan', 10000, '2026-08-18', 'active', 296, 11500]
  );

  // Insert a cancelled loan on 2026-08-18
  await dbRun(
    `INSERT INTO tblLoan (loan_code, customer_id, loan_type, principal, date_released, status, amortization, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['LN-CANCEL-01', customerId, 'Reloan', 5000, '2026-08-18', 'cancelled', 148, 5750]
  );

  // Fetch release report for 2026-08-18
  const reportRes = await api(admin.token, '/reports/release-report?date_from=2026-08-18&date_to=2026-08-18');
  assert.equal(reportRes.status, 200);
  const reportData = await reportRes.json();

  assert.equal(reportData.loans.length, 1);
  assert.equal(reportData.loans[0].loan_code, 'LN-ACTIVE-01');
  assert.equal(reportData.total_principal, 10000);

  // Fetch monthly releases for 2026-08
  const monthlyRes = await api(admin.token, '/reports/monthly-releases?year=2026&month=08');
  assert.equal(monthlyRes.status, 200);
  const monthlyData = await monthlyRes.json();

  assert.equal(monthlyData.loans.length, 1);
  assert.equal(monthlyData.loans[0].loan_code, 'LN-ACTIVE-01');
  assert.equal(monthlyData.total_principal, 10000);

  // Fetch loan type report
  const loanTypeRes = await api(admin.token, '/reports/loan-type?date_from=2026-08-18&date_to=2026-08-18');
  assert.equal(loanTypeRes.status, 200);
  const loanTypeData = await loanTypeRes.json();

  assert.equal(loanTypeData.loans.length, 1);
  assert.equal(loanTypeData.loans[0].loan_code, 'LN-ACTIVE-01');

  // Fetch Customer Reloan eval stats
  const reloanEvalRes = await api(admin.token, `/customers/${customerId}/reloan-eval`);
  assert.equal(reloanEvalRes.status, 200);
  const reloanEvalData = await reloanEvalRes.json();
  assert.equal(reloanEvalData.total_loans, 1);
  assert.equal(reloanEvalData.total_amount_borrowed, 10000);

  // Fetch Customer Credit eval stats
  const creditEvalRes = await api(admin.token, `/customers/${customerId}/credit-eval`);
  assert.equal(creditEvalRes.status, 200);
  const creditEvalData = await creditEvalRes.json();
  assert.equal(creditEvalData.total_loans, 1);

  // Fetch DCR loan releases
  const dcrRes = await api(admin.token, `/dcr/loan-releases?date=2026-08-18`);
  assert.equal(dcrRes.status, 200);
  const dcrData = await dcrRes.json();
  assert.equal(dcrData.length, 1);
  assert.equal(dcrData[0].loan_amount, 10000);
});
