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

  // A collector with any name must be included; the 45-day report is not
  // restricted to a hard-coded list of surnames.
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active, supervisor)
    VALUES ('COL-TORRETA', 'Juan', 'Torreta', ?, 1, 'Supervisor Cruz')
  `, [branch.id]);

  const additionalCollector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES ('COL-ANY', 'Maria', 'Santos', ?, 1)
  `, [branch.id]);

  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES ('CUST-45', 'Client', 'Sample', 'Client Sample', ?, ?)
  `, [branch.id, collector.lastID]);

  // Insert loan and payments (2026-07-06 is Monday)
  const loan = await dbRun(`
    INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, balance, previous_balance, penalty, date_released, status, created_by)
    VALUES ('LN-45-1', ?, ?, ?, 'New', 10000, 10000, 100, 25, '2026-07-06', 'active', ?)
  `, [customer.lastID, collector.lastID, branch.id, adminUser.id]);

  await dbRun(`
    INSERT INTO tblPayment (
      loan_id, customer_id, collector_id, or_number, date_paid, amount_paid,
      balance_before, balance_after, status
    ) VALUES (?, ?, ?, 'OR-45-1', '2026-07-10', 12000, 10000, 0, 'active')
  `, [loan.lastID, customer.lastID, collector.lastID]);

  // A recon payment that fully pays an account must not raise the collector's 45-day collection.
  await dbRun(`
    INSERT INTO tblPayment (
      loan_id, customer_id, collector_id, or_number, date_paid, amount_paid,
      balance_before, balance_after, payment_type, status
    ) VALUES (?, ?, ?, 'OR-45-RECON', '2026-07-11', 2500, 2500, 0, 'recon', 'active')
    `, [loan.lastID, customer.lastID, collector.lastID]);

  const officeCollector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES ('MELANN-OFFICE', 'Melann', 'Office', ?, 1)
  `, [branch.id]);
  const officeCustomer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES ('CUST-45-OFFICE', 'Office', 'Client', 'Office Client', ?, ?)
  `, [branch.id, officeCollector.lastID]);
  const officeLoan = await dbRun(`
    INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, balance, date_released, date_maturity, status, created_by)
    VALUES ('LN-45-OFFICE', ?, ?, ?, 'New', 3000, 900, '2026-07-07', '2026-06-20', 'active', ?)
  `, [officeCustomer.lastID, officeCollector.lastID, branch.id, adminUser.id]);
  await dbRun(`
    INSERT INTO tblPayment (loan_id, customer_id, collector_id, or_number, date_paid, amount_paid, balance_before, balance_after, status)
    VALUES (?, ?, ?, 'OR-45-OFFICE', '2026-07-10', 4000, 3000, 0, 'active')
  `, [officeLoan.lastID, officeCustomer.lastID, officeCollector.lastID]);

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
  assert.equal(torretaEval.collection_total, 12125);
  assert.equal(torretaEval.release_total, 10000);
  assert.ok(Math.abs(torretaEval.accomplishment_percentage - 121.25) < 0.000001);
  assert.equal(torretaEval.rating, 'Outstanding Performance');

  const additionalEval = data.evaluations.find(e => e.collector_id === additionalCollector.lastID);
  assert.ok(additionalEval);
  assert.equal(additionalEval.collector_name, 'Maria Santos');

  const collectionReportResponse = await api('/reports/daily-collection?date_from=2026-07-01&date_to=2026-08-15');
  const collectionReport = await collectionReportResponse.json();
  assert.equal(collectionReport.total, data.evaluations.reduce((sum, row) => sum + Number(row.collection_total || 0), 0));

  const officeEval = data.evaluations.find(e => e.collector_name === 'Melann Office');
  assert.ok(officeEval);
  assert.equal(officeEval.collection_total, 4000);
  assert.equal(officeEval.release_total, 3000);
  assert.equal(officeEval.reported_pastdue, 900);
  assert.equal(officeEval.expense_total, 0);

  assert.ok(Array.isArray(data.supervisor_evaluations));
  assert.ok(Array.isArray(data.branch_manager_evaluations));
  assert.ok(data.operations_manager_evaluation);
});

test('manual expenses are divided among collectors and only accepted inside the selected period', async () => {
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
  assert.equal(beforeTorreta.expense_total, 0);
  // The office expense is shared by every active collector, except Melann Office.
  assert.equal(afterTorreta.expense_total, 625.25);
  assert.notEqual(afterTorreta.accomplishment_percentage, beforeTorreta.accomplishment_percentage);

  const outsidePeriodResponse = await api('/forty-five-day-rating/manual-expenses', {
    method: 'POST',
    body: JSON.stringify({
      start_date: '2026-07-01', end_date: '2026-08-15', expense_date: '2026-08-16',
      category: 'Office Expenses — Office Supplies', amount: 100,
    }),
  });
  assert.equal(outsidePeriodResponse.status, 400);
});
