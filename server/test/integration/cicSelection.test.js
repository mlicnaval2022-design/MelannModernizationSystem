const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'melann-cic-selection-')), 'test.sqlite');
process.env.JWT_SECRET = 'cic-selection-test-secret';

const cicRoutes = require('../../src/routes/cic');
const { closeDb, dbGet, dbRun, initializeDatabase } = require('../../src/db/database');

let server;
let baseUrl;

const request = (path, options = {}) => fetch(`${baseUrl}/api/cic${path}`, {
  ...options,
  headers: { 'content-type': 'application/json', ...options.headers },
});

test.before(async () => {
  await initializeDatabase();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 101, role: 'compliance' };
    next();
  });
  app.use('/api/cic', cicRoutes);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const branch = await dbGet(`SELECT id FROM tblBranch LIMIT 1`);
  const collector = await dbRun(`INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active) VALUES ('CIC-COL', 'CIC', 'Collector', ?, 1)`, [branch.id]);
  const customer = await dbRun(`
    INSERT INTO tblCustomer (customer_code, first_name, last_name, full_name, branch_id, collector_id, gender, birth_date, address, contact, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by)
    VALUES ('CIC-CLIENT', 'CIC', 'Client', 'CIC Client', ?, ?, 'F', '1990-01-01', 'Ormoc City', '09171234567', 'Passport', 'P1234567', '2020-01-01', '2030-01-01', 'DFA')
  `, [branch.id, collector.lastID]);
  const ownLoan = await dbRun(`
    INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_amount, loan_period, total_amortization, balance, date_released, date_maturity, status)
    VALUES ('CIC-OWN', ?, ?, ?, 'New', 1000, 100, 45, 1100, 1100, '2026-05-10', '2026-06-24', 'active')
  `, [customer.lastID, collector.lastID, branch.id]);
  const otherLoan = await dbRun(`
    INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_amount, loan_period, total_amortization, balance, date_released, date_maturity, status)
    VALUES ('CIC-OTHER', ?, ?, ?, 'New', 1000, 100, 45, 1100, 1100, '2026-05-11', '2026-06-25', 'active')
  `, [customer.lastID, collector.lastID, branch.id]);
  await dbRun(`INSERT INTO tblGovernmentComplianceClients (agency, loan_id, customer_id, customer_code, customer_name, assigned_user_id, sent_by_user_id) VALUES ('CIC', ?, ?, 'CIC-CLIENT', 'CIC Client', 101, 101)`, [ownLoan.lastID, customer.lastID]);
  await dbRun(`INSERT INTO tblGovernmentComplianceClients (agency, loan_id, customer_id, customer_code, customer_name, assigned_user_id, sent_by_user_id) VALUES ('CIC', ?, ?, 'CIC-CLIENT', 'CIC Client', 202, 202)`, [otherLoan.lastID, customer.lastID]);
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await closeDb();
});

test('CIC candidates and exports are restricted to selected reports assigned to the logged-in user', async () => {
  const candidatesResponse = await request('/candidates?year=2026&month=6');
  assert.equal(candidatesResponse.status, 200);
  const candidates = await candidatesResponse.json();
  assert.deepEqual(candidates.clients.map(client => client.loan_code), ['CIC-OWN']);

  const previewResponse = await request('/preview', {
    method: 'POST',
    body: JSON.stringify({ year: 2026, month: 6, selected_loan_ids: [candidates.clients[0].loan_id] }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.counts.availableClientReports, 1);
  assert.equal(preview.counts.selectedClients, 1);
  assert.equal(preview.counts.totalIdRecords, 1);
  assert.equal(preview.counts.totalCiRecords, 1);
  assert.equal(preview.counts.totalRecordsForFt, 2);
  assert.deepEqual(preview.previewRecords.map(record => record.recordType), ['HD', 'ID', 'CI', 'FT']);
  assert.match(preview.fileName, /^PF022370_CSDF_20260531\d{6}\.txt$/);
});
