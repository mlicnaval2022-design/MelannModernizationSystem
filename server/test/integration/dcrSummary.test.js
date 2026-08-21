const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-dcr-summary-')), 'test.sqlite');
process.env.JWT_SECRET = 'dcr-summary-test-secret';

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

test('DCR summary classifies active and penalty payments without crashing', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES ('COL-DCR', 'DCR', 'Collector', ?)
  `, [branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES ('C-DCR', 'DCR', 'Client', 'DCR Client', ?, ?)
  `, [branch.id, collector.lastID]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, principal, loan_period, date_released, balance, status)
    VALUES ('LN-DCR', ?, ?, ?, 1000, 30, '2026-08-20', 850, 'active')
  `, [customer.lastID, collector.lastID, branch.id]);

  await dbRun(`
    INSERT INTO tblPayment (loan_id, customer_id, collector_id, or_number, date_paid, amount_paid, balance_before, balance_after, payment_type, status)
    VALUES (?, ?, ?, 'OR-DCR-1', '2026-08-21', 100, 1000, 900, 'regular', 'active')
  `, [loan.lastID, customer.lastID, collector.lastID]);
  await dbRun(`
    INSERT INTO tblPayment (loan_id, customer_id, collector_id, or_number, date_paid, amount_paid, balance_before, balance_after, payment_type, status)
    VALUES (?, ?, ?, 'OR-DCR-2', '2026-08-21', 50, 900, 850, 'penalty', 'penalty')
  `, [loan.lastID, customer.lastID, collector.lastID]);

  const response = await fetch(`${baseUrl}/api/dcr/summary?date=2026-08-21`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json();

  assert.equal(response.status, 200, body.error);
  assert.equal(body.collection_breakdown.regular, 100);
  assert.equal(body.collection_breakdown.penalty, 50);
  assert.equal(body.total_collections, 150);
});
