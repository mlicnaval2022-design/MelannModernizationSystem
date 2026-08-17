const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-fortyfive-')), 'test.sqlite');
process.env.JWT_SECRET = 'fortyfive-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;
let token;

const api = (path, options = {}) => fetch(`${baseUrl}/api${path}`, {
  ...options,
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...options.headers,
  },
});

test.before(async () => {
  await initializeDatabase();
  const app = createApp();
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
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
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await closeDb();
});

test('forty-five-day-rating calculate returns on-the-fly evaluations for date range', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const adminUser = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);

  // Insert a rated collector (Torreta)
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active, supervisor)
    VALUES ('COL-TORRETA', 'Juan', 'Torreta', ?, 1, 'Supervisor Cruz')
  `, [branch.id]);

  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES ('CUST-45', 'Client', 'Sample', 'Client Sample', ?, ?)
  `, [branch.id, collector.lastID]);

  // Insert loan and payments (2026-07-06 is Monday)
  const loan = await dbRun(`
    INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, balance, date_released, status, created_by)
    VALUES ('LN-45-1', ?, ?, ?, 'New', 10000, 10000, '2026-07-06', 'active', ?)
  `, [customer.lastID, collector.lastID, branch.id, adminUser.id]);

  await dbRun(`
    INSERT INTO tblPayment (
      loan_id, customer_id, collector_id, or_number, date_paid, amount_paid,
      balance_before, balance_after, status
    ) VALUES (?, ?, ?, 'OR-45-1', '2026-07-10', 12000, 10000, 0, 'active')
  `, [loan.lastID, customer.lastID, collector.lastID]);

  // Query calculate endpoint
  const response = await api('/forty-five-day-rating/calculate?start_date=2026-07-01&end_date=2026-08-15');
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(data.period.start_date, '2026-07-01');
  assert.equal(data.period.end_date, '2026-08-15');
  assert.ok(Array.isArray(data.evaluations));
  assert.ok(data.evaluations.length > 0);

  const torretaEval = data.evaluations.find(e => e.collector_name.includes('Torreta'));
  assert.ok(torretaEval);
  assert.equal(torretaEval.collection_total, 12000);
  assert.equal(torretaEval.release_total, 10000);
  assert.equal(torretaEval.accomplishment_percentage, 120);
  assert.equal(torretaEval.rating, 'Outstanding Performance');

  assert.ok(Array.isArray(data.supervisor_evaluations));
  assert.ok(Array.isArray(data.branch_manager_evaluations));
  assert.ok(data.operations_manager_evaluation);
});

test('manual expenses stay within the selected period and do not change the 45-day grade', async () => {
  const beforeResponse = await api('/forty-five-day-rating/calculate?start_date=2026-07-01&end_date=2026-08-15');
  const before = await beforeResponse.json();
  const beforeTorreta = before.evaluations.find(e => e.collector_name.includes('Torreta'));

  const createResponse = await api('/forty-five-day-rating/manual-expenses', {
    method: 'POST',
    body: JSON.stringify({
      start_date: '2026-07-01',
      end_date: '2026-08-15',
      expense_date: '2026-07-20',
      category: 'Office Expenses — Office Supplies',
      description: 'Manual office purchase',
      amount: 1250.5,
    }),
  });
  assert.equal(createResponse.status, 201);

  const listResponse = await api('/forty-five-day-rating/manual-expenses?start_date=2026-07-01&end_date=2026-08-15');
  const list = await listResponse.json();
  assert.equal(list.total, 1250.5);
  assert.equal(list.expenses.length, 1);
  assert.equal(list.expenses[0].description, 'Manual office purchase');

  const afterResponse = await api('/forty-five-day-rating/calculate?start_date=2026-07-01&end_date=2026-08-15');
  const after = await afterResponse.json();
  const afterTorreta = after.evaluations.find(e => e.collector_name.includes('Torreta'));
  assert.equal(afterTorreta.expense_total, beforeTorreta.expense_total);
  assert.equal(afterTorreta.accomplishment_percentage, beforeTorreta.accomplishment_percentage);

  const outsidePeriodResponse = await api('/forty-five-day-rating/manual-expenses', {
    method: 'POST',
    body: JSON.stringify({
      start_date: '2026-07-01', end_date: '2026-08-15', expense_date: '2026-08-16',
      category: 'Office Expenses — Office Supplies', amount: 100,
    }),
  });
  assert.equal(outsidePeriodResponse.status, 400);
});
