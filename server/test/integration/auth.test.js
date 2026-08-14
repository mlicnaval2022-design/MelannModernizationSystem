const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-integration-')), 'test.sqlite');
process.env.JWT_SECRET = 'integration-test-secret';

const { createApp } = require('../../src/app');
const { closeDb, dbAll, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;

test.before(async () => {
  await initializeDatabase();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  await closeDb();
});

test('health endpoint reports ready API', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.system, 'Melann Lending System V2');
});

test('login rejects bad credentials and accepts seeded admin', async () => {
  const badResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });
  assert.equal(badResponse.status, 401);

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.user.username, 'admin');
  assert.equal(body.user.role, 'admin');
  assert.match(body.token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
});

test('penalty edit is blocked after the loan or payment is closed in DCR', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id)
    VALUES (?, ?, ?, ?, ?)
  `, ['C-DCR-LOCK', 'Dcr', 'Locked', 'Dcr Locked', branch.id]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, penalty, status, created_by, dcr_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-DCR-LOCK', customer.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-20', '2026-09-03', 26, 1000, 1000, 1000, 25, 'active', user.id, 99]);
  const payment = await dbRun(`
    INSERT INTO tblPayment (
      loan_id, customer_id, or_number, date_paid, amount_paid,
      balance_before, balance_after, payment_type, status, encoded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [loan.lastID, customer.lastID, 'PEN-DCR-LOCK', '2026-07-20', 25, 1000, 975, 'penalty', 'penalty', user.id]);

  const response = await fetch(`${baseUrl}/api/payments/${payment.lastID}/penalty-amount`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount_paid: 50 }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Daily Cash Report/);
});

test('posting a regular payment creates payment and updates loan balance', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES (?, ?, ?, ?)
  `, ['COL-PAYMENT', 'Pay', 'Collector', branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, ['C-PAYMENT', 'Payment', 'Client', 'Payment Client', branch.id, collector.lastID]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-PAYMENT', customer.lastID, collector.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-20', '2026-09-03', 26, 1000, 1000, 1000, 'active', user.id]);

  const response = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      loan_id: loan.lastID,
      or_number: 'N/A',
      date_paid: '2026-07-20',
      amount_paid: 100,
      collector_id: collector.lastID,
      remarks: 'integration payment',
    }),
  });
  const body = await response.json();
  const updatedLoan = await dbGet(`SELECT balance, total_paid, status FROM tblLoan WHERE id = ?`, [loan.lastID]);

  assert.equal(response.status, 201, body.error);
  assert.equal(body.balance_before, 1000);
  assert.equal(body.balance_after, 900);
  assert.equal(updatedLoan.balance, 900);
  assert.equal(updatedLoan.total_paid, 100);
  assert.equal(updatedLoan.status, 'active');
});

test('posting a backdated payment recalculates later payment running balances', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES (?, ?, ?, ?)
  `, ['COL-BACKDATE', 'Back', 'Date', branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, ['C-BACKDATE', 'Backdated', 'Client', 'Backdated Client', branch.id, collector.lastID]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-BACKDATE', customer.lastID, collector.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-01', '2026-08-15', 26, 1000, 1000, 1000, 'active', user.id]);

  const laterResponse = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      loan_id: loan.lastID,
      or_number: 'LATER-PAYMENT',
      date_paid: '2026-07-15',
      amount_paid: 100,
      collector_id: collector.lastID,
    }),
  });
  assert.equal(laterResponse.status, 201, (await laterResponse.json()).error);

  const backdatedResponse = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      loan_id: loan.lastID,
      or_number: 'BACKDATED-PAYMENT',
      date_paid: '2026-07-10',
      amount_paid: 50,
      collector_id: collector.lastID,
    }),
  });
  const backdatedBody = await backdatedResponse.json();
  const payments = await dbAll(`
    SELECT or_number, date_paid, amount_paid, balance_before, balance_after
    FROM tblPayment
    WHERE loan_id = ? AND status = 'active'
    ORDER BY date_paid ASC, id ASC
  `, [loan.lastID]);
  const updatedLoan = await dbGet(`SELECT balance, total_paid FROM tblLoan WHERE id = ?`, [loan.lastID]);

  assert.equal(backdatedResponse.status, 201, backdatedBody.error);
  assert.equal(backdatedBody.balance_before, 1000);
  assert.equal(backdatedBody.balance_after, 950);
  assert.deepEqual(payments, [
    { or_number: 'BACKDATED-PAYMENT', date_paid: '2026-07-10', amount_paid: 50, balance_before: 1000, balance_after: 950 },
    { or_number: 'LATER-PAYMENT', date_paid: '2026-07-15', amount_paid: 100, balance_before: 950, balance_after: 850 },
  ]);
  assert.equal(updatedLoan.balance, 850);
  assert.equal(updatedLoan.total_paid, 150);
});

test('reloan old balance posts to prior loan on release date and not to new loan', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES (?, ?, ?, ?)
  `, ['COL-RELOAN', 'Re', 'Loan', branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['C-RELOAN', 'Old', 'Balance', 'Old Balance', branch.id, collector.lastID, 'active']);
  const sourceLoan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, total_paid, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-RELOAN-OLD', customer.lastID, collector.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-01', '2026-08-15', 25, 1000, 1000, 500, 500, 'active', user.id]);

  const response = await fetch(`${baseUrl}/api/customers/${customer.lastID}/reloan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      principal: 2000,
      loan_period: 45,
      interest_rate: 10,
      date_released: '2026-07-21',
      loan_type: 'Reloan',
      source_loan_id: sourceLoan.lastID,
      previous_balance: 500,
      penalty: 0,
      passbook: 0,
    }),
  });
  const body = await response.json();
  const oldLoan = await dbGet(`SELECT balance, total_paid, status FROM tblLoan WHERE id = ?`, [sourceLoan.lastID]);
  const newLoan = await dbGet(`SELECT id, previous_balance, loan_type FROM tblLoan WHERE loan_code = ?`, [body.loan_code]);
  const oldLoanPayment = await dbGet(`
    SELECT loan_id, date_paid, amount_paid, balance_before, balance_after, remarks
    FROM tblPayment
    WHERE loan_id = ? AND amount_paid = ? AND date_paid = ?
  `, [sourceLoan.lastID, 500, '2026-07-21']);
  const newLoanBalancePayment = await dbGet(`
    SELECT id FROM tblPayment
    WHERE loan_id = ? AND amount_paid = ? AND remarks LIKE '%old balance%'
  `, [newLoan.id, 500]);

  assert.equal(response.status, 200, body.error);
  assert.equal(oldLoan.balance, 0);
  assert.equal(oldLoan.total_paid, 1000);
  assert.equal(oldLoan.status, 'fullpaid');
  assert.equal(newLoan.previous_balance, 500);
  assert.equal(newLoan.loan_type, 'Re-Loan');
  assert.equal(oldLoanPayment.date_paid, '2026-07-21');
  assert.equal(oldLoanPayment.balance_before, 500);
  assert.equal(oldLoanPayment.balance_after, 0);
  assert.match(oldLoanPayment.remarks, /old balance during Re-Loan/);
  assert.equal(newLoanBalancePayment, undefined);
});

test('reloan penalty posts to new loan on release date without reducing balance', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id)
    VALUES (?, ?, ?, ?)
  `, ['COL-PENALTY', 'Penalty', 'Collector', branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['C-PENALTY', 'Penalty', 'Client', 'Penalty Client', branch.id, collector.lastID, 'active']);
  const sourceLoan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, total_paid, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-PENALTY-OLD', customer.lastID, collector.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-01', '2026-08-15', 25, 1000, 1000, 100, 900, 'active', user.id]);

  const response = await fetch(`${baseUrl}/api/customers/${customer.lastID}/reloan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      principal: 2000,
      loan_period: 45,
      interest_rate: 10,
      date_released: '2026-07-22',
      loan_type: 'Recon',
      source_loan_id: sourceLoan.lastID,
      previous_balance: 100,
      penalty: 75,
      passbook: 0,
    }),
  });
  const body = await response.json();
  const newLoan = await dbGet(`SELECT id, balance, total_amortization, penalty FROM tblLoan WHERE loan_code = ?`, [body.loan_code]);
  const penaltyPayment = await dbGet(`
    SELECT loan_id, date_paid, amount_paid, balance_before, balance_after, status, payment_type, remarks
    FROM tblPayment
    WHERE loan_id = ? AND status = 'penalty'
  `, [newLoan.id]);

  assert.equal(response.status, 200, body.error);
  assert.equal(newLoan.penalty, 75);
  assert.equal(newLoan.balance, newLoan.total_amortization);
  assert.equal(penaltyPayment.loan_id, newLoan.id);
  assert.equal(penaltyPayment.date_paid, '2026-07-22');
  assert.equal(penaltyPayment.amount_paid, 75);
  assert.equal(penaltyPayment.balance_before, newLoan.total_amortization);
  assert.equal(penaltyPayment.balance_after, newLoan.total_amortization);
  assert.equal(penaltyPayment.payment_type, 'penalty');
  assert.match(penaltyPayment.remarks, /Penalty charge posted during loan release/);
});

test('demand letter creation and deletion endpoint', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const createRes = await fetch(`${baseUrl}/api/demand-letters`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      demand_type: 'first',
      client_name: 'TEST DELETE CLIENT',
      courier: 'Field Personnel',
    }),
  });
  const created = await createRes.json();
  assert.equal(createRes.status, 201, created.error);
  assert.ok(created.id);

  const deleteRes = await fetch(`${baseUrl}/api/demand-letters/${created.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  const deleteBody = await deleteRes.json();
  assert.equal(deleteRes.status, 200, deleteBody.error);
  assert.equal(String(deleteBody.id), String(created.id));

  const checkDb = await dbGet(`SELECT * FROM tblDemandLetter WHERE id = ?`, [created.id]);
  assert.equal(checkDb, undefined);
});

test('advancing a demand supersedes the previous stage and registers the next stage for monitoring', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

  const createFirstRes = await fetch(`${baseUrl}/api/demand-letters`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      demand_type: 'first',
      customer_id: 998001,
      loan_id: 998002,
      loan_code: 'ADVANCE-DEMAND-TEST',
      client_name: 'TEST DEMAND PROGRESSION',
      courier: 'Field Personnel',
      date_generated: '2026-07-01',
      status: 'Generated',
    }),
  });
  const firstDemand = await createFirstRes.json();
  assert.equal(createFirstRes.status, 201, firstDemand.error);

  const makeDueRes = await fetch(`${baseUrl}/api/demand-letters/${firstDemand.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      date_received: '2026-07-02',
      follow_up_date: '2026-07-17',
      delivery_status: 'Received',
      status: 'Follow-up Due',
    }),
  });
  assert.equal(makeDueRes.status, 200, (await makeDueRes.json()).error);

  const advanceRes = await fetch(`${baseUrl}/api/demand-letters/${firstDemand.id}/advance`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date_sent: '2026-08-14',
      courier: 'Mailed',
      remarks: 'Second demand sent for progression test',
    }),
  });
  const advanced = await advanceRes.json();
  assert.equal(advanceRes.status, 200, advanced.error);
  assert.equal(advanced.previous_demand.status, 'Superseded');
  assert.equal(advanced.previous_demand.follow_up_date, '');
  assert.equal(advanced.next_demand.demand_type, 'second');
  assert.equal(advanced.next_demand.status, 'Awaiting Receipt');
  assert.equal(advanced.next_demand.date_sent, '2026-08-14');
  assert.equal(advanced.next_demand.previous_demand_id, firstDemand.id);
  assert.equal(advanced.previous_demand.superseded_by_id, advanced.next_demand.id);

  const secondMonitoringRes = await fetch(`${baseUrl}/api/demand-letters?type=second`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const secondMonitoring = await secondMonitoringRes.json();
  assert.equal(secondMonitoringRes.status, 200, secondMonitoring.error);
  assert.ok(secondMonitoring.some(row => row.id === advanced.next_demand.id));

  const notificationsRes = await fetch(`${baseUrl}/api/demand-letters/notifications`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const notifications = await notificationsRes.json();
  assert.equal(notificationsRes.status, 200, notifications.error);
  assert.ok(!notifications.notifications.some(row => row.id === firstDemand.id));
  assert.ok(notifications.notifications.some(row => row.id === advanced.next_demand.id && row.status === 'Awaiting Receipt'));
});

test('saving a sent second demand automatically closes the first-demand follow-up', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
  const identity = {
    customer_id: 998101,
    loan_id: 998102,
    loan_code: 'GENERATE-SECOND-TEST',
    client_name: 'TEST GENERATED SECOND DEMAND',
  };

  const firstRes = await fetch(`${baseUrl}/api/demand-letters`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...identity, demand_type: 'first', status: 'Generated' }),
  });
  const first = await firstRes.json();
  assert.equal(firstRes.status, 201, first.error);

  const receiveFirstRes = await fetch(`${baseUrl}/api/demand-letters/${first.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      date_received: '2026-08-01',
      follow_up_date: '2026-08-16',
      delivery_status: 'Received',
      status: 'Received',
    }),
  });
  assert.equal(receiveFirstRes.status, 200, (await receiveFirstRes.json()).error);

  const secondRes = await fetch(`${baseUrl}/api/demand-letters`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...identity,
      demand_type: 'second',
      date_sent: '2026-08-14',
      delivery_status: 'Awaiting Receipt',
      status: 'Awaiting Receipt',
    }),
  });
  const second = await secondRes.json();
  assert.equal(secondRes.status, 201, second.error);
  assert.equal(second.previous_demand_id, first.id);
  assert.equal(second.status, 'Awaiting Receipt');

  const updatedFirst = await dbGet(`SELECT status, follow_up_date, superseded_by_id FROM tblDemandLetter WHERE id = ?`, [first.id]);
  assert.equal(updatedFirst.status, 'Superseded');
  assert.equal(updatedFirst.follow_up_date, '');
  assert.equal(updatedFirst.superseded_by_id, second.id);

  const secondMonitoringRes = await fetch(`${baseUrl}/api/demand-letters?type=second`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const secondMonitoring = await secondMonitoringRes.json();
  const monitoredSecond = secondMonitoring.find(row => row.id === second.id);
  assert.equal(secondMonitoringRes.status, 200, secondMonitoring.error);
  assert.equal(monitoredSecond.first_demand_received_date, '2026-08-01');

  const receiveSecondRes = await fetch(`${baseUrl}/api/demand-letters/${second.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      date_received: '2026-08-10',
      follow_up_date: '2026-08-20',
      delivery_status: 'Received',
      status: 'Received',
    }),
  });
  assert.equal(receiveSecondRes.status, 200, (await receiveSecondRes.json()).error);

  const thirdRes = await fetch(`${baseUrl}/api/demand-letters`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...identity,
      demand_type: 'third',
      date_sent: '2026-08-21',
      delivery_status: 'Awaiting Receipt',
      status: 'Awaiting Receipt',
    }),
  });
  const third = await thirdRes.json();
  assert.equal(thirdRes.status, 201, third.error);

  const thirdMonitoringRes = await fetch(`${baseUrl}/api/demand-letters?type=third`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const thirdMonitoring = await thirdMonitoringRes.json();
  const monitoredThird = thirdMonitoring.find(row => row.id === third.id);
  assert.equal(thirdMonitoringRes.status, 200, thirdMonitoring.error);
  assert.equal(monitoredThird.first_demand_received_date, '2026-08-01');
  assert.equal(monitoredThird.second_demand_received_date, '2026-08-10');
});

test('manual advance entry is linked to the client loan and appears on the collector collection sheet', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active)
    VALUES (?, ?, ?, ?, 1)
  `, ['COL-ADV-MANUAL', 'Manual', 'Advance', branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `, ['CLIENT-ADV-001', 'Advance', 'Client', 'Advance Client', branch.id, collector.lastID]);
  const loan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal,
      interest_rate, loan_period, date_released, date_maturity, amortization,
      total_amortization, net_proceeds, balance, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `, [
    'LOAN-ADV-001', customer.lastID, collector.lastID, branch.id, 'regular', 10000,
    0, 30, '2026-08-01', '2026-09-01', 500, 10000, 10000, 10000, user.id,
  ]);

  const lookupRes = await fetch(`${baseUrl}/api/reports/collection-sheet/advance-client?client_code=CLIENT-ADV-001`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const lookup = await lookupRes.json();
  assert.equal(lookupRes.status, 200, lookup.error);
  assert.equal(lookup.customer_id, customer.lastID);
  assert.equal(lookup.loan_id, loan.lastID);
  assert.equal(lookup.loan_code, 'LOAN-ADV-001');
  assert.equal(lookup.collector_id, collector.lastID);

  const saveRes = await fetch(`${baseUrl}/api/reports/collection-sheet/advance-manual`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date: '2026-08-14',
      customer_id: customer.lastID,
      loan_id: loan.lastID,
      amount: 500,
    }),
  });
  const saved = await saveRes.json();
  assert.equal(saveRes.status, 201, saved.error);
  assert.equal(saved.entry.amount, 500);
  assert.equal(saved.entry.collector_id, collector.lastID);

  const entriesRes = await fetch(`${baseUrl}/api/reports/collection-sheet/advance-manual?date=2026-08-14`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const entries = await entriesRes.json();
  assert.equal(entriesRes.status, 200, entries.error);
  const savedEntry = entries.entries.find(entry => entry.id === saved.entry.id);
  assert.ok(savedEntry, JSON.stringify(entries));
  assert.equal(savedEntry.customer_code, 'CLIENT-ADV-001');
  assert.equal(savedEntry.loan_code, 'LOAN-ADV-001');
  assert.equal(savedEntry.amount, 500);

  const updateRes = await fetch(`${baseUrl}/api/reports/collection-sheet/advance-manual/${saved.entry.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ amount: 750 }),
  });
  const updated = await updateRes.json();
  assert.equal(updateRes.status, 200, updated.error);
  assert.equal(updated.amount, 750);

  const sheetRes = await fetch(`${baseUrl}/api/reports/collection-sheet?collector_id=${collector.lastID}&date=2026-08-14`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const sheet = await sheetRes.json();
  assert.equal(sheetRes.status, 200, sheet.error);
  const sheetLoan = sheet.loans.find(row => row.id === loan.lastID);
  assert.ok(sheetLoan, JSON.stringify(sheet));
  assert.equal(sheetLoan.advance_manual_today, 750);
  assert.equal(sheetLoan.collected_today, 0);
  assert.equal(sheet.summary.totalCollection, 0);

  const deleteRes = await fetch(`${baseUrl}/api/reports/collection-sheet/advance-manual/${saved.entry.id}`, {
    method: 'DELETE',
    headers,
  });
  const deleted = await deleteRes.json();
  assert.equal(deleteRes.status, 200, deleted.error);

  const sheetAfterDeleteRes = await fetch(`${baseUrl}/api/reports/collection-sheet?collector_id=${collector.lastID}&date=2026-08-14`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const sheetAfterDelete = await sheetAfterDeleteRes.json();
  assert.equal(sheetAfterDeleteRes.status, 200, sheetAfterDelete.error);
  const sheetLoanAfterDelete = sheetAfterDelete.loans.find(row => row.id === loan.lastID);
  assert.equal(sheetLoanAfterDelete.advance_manual_today, 0);
});

test('collector performance summary excludes Recon loans released on target date from Actual Collection', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const { token } = await login.json();

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const user = await dbGet(`SELECT id FROM tblUser WHERE username = 'admin'`);
  const collector = await dbRun(`
    INSERT INTO tblCollector (collector_code, first_name, last_name, is_active)
    VALUES (?, ?, ?, 1)
  `, ['COL-RELEASE-TEST', 'TestRelease', 'Collector']);

  const testDate = '2026-08-06';

  const cust1 = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['C-REL-ACT', 'Active', 'Client', 'Active Client', branch.id, collector.lastID, 'active']);

  const cust2 = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['C-REL-REC-TODAY', 'ReconToday', 'Client', 'Recon Today Client', branch.id, collector.lastID, 'recon']);

  const cust3 = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['C-REL-REC-OLD', 'ReconOld', 'Client', 'Recon Old Client', branch.id, collector.lastID, 'recon']);

  const activeLoan = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-REL-ACT', cust1.lastID, collector.lastID, branch.id, 'New', 1000, 0, 45, '2026-07-01', '2026-08-30', 25, 1000, 1000, 1000, 'active', user.id]);

  const reconLoanToday = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-REC-TODAY', cust2.lastID, collector.lastID, branch.id, 'Recon', 3900, 0, 45, testDate, '2026-09-20', 87, 3900, 3900, 3900, 'active', user.id]);

  const reconLoanOld = await dbRun(`
    INSERT INTO tblLoan (
      loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
      loan_period, date_released, date_maturity, amortization, total_amortization,
      net_proceeds, balance, status, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['LN-REC-OLD', cust3.lastID, collector.lastID, branch.id, 'Recon', 2000, 0, 45, '2026-07-15', '2026-09-01', 45, 2000, 2000, 1500, 'active', user.id]);

  await dbRun(`
    INSERT INTO tblPayment (
      loan_id, customer_id, collector_id, or_number, date_paid, amount_paid,
      balance_before, balance_after, payment_type, status, encoded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [activeLoan.lastID, cust1.lastID, collector.lastID, 'OR-REL-1', testDate, 500, 1000, 500, 'regular', 'active', user.id]);

  await dbRun(`
    INSERT INTO tblPayment (
      loan_id, customer_id, collector_id, or_number, date_paid, amount_paid,
      balance_before, balance_after, payment_type, remarks, status, encoded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [reconLoanToday.lastID, cust2.lastID, collector.lastID, 'OR-REL-2', testDate, 48, 48, 0, 'balance', 'Auto-posted old balance during RECON', 'active', user.id]);

  await dbRun(`
    INSERT INTO tblPayment (
      loan_id, customer_id, collector_id, or_number, date_paid, amount_paid,
      balance_before, balance_after, payment_type, status, encoded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [reconLoanOld.lastID, cust3.lastID, collector.lastID, 'OR-REL-3', testDate, 300, 1500, 1200, 'regular', 'active', user.id]);

  const res = await fetch(`${baseUrl}/api/collector-performance/summary?date_to=${testDate}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  const foundCollector = data.collectors.find(c => c.id === collector.lastID);

  assert.equal(res.status, 200);
  assert.ok(foundCollector);
  assert.equal(foundCollector.actual_collection, 848);
});
