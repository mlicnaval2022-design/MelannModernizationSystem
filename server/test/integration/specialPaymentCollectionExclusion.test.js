const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-special-payment-')), 'test.sqlite');
process.env.JWT_SECRET = 'special-payment-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;
let token;

test.before(async () => {
  await initializeDatabase();
  const app = createApp();
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
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

const createLoan = async ({ suffix, collectorId, branchId, userId }) => {
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `, [`C-SPECIAL-${suffix}`, suffix, 'Client', `${suffix} Client`, branchId, collectorId]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, status, created_by
    ) VALUES (?, ?, ?, ?, 'New', 1000, 0, 45, '2026-07-20', '2026-09-03', 26, 1000, 1000, 1000, 'active', ?)
  `, [`LN-SPECIAL-${suffix}`, customer.lastID, collectorId, branchId, userId]);
  return { customerId: customer.lastID, loanId: loan.lastID };
};

const postPayment = (loanId, collectorId, flags) => fetch(`${baseUrl}/api/payments`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    loan_id: loanId,
    collector_id: collectorId,
    or_number: 'N/A',
    date_paid: '2026-07-20',
    amount_paid: 1000,
    ...flags,
  }),
});

test('Deceased and Write-off settle balances but stay out of Collection Reports', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES ('COL-SPECIAL', 'Special', 'Collector', ?)
  `, [branch.id]);

  const deceasedLoan = await createLoan({ suffix: 'DECEASED', collectorId: collector.lastID, branchId: branch.id, userId: user.id });
  const writeoffLoan = await createLoan({ suffix: 'WRITEOFF', collectorId: collector.lastID, branchId: branch.id, userId: user.id });

  const deceasedResponse = await postPayment(deceasedLoan.loanId, collector.lastID, { is_deceased: true });
  const deceasedBody = await deceasedResponse.json();
  const writeoffResponse = await postPayment(writeoffLoan.loanId, collector.lastID, { is_write_off: true });
  const writeoffBody = await writeoffResponse.json();

  assert.equal(deceasedResponse.status, 201, deceasedBody.error);
  assert.equal(deceasedBody.special_payment_type, 'deceased');
  assert.equal(deceasedBody.balance_after, 0);
  assert.equal(writeoffResponse.status, 201, writeoffBody.error);
  assert.equal(writeoffBody.special_payment_type, 'writeoff');
  assert.equal(writeoffBody.balance_after, 0);

  const storedDeceased = await dbGet(`SELECT status, payment_type, remarks FROM tblPayment WHERE id = ?`, [deceasedBody.id]);
  const storedWriteoff = await dbGet(`SELECT status, payment_type, remarks FROM tblPayment WHERE id = ?`, [writeoffBody.id]);
  assert.deepEqual(
    { status: storedDeceased.status, payment_type: storedDeceased.payment_type },
    { status: 'deceased', payment_type: 'deceased' }
  );
  assert.match(storedDeceased.remarks, /^\[DECEASED\]/);
  assert.deepEqual(
    { status: storedWriteoff.status, payment_type: storedWriteoff.payment_type },
    { status: 'writeoff', payment_type: 'writeoff' }
  );
  assert.match(storedWriteoff.remarks, /^\[WRITE-OFF\]/);

  const reportResponse = await fetch(`${baseUrl}/api/reports/daily-collection?date_from=2026-07-20&date_to=2026-07-20`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const report = await reportResponse.json();
  assert.equal(reportResponse.status, 200, report.error);
  assert.equal(report.total, 0);
  assert.equal(report.payments.length, 0);

  const sheetResponse = await fetch(`${baseUrl}/api/reports/collection-sheet?collector_id=${collector.lastID}&date=2026-07-20`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const sheet = await sheetResponse.json();
  assert.equal(sheetResponse.status, 200, sheet.error);
  assert.equal(sheet.summary.totalCollection, 0);

  const dcrResponse = await fetch(`${baseUrl}/api/dcr/summary?date=2026-07-20`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const dcr = await dcrResponse.json();
  assert.equal(dcrResponse.status, 200, dcr.error);
  assert.equal(dcr.total_collections, 0);
  assert.equal(dcr.collections.length, 0);

  const specialAccountsResponse = await fetch(`${baseUrl}/api/reports/special-accounts?date_from=2026-07-20&date_to=2026-07-20`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const specialAccounts = await specialAccountsResponse.json();
  assert.equal(specialAccountsResponse.status, 200, specialAccounts.error);
  assert.equal(specialAccounts.deceased.length, 1);
  assert.equal(specialAccounts.deceased[0].customer_code, 'C-SPECIAL-DECEASED');
  assert.equal(specialAccounts.deceased[0].classification, 'deceased');
  assert.equal(specialAccounts.deceased[0].principal, 1000);
  assert.equal(specialAccounts.deceased[0].total_amortization, 1000);
  assert.equal(specialAccounts.written_off.length, 1);
  assert.equal(specialAccounts.written_off[0].customer_code, 'C-SPECIAL-WRITEOFF');
  assert.equal(specialAccounts.written_off[0].classification, 'writeoff');
  assert.equal(specialAccounts.written_off[0].principal, 1000);
  assert.equal(specialAccounts.written_off[0].total_amortization, 1000);
  assert.deepEqual(specialAccounts.summary, {
    deceased_count: 1,
    deceased_amount: 1000,
    written_off_count: 1,
    written_off_amount: 1000,
    total_accounts: 2,
    total_amount: 2000,
  });
});

test('posting rejects multiple special classifications', async () => {
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbGet(`SELECT id FROM tblCollector WHERE collector_code = 'COL-SPECIAL'`);
  const loan = await createLoan({ suffix: 'INVALID', collectorId: collector.id, branchId: branch.id, userId: user.id });

  const response = await postPayment(loan.loanId, collector.id, { is_deceased: true, is_write_off: true });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(body.error, /Select only one/);
  assert.equal((await dbGet(`SELECT COUNT(*) AS count FROM tblPayment WHERE loan_id = ?`, [loan.loanId])).count, 0);
});
