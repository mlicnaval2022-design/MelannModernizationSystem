const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-status-consistency-')), 'test.sqlite');
process.env.JWT_SECRET = 'customer-status-consistency-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbAll, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;
let token;

test.before(async () => {
  await initializeDatabase();
  const app = createApp();
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  ({ token } = await loginResponse.json());
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await closeDb();
});

test('repairs customer 3700 from RELAX to active when an outstanding balance exists', async () => {
  const branch = await dbGet('SELECT id FROM tblBranch LIMIT 1');
  const customer = await dbRun(`
    INSERT INTO tblCustomer
      (customer_code, first_name, last_name, full_name, branch_id, status)
    VALUES ('3700', 'JESSICA TORRES', 'RETURBAR', 'RETURBAR, JESSICA TORRES', ?, 'RELAX')
  `, [branch.id]);
  await dbRun(`
    INSERT INTO tblLoan
      (loan_code, customer_id, branch_id, loan_type, principal, interest_amount,
       loan_period, date_released, date_maturity, total_amortization, balance, status)
    VALUES ('36348', ?, ?, 'Reloan', 3000, 450, 45, '2026-07-27', '2026-09-11', 3450, 1610, 'active')
  `, [customer.lastID, branch.id]);

  await initializeDatabase();

  const repaired = await dbGet('SELECT status FROM tblCustomer WHERE id = ?', [customer.lastID]);
  const history = await dbAll(`
    SELECT previous_status, new_status, remarks
    FROM tblCustomerStatusHistory
    WHERE customer_id = ?
  `, [customer.lastID]);

  assert.equal(repaired.status, 'active');
  assert.deepEqual(history, [{
    previous_status: 'RELAX',
    new_status: 'active',
    remarks: 'Auto-repair: Outstanding loan balance requires Active status',
  }]);
});

test('an outstanding loan is not listed as fully paid and has no fully-paid date', async () => {
  const customer = await dbGet("SELECT id FROM tblCustomer WHERE customer_code = '3700'");
  const loan = await dbGet("SELECT id FROM tblLoan WHERE loan_code = '36348'");
  await dbRun(`
    INSERT INTO tblPayment
      (loan_id, customer_id, or_number, date_paid, amount_paid, balance_before, balance_after, status)
    VALUES (?, ?, 'OR-STATUS-TEST', '2026-08-25', 100, 1710, 1610, 'active')
  `, [loan.id, customer.id]);

  const authHeaders = { authorization: `Bearer ${token}` };
  const fullyPaidResponse = await fetch(`${baseUrl}/api/customers/list/fully-paid`, { headers: authHeaders });
  const fullyPaid = await fullyPaidResponse.json();
  const loansResponse = await fetch(`${baseUrl}/api/loans?customer_id=${customer.id}`, { headers: authHeaders });
  const loans = await loansResponse.json();

  assert.equal(fullyPaidResponse.status, 200, fullyPaid.error);
  assert.equal(fullyPaid.some(row => row.id === customer.id), false);
  assert.equal(loansResponse.status, 200, loans.error);
  assert.equal(loans[0].balance, 1610);
  assert.equal(loans[0].date_fully_paid, null);
});

test('cannot set a customer with an outstanding balance to RELAX', async () => {
  const customer = await dbGet("SELECT id FROM tblCustomer WHERE customer_code = '3700'");
  const response = await fetch(`${baseUrl}/api/customers/${customer.id}/status`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: 'RELAX', remarks: 'Should be rejected' }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /outstanding balance of ₱1,610\.00/);
  const saved = await dbGet('SELECT status FROM tblCustomer WHERE id = ?', [customer.id]);
  assert.equal(saved.status, 'active');
});
