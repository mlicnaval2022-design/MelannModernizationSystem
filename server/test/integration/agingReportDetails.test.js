const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const dayjs = require('dayjs');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-aging-details-')), 'test.sqlite');
process.env.JWT_SECRET = 'aging-details-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, initializeDatabase, dbRun } = require('../../src/db/database');

let server;
let baseUrl;
let token;

test.before(async () => {
  await initializeDatabase();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const login = await loginResponse.json();
  assert.equal(loginResponse.status, 200, login.error);
  token = login.token;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await closeDb();
});

test('aging report returns complete drill-down fields and keeps same-name collectors separate', async () => {
  const suffix = Date.now();
  const branch = await dbRun(`INSERT INTO tblBranch (branch_code, branch_name) VALUES (?, 'Aging Detail Branch')`, [`AGE-BR-${suffix}`]);
  const collectorA = await dbRun(`INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id) VALUES (?, 'Same', 'Name', ?)`, [`AGE-A-${suffix}`, branch.lastID]);
  const collectorB = await dbRun(`INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id) VALUES (?, 'Same', 'Name', ?)`, [`AGE-B-${suffix}`, branch.lastID]);

  const createLoan = async (collectorId, clientSuffix, daysOverdue) => {
    const customer = await dbRun(`
      INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, contact, address, branch_id, collector_id, status)
      VALUES (?, 'Detail', ?, ?, '09170000000', 'Test Address', ?, ?, 'active')
    `, [`AGE-C-${clientSuffix}-${suffix}`, clientSuffix, `Detail ${clientSuffix}`, branch.lastID, collectorId]);
    return dbRun(`
      INSERT INTO tblLoan (
        loan_code, customer_id, collector_id, branch_id, loan_type, principal,
        interest_amount, date_released, date_maturity, amortization, balance, status
      ) VALUES (?, ?, ?, ?, 'regular', 1000, 100, ?, ?, 100, 700, 'active')
    `, [
      `AGE-L-${clientSuffix}-${suffix}`,
      customer.lastID,
      collectorId,
      branch.lastID,
      dayjs().subtract(daysOverdue + 30, 'day').format('YYYY-MM-DD'),
      dayjs().subtract(daysOverdue, 'day').format('YYYY-MM-DD'),
    ]);
  };

  await createLoan(collectorA.lastID, 'A', 20);
  await createLoan(collectorB.lastID, 'B', 20);

  const asOf = dayjs().format('YYYY-MM-DD');
  const response = await fetch(`${baseUrl}/api/reports/aging-report?date_to=${asOf}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const report = await response.json();
  assert.equal(response.status, 200, report.error);

  const matchingGroups = report.collectors.filter(group => group.collector === 'Same Name');
  assert.equal(matchingGroups.length, 2);
  assert.deepEqual(new Set(matchingGroups.map(group => group.collector_id)), new Set([collectorA.lastID, collectorB.lastID]));

  const loan = report.loans.find(item => item.collector_id === collectorA.lastID);
  assert.equal(loan.customer_name, 'Detail A');
  assert.equal(loan.contact, '09170000000');
  assert.equal(loan.address, 'Test Address');
  assert.equal(loan.loan_type, 'regular');
  assert.equal(loan.amortization, 100);
  assert.equal(loan.aging_days, 20);
});
