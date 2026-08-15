const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-expenses-')), 'test.sqlite');
process.env.JWT_SECRET = 'expenses-test-secret';

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

test('configured expense categories populate and constrain expense entries', async () => {
  const personnelResponse = await api('/reports/expenses/personnel', {
    method: 'POST',
    body: JSON.stringify({ employee_name: 'Test Employee', position: 'Clerk', status: 'active' }),
  });
  assert.equal(personnelResponse.status, 201);
  const personnel = await personnelResponse.json();

  const categoryResponse = await api('/reports/expenses/categories', {
    method: 'POST',
    body: JSON.stringify({ category_name: 'Fuel', status: 'active' }),
  });
  assert.equal(categoryResponse.status, 201);
  const category = await categoryResponse.json();

  const categoriesResponse = await api('/reports/expenses/categories');
  assert.equal(categoriesResponse.status, 200);
  const categories = await categoriesResponse.json();
  assert.deepEqual(categories.map((item) => item.category_name), ['Fuel']);

  const duplicateResponse = await api('/reports/expenses/categories', {
    method: 'POST',
    body: JSON.stringify({ category_name: 'fuel', status: 'active' }),
  });
  assert.equal(duplicateResponse.status, 409);

  const expenseResponse = await api('/reports/expenses/entries', {
    method: 'POST',
    body: JSON.stringify({
      personnel_id: personnel.id,
      expense_date: '2026-08-14',
      category: 'Fuel',
      amount: 150,
    }),
  });
  assert.equal(expenseResponse.status, 201);

  const renamedResponse = await api(`/reports/expenses/categories/${category.id}`, {
    method: 'PUT',
    body: JSON.stringify({ category_name: 'Transportation', status: 'inactive' }),
  });
  assert.equal(renamedResponse.status, 200);

  const entriesResponse = await api('/reports/expenses/entries');
  const entries = await entriesResponse.json();
  assert.equal(entries[0].category, 'Transportation');

  const inactiveCategoryResponse = await api('/reports/expenses/entries', {
    method: 'POST',
    body: JSON.stringify({
      personnel_id: personnel.id,
      expense_date: '2026-08-14',
      category: 'Transportation',
      amount: 50,
    }),
  });
  assert.equal(inactiveCategoryResponse.status, 400);
  assert.match((await inactiveCategoryResponse.json()).error, /active expense category/);
});

test('expense summary calculates date-range net income for configured collectors only', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES (?, ?, ?, ?, 1)
  `, ['COL-NET-1', 'Aldie', 'Rosal', branch.id]);
  const pastDueCollector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES (?, ?, ?, ?, 1)
  `, ['COL-NET-2', 'Aldie Rosal', 'Pastdue', branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, ['C-NET-1', 'Net', 'Income', 'Net Income', branch.id, collector.lastID]);

  const insertLoan = (code, collectorId, date, principal) => dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal,
      loan_period, date_released, balance, status
    ) VALUES (?, ?, ?, ?, 'regular', ?, 1, ?, ?, 'active')
  `, [code, customer.lastID, collectorId, branch.id, principal, date, principal]);
  const regularLoan = await insertLoan('L-NET-1', collector.lastID, '2026-08-14', 400);
  const pastDueLoan = await insertLoan('L-NET-2', pastDueCollector.lastID, '2026-08-14', 100);
  const outsideLoan = await insertLoan('L-NET-3', collector.lastID, '2026-08-10', 999);
  await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal,
      loan_period, date_released, balance, status
    ) VALUES ('L-NET-RECON', ?, ?, ?, 'Recon', 300, 1, '2026-08-14', 300, 'active')
  `, [customer.lastID, collector.lastID, branch.id]);

  const insertPayment = (loanId, collectorId, date, amount, orNumber) => dbRun(`
    INSERT INTO tblPayment (
      loan_id, customer_id, collector_id, or_number, date_paid, amount_paid,
      balance_before, balance_after, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active')
  `, [loanId, customer.lastID, collectorId, orNumber, date, amount, amount]);
  await insertPayment(regularLoan.lastID, collector.lastID, '2026-08-14', 1000, 'OR-NET-1');
  await insertPayment(pastDueLoan.lastID, pastDueCollector.lastID, '2026-08-14', 200, 'OR-NET-2');
  await insertPayment(outsideLoan.lastID, collector.lastID, '2026-08-10', 888, 'OR-NET-3');

  const personnelResponse = await api('/reports/expenses/personnel', {
    method: 'POST',
    body: JSON.stringify({ employee_name: 'Aldie E. Rosal', position: 'Collector', status: 'active' }),
  });
  const personnel = await personnelResponse.json();
  await api('/reports/expenses/personnel', {
    method: 'POST',
    body: JSON.stringify({ employee_name: 'Net Income Cashier', position: 'Cashier', status: 'active' }),
  });
  await dbRun(`
    INSERT INTO tblEmployeeExpense (personnel_id, expense_date, category, amount, status)
    VALUES (?, '2026-08-14', 'Fuel', 100, 'active'),
           (?, '2026-08-10', 'Fuel', 777, 'active')
  `, [personnel.id, personnel.id]);

  const response = await api('/reports/expenses/summary?date_from=2026-08-14&date_to=2026-08-14');
  assert.equal(response.status, 200);
  const summary = await response.json();

  assert.deepEqual(summary.net_income_by_collector.map(row => row.employee_name), ['Aldie E. Rosal']);
  assert.equal(summary.net_income_by_collector[0].collection_amount, 1200);
  assert.equal(summary.net_income_by_collector[0].release_amount, 500);
  assert.equal(summary.net_income_by_collector[0].expense_amount, 100);
  assert.equal(summary.net_income_by_collector[0].net_income, 600);
});
