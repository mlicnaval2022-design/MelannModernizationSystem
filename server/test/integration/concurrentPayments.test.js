const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-concurrency-')), 'test.sqlite');
process.env.JWT_SECRET = 'concurrency-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbAll, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

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

test('twenty simultaneous payments on separate accounts are committed exactly once', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES ('COL-CONCURRENT', 'Concurrent', 'Collector', ?)
  `, [branch.id]);

  const loanIds = [];
  for (let index = 1; index <= 20; index++) {
    const customer = await dbRun(`
      INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
      VALUES (?, 'Load', ?, ?, ?, ?, 'active')
    `, [`C-LOAD-${index}`, String(index), `Load Client ${index}`, branch.id, collector.lastID]);
    const loan = await dbRun(`
      INSERT INTO tblLoan (
        loan_code, customer_id, collector_id, branch_id, loan_type, principal,
        loan_period, date_released, date_maturity, amortization,
        total_amortization, net_proceeds, balance, status
      ) VALUES (?, ?, ?, ?, 'New', 1000, 30, '2026-08-28', '2026-09-27', 40, 1000, 1000, 1000, 'active')
    `, [`LN-LOAD-${index}`, customer.lastID, collector.lastID, branch.id]);
    loanIds.push(loan.lastID);
  }

  const responses = await Promise.all(loanIds.map((loanId, index) => fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      loan_id: loanId,
      collector_id: collector.lastID,
      or_number: `OR-LOAD-${index + 1}`,
      date_paid: '2026-08-28',
      amount_paid: 100,
    }),
  })));

  const bodies = await Promise.all(responses.map(response => response.json()));
  responses.forEach((response, index) => assert.equal(response.status, 201, bodies[index].error));

  const payments = await dbAll(`SELECT loan_id, COUNT(*) AS count FROM tblPayment WHERE or_number LIKE 'OR-LOAD-%' GROUP BY loan_id`);
  assert.equal(payments.length, 20);
  assert.ok(payments.every(payment => payment.count === 1));
  const balances = await dbAll(`SELECT balance FROM tblLoan WHERE id IN (${loanIds.map(() => '?').join(',')})`, loanIds);
  assert.equal(balances.length, 20);
  assert.ok(balances.every(loan => loan.balance === 900));
});

test('simultaneous duplicate submissions create only one payment', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const collector = await dbGet(`SELECT id FROM tblCollector WHERE collector_code = 'COL-CONCURRENT'`);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
    VALUES ('C-DUPLICATE-LOAD', 'Duplicate', 'Load', 'Duplicate Load', ?, ?, 'active')
  `, [branch.id, collector.id]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal,
      loan_period, date_released, date_maturity, amortization,
      total_amortization, net_proceeds, balance, status
    ) VALUES ('LN-DUPLICATE-LOAD', ?, ?, ?, 'New', 1000, 30, '2026-08-28', '2026-09-27', 40, 1000, 1000, 1000, 'active')
  `, [customer.lastID, collector.id, branch.id]);

  const submit = () => fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      loan_id: loan.lastID,
      collector_id: collector.id,
      or_number: 'OR-SAME-REQUEST',
      date_paid: '2026-08-28',
      amount_paid: 100,
    }),
  });

  const responses = await Promise.all(Array.from({ length: 10 }, submit));
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.equal(responses.filter(response => response.status === 409).length, 9);
  assert.equal(
    (await dbGet(`SELECT COUNT(*) AS count FROM tblPayment WHERE loan_id = ?`, [loan.lastID])).count,
    1
  );
  assert.equal((await dbGet(`SELECT balance FROM tblLoan WHERE id = ?`, [loan.lastID])).balance, 900);
});
