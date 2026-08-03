const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-integration-')), 'test.sqlite');
process.env.JWT_SECRET = 'integration-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbAll, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;

test.before(async () => {
  await initializeDatabase();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  await closeDb();
});

test('health endpoint reports ready API', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.system, 'Melann Lending System V2');
});

test('login rejects bad credentials and accepts seeded admin', async () => {
  const badResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });
  assert.equal(badResponse.status, 401);

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.user.username, 'admin');
  assert.equal(body.user.role, 'admin');
  assert.match(body.token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
});

test('penalty edit is blocked after the loan or payment is closed in DCR', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id)
    VALUES (?, ?, ?, ?, ?)
  `, ['C-DCR-LOCK', 'Dcr', 'Locked', 'Dcr Locked', branch.id]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, penalty, status, created_by, dcr_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-DCR-LOCK', customer.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-20', '2026-09-03', 26, 1000, 1000, 1000, 25, 'active', user.id, 99]);
  const payment = await dbRun(`
    INSERT INTO tblPayment (
      loan_id, customer_id, or_number, date_paid, amount_paid,
      balance_before, balance_after, payment_type, status, encoded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [loan.lastID, customer.lastID, 'PEN-DCR-LOCK', '2026-07-20', 25, 1000, 975, 'penalty', 'penalty', user.id]);

  const response = await fetch(`${baseUrl}/api/payments/${payment.lastID}/penalty-amount`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount_paid: 50 }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Daily Cash Report/);
});

test('posting a regular payment creates payment and updates loan balance', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES (?, ?, ?, ?)
  `, ['COL-PAYMENT', 'Pay', 'Collector', branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, ['C-PAYMENT', 'Payment', 'Client', 'Payment Client', branch.id, collector.lastID]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-PAYMENT', customer.lastID, collector.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-20', '2026-09-03', 26, 1000, 1000, 1000, 'active', user.id]);

  const response = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      loan_id: loan.lastID,
      or_number: 'N/A',
      date_paid: '2026-07-20',
      amount_paid: 100,
      collector_id: collector.lastID,
      remarks: 'integration payment',
    }),
  });
  const body = await response.json();
  const updatedLoan = await dbGet(`SELECT balance, total_paid, status FROM tblLoan WHERE id = ?`, [loan.lastID]);

  assert.equal(response.status, 201, body.error);
  assert.equal(body.balance_before, 1000);
  assert.equal(body.balance_after, 900);
  assert.equal(updatedLoan.balance, 900);
  assert.equal(updatedLoan.total_paid, 100);
  assert.equal(updatedLoan.status, 'active');
});

test('posting a backdated payment recalculates later payment running balances', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES (?, ?, ?, ?)
  `, ['COL-BACKDATE', 'Back', 'Date', branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, ['C-BACKDATE', 'Backdated', 'Client', 'Backdated Client', branch.id, collector.lastID]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-BACKDATE', customer.lastID, collector.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-01', '2026-08-15', 26, 1000, 1000, 1000, 'active', user.id]);

  const laterResponse = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      loan_id: loan.lastID,
      or_number: 'LATER-PAYMENT',
      date_paid: '2026-07-15',
      amount_paid: 100,
      collector_id: collector.lastID,
    }),
  });
  assert.equal(laterResponse.status, 201, (await laterResponse.json()).error);

  const backdatedResponse = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      loan_id: loan.lastID,
      or_number: 'BACKDATED-PAYMENT',
      date_paid: '2026-07-10',
      amount_paid: 50,
      collector_id: collector.lastID,
    }),
  });
  const backdatedBody = await backdatedResponse.json();
  const payments = await dbAll(`
    SELECT or_number, date_paid, amount_paid, balance_before, balance_after
    FROM tblPayment
    WHERE loan_id = ? AND status = 'active'
    ORDER BY date_paid ASC, id ASC
  `, [loan.lastID]);
  const updatedLoan = await dbGet(`SELECT balance, total_paid FROM tblLoan WHERE id = ?`, [loan.lastID]);

  assert.equal(backdatedResponse.status, 201, backdatedBody.error);
  assert.equal(backdatedBody.balance_before, 1000);
  assert.equal(backdatedBody.balance_after, 950);
  assert.deepEqual(payments, [
    { or_number: 'BACKDATED-PAYMENT', date_paid: '2026-07-10', amount_paid: 50, balance_before: 1000, balance_after: 950 },
    { or_number: 'LATER-PAYMENT', date_paid: '2026-07-15', amount_paid: 100, balance_before: 950, balance_after: 850 },
  ]);
  assert.equal(updatedLoan.balance, 850);
  assert.equal(updatedLoan.total_paid, 150);
});

test('reloan old balance posts to prior loan on release date and not to new loan', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES (?, ?, ?, ?)
  `, ['COL-RELOAN', 'Re', 'Loan', branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['C-RELOAN', 'Old', 'Balance', 'Old Balance', branch.id, collector.lastID, 'active']);
  const sourceLoan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, total_paid, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-RELOAN-OLD', customer.lastID, collector.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-01', '2026-08-15', 25, 1000, 1000, 500, 500, 'active', user.id]);

  const response = await fetch(`${baseUrl}/api/customers/${customer.lastID}/reloan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      principal: 2000,
      loan_period: 45,
      interest_rate: 10,
      date_released: '2026-07-21',
      loan_type: 'Reloan',
      source_loan_id: sourceLoan.lastID,
      previous_balance: 500,
      penalty: 0,
      passbook: 0,
    }),
  });
  const body = await response.json();
  const oldLoan = await dbGet(`SELECT balance, total_paid, status FROM tblLoan WHERE id = ?`, [sourceLoan.lastID]);
  const newLoan = await dbGet(`SELECT id, previous_balance, loan_type FROM tblLoan WHERE loan_code = ?`, [body.loan_code]);
  const oldLoanPayment = await dbGet(`
    SELECT loan_id, date_paid, amount_paid, balance_before, balance_after, remarks
    FROM tblPayment
    WHERE loan_id = ? AND amount_paid = ? AND date_paid = ?
  `, [sourceLoan.lastID, 500, '2026-07-21']);
  const newLoanBalancePayment = await dbGet(`
    SELECT id FROM tblPayment
    WHERE loan_id = ? AND amount_paid = ? AND remarks LIKE '%old balance%'
  `, [newLoan.id, 500]);

  assert.equal(response.status, 200, body.error);
  assert.equal(oldLoan.balance, 0);
  assert.equal(oldLoan.total_paid, 1000);
  assert.equal(oldLoan.status, 'fullpaid');
  assert.equal(newLoan.previous_balance, 0);
  assert.equal(newLoan.loan_type, 'Re-Loan');
  assert.equal(oldLoanPayment.date_paid, '2026-07-21');
  assert.equal(oldLoanPayment.balance_before, 500);
  assert.equal(oldLoanPayment.balance_after, 0);
  assert.match(oldLoanPayment.remarks, /old balance during Re-Loan/);
  assert.equal(newLoanBalancePayment, undefined);
});

test('reloan penalty posts to new loan on release date without reducing balance', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES (?, ?, ?, ?)
  `, ['COL-PENALTY', 'Penalty', 'Collector', branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['C-PENALTY', 'Penalty', 'Client', 'Penalty Client', branch.id, collector.lastID, 'active']);
  const sourceLoan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, total_paid, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-PENALTY-OLD', customer.lastID, collector.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-01', '2026-08-15', 25, 1000, 1000, 100, 900, 'active', user.id]);

  const response = await fetch(`${baseUrl}/api/customers/${customer.lastID}/reloan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      principal: 2000,
      loan_period: 45,
      interest_rate: 10,
      date_released: '2026-07-22',
      loan_type: 'Recon',
      source_loan_id: sourceLoan.lastID,
      previous_balance: 100,
      penalty: 75,
      passbook: 0,
    }),
  });
  const body = await response.json();
  const newLoan = await dbGet(`SELECT id, balance, total_amortization, penalty FROM tblLoan WHERE loan_code = ?`, [body.loan_code]);
  const penaltyPayment = await dbGet(`
    SELECT loan_id, date_paid, amount_paid, balance_before, balance_after, status, payment_type, remarks
    FROM tblPayment
    WHERE loan_id = ? AND status = 'penalty'
  `, [newLoan.id]);

  assert.equal(response.status, 200, body.error);
  assert.equal(newLoan.penalty, 75);
  assert.equal(newLoan.balance, newLoan.total_amortization);
  assert.equal(penaltyPayment.loan_id, newLoan.id);
  assert.equal(penaltyPayment.date_paid, '2026-07-22');
  assert.equal(penaltyPayment.amount_paid, 75);
  assert.equal(penaltyPayment.balance_before, newLoan.total_amortization);
  assert.equal(penaltyPayment.balance_after, newLoan.total_amortization);
  assert.equal(penaltyPayment.payment_type, 'penalty');
  assert.match(penaltyPayment.remarks, /Penalty charge posted during loan release/);
});
