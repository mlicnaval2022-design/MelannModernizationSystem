const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-current-collector-')), 'test.sqlite');
process.env.JWT_SECRET = 'current-collector-test-secret';

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

test('collection report assigns historical payments to the current collector', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const oldCollector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES ('COL-OLD', 'Old', 'Collector', ?, 0)
  `, [branch.id]);
  const currentCollector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES ('COL-CURRENT', 'Current', 'Collector', ?, 1)
  `, [branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES ('C-CURRENT-COL', 'Collector', 'Client', 'Collector Client', ?, ?)
  `, [branch.id, oldCollector.lastID]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal,
      loan_period, date_released, balance, passbook, status
    ) VALUES ('L-CURRENT-COL', ?, ?, ?, 'regular', 1000, 1, '2026-08-14', 900, 25, 'active')
  `, [customer.lastID, oldCollector.lastID, branch.id]);
  await dbRun(`
    INSERT INTO tblPayment (
      loan_id, customer_id, collector_id, or_number, date_paid, amount_paid,
      balance_before, balance_after, status
    ) VALUES (?, ?, ?, 'OR-CURRENT-COL', '2026-08-14', 100, 1000, 900, 'active')
  `, [loan.lastID, customer.lastID, oldCollector.lastID]);

  const assignment = await api('/collectors/assign-loan', {
    method: 'POST',
    body: JSON.stringify({ loan_id: loan.lastID, new_collector_id: currentCollector.lastID }),
  });
  assert.equal(assignment.status, 200);

  const response = await api('/reports/daily-collection?date_from=2026-08-14&date_to=2026-08-14');
  assert.equal(response.status, 200);
  const report = await response.json();

  assert.equal(report.payments.length, 2);
  assert.ok(report.payments.every(row => row.collector_name === 'Current Collector'));
  assert.equal(report.total, 125);
});
