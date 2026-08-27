const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const dayjs = require('dayjs');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-monitoring-ptp-')), 'test.sqlite');
process.env.JWT_SECRET = 'monitoring-ptp-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, initializeDatabase, dbGet, dbRun } = require('../../src/db/database');

let server;
let baseUrl;
let token;
let fixture;

async function api(path, options = {}) {
  return fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

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

  const suffix = Date.now();
  const branch = await dbRun(
    `INSERT INTO tblBranch (branch_code, branch_name) VALUES (?, ?)`,
    [`PTP-BR-${suffix}`, 'PTP Integration Branch']
  );
  const collector = await dbRun(
    `INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id) VALUES (?, 'Mara', 'Collector', ?)`,
    [`PTP-COL-${suffix}`, branch.lastID]
  );
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, branch_id, collector_id, status)
    VALUES (?, 'PTP', 'Client', ?, ?, 'active')
  `, [`PTP-CUST-${suffix}`, branch.lastID, collector.lastID]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal,
      date_released, date_maturity, amortization, balance, status
    ) VALUES (?, ?, ?, ?, 'regular', 5000, ?, ?, 250, 4500, 'active')
  `, [
    `PTP-LOAN-${suffix}`,
    customer.lastID,
    collector.lastID,
    branch.lastID,
    dayjs().subtract(10, 'day').format('YYYY-MM-DD'),
    dayjs().add(30, 'day').format('YYYY-MM-DD')
  ]);
  const alert = await dbRun(`
    INSERT INTO tblMonitoringAlert (
      customer_id, loan_id, branch_id, collector_id, first_missed_date,
      latest_missed_date, consecutive_days, total_missed_days, alert_level, status
    ) VALUES (?, ?, ?, ?, ?, ?, 3, 3, 'Day 3', 'Active')
  `, [
    customer.lastID,
    loan.lastID,
    branch.lastID,
    collector.lastID,
    dayjs().subtract(3, 'day').format('YYYY-MM-DD'),
    dayjs().subtract(1, 'day').format('YYYY-MM-DD')
  ]);

  fixture = {
    branchId: branch.lastID,
    collectorId: collector.lastID,
    customerId: customer.lastID,
    loanId: loan.lastID,
    alertId: alert.lastID,
  };
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await closeDb();
});

test('PTP logged from 3-Day Monitoring is assigned and enters PTP Update on its due date', async () => {
  const dueDate = dayjs().format('YYYY-MM-DD');
  const createResponse = await api('/monitoring/ptp', {
    method: 'POST',
    body: JSON.stringify({
      alert_id: fixture.alertId,
      customer_id: fixture.customerId,
      promise_date: dueDate,
      promised_amount: 236,
      payment_method: 'Cash at Branch',
      reason: 'Financial Hardship',
      remarks: 'Created from 3-Day Monitoring',
    }),
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201, created.error);

  const stored = await dbGet(`SELECT * FROM tblPromiseToPay WHERE id = ?`, [created.data.id]);
  assert.equal(stored.alert_id, fixture.alertId);
  assert.equal(stored.customer_id, fixture.customerId);
  assert.equal(stored.loan_id, fixture.loanId);
  assert.equal(stored.collector_id, fixture.collectorId);
  assert.equal(stored.branch_id, fixture.branchId);
  assert.equal(stored.promise_date, dueDate);
  assert.equal(stored.status, 'Due Today');

  const monitoringResponse = await api(`/ptp/monitoring?collector_id=${fixture.collectorId}`);
  const monitoring = await monitoringResponse.json();
  assert.equal(monitoringResponse.status, 200, monitoring.error);
  assert.ok(monitoring.records.some(record => record.id === created.data.id));

  const dueResponse = await api(`/ptp/due-updates?due_filter=due_today&collector_id=${fixture.collectorId}`);
  const due = await dueResponse.json();
  assert.equal(dueResponse.status, 200, due.error);
  assert.ok(due.records.some(record => record.id === created.data.id));
});
