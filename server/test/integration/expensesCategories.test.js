const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-expenses-')), 'test.sqlite');
process.env.JWT_SECRET = 'expenses-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, initializeDatabase } = require('../../src/db/database');

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
