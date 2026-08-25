const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-expenses-matrix-')), 'test.sqlite');
process.env.JWT_SECRET = 'expenses-matrix-secret';

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
  await new Promise((resolve) => {
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
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  await closeDb();
});

test('collector-matrix returns daily collections, non-recon releases, dynamic categories, and calculated net per collector', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);

  // Create collectors
  const collector1 = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES ('COL-M1', 'Aldie', 'Rosal', ?, 1)
  `, [branch.id]);

  // Create customers
  const customer1 = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES ('C-M1', 'Juan', 'Dela Cruz', 'Juan Dela Cruz', ?, ?)
  `, [branch.id, collector1.lastID]);

  // Loans: New/Reloan vs Recon
  await dbRun(`
    INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, loan_period, date_released, balance, status)
    VALUES ('L-M1', ?, ?, ?, 'New', 50000, 1, '2026-04-01', 50000, 'active')
  `, [customer1.lastID, collector1.lastID, branch.id]);

  await dbRun(`
    INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, loan_period, date_released, balance, status)
    VALUES ('L-RECON', ?, ?, ?, 'Recon', 20000, 1, '2026-04-01', 20000, 'active')
  `, [customer1.lastID, collector1.lastID, branch.id]);

  // Payment on 2026-04-01
  await dbRun(`
    INSERT INTO tblPayment (loan_id, customer_id, collector_id, or_number, date_paid, amount_paid, balance_before, balance_after, status)
    VALUES (1, ?, ?, 'OR-M1', '2026-04-01', 19000, 19000, 0, 'active')
  `, [customer1.lastID, collector1.lastID]);

  // Configure personnel and categories
  const pRes = await api('/reports/expenses/personnel', {
    method: 'POST',
    body: JSON.stringify({ employee_name: 'Aldie Rosal', position: 'Collector', status: 'active' }),
  });
  const person = await pRes.json();

  await api('/reports/expenses/categories', {
    method: 'POST',
    body: JSON.stringify({ category_name: 'GASOLINE', status: 'active' }),
  });
  await api('/reports/expenses/categories', {
    method: 'POST',
    body: JSON.stringify({ category_name: 'MEALS', status: 'active' }),
  });

  // Cell update for expenses
  const cell1 = await api('/reports/expenses/cell-update', {
    method: 'POST',
    body: JSON.stringify({
      personnel_id: person.id,
      expense_date: '2026-04-01',
      category: 'GASOLINE',
      amount: 250,
    }),
  });
  assert.equal(cell1.status, 201);

  const cell2 = await api('/reports/expenses/cell-update', {
    method: 'POST',
    body: JSON.stringify({
      personnel_id: person.id,
      expense_date: '2026-04-01',
      category: 'MEALS',
      amount: 50,
    }),
  });
  assert.equal(cell2.status, 201);

  // Fetch matrix for 2026-04-01 to 2026-04-02
  const matrixRes = await api('/reports/expenses/collector-matrix?date_from=2026-04-01&date_to=2026-04-02');
  assert.equal(matrixRes.status, 200);
  const data = await matrixRes.json();

  assert.equal(data.sheets.length, 1);
  const sheet = data.sheets[0];
  assert.equal(sheet.employee_name, 'Aldie Rosal');

  const day1 = sheet.days['2026-04-01'];
  assert.equal(day1.collection, 19000);
  // Release should ONLY count 50000 (New), excluding Recon (20000)
  assert.equal(day1.release, 50000);
  assert.equal(day1.expenses['GASOLINE'].amount, 250);
  assert.equal(day1.expenses['MEALS'].amount, 50);
  assert.equal(day1.total_expense, 300);
  // Net = 19000 - 50000 - 300 = -31300
  assert.equal(day1.net, -31300);

  // Update cell to 0 to delete
  const delRes = await api('/reports/expenses/cell-update', {
    method: 'POST',
    body: JSON.stringify({
      personnel_id: person.id,
      expense_date: '2026-04-01',
      category: 'MEALS',
      amount: 0,
    }),
  });
  assert.equal(delRes.status, 200);

  const matrixRes2 = await api('/reports/expenses/collector-matrix?date_from=2026-04-01&date_to=2026-04-02');
  const data2 = await matrixRes2.json();
  const day1Updated = data2.sheets[0].days['2026-04-01'];
  assert.equal(day1Updated.expenses['MEALS'].amount, 0);
  assert.equal(day1Updated.total_expense, 250);
  assert.equal(day1Updated.net, -31250);
});
