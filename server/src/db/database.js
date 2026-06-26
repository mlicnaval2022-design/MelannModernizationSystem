const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../melann.db');

let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('DB connection error:', err.message);
    });
    db.run('PRAGMA journal_mode=WAL');
    db.run('PRAGMA foreign_keys=ON');
  }
  return db;
}

// Promise wrappers
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbExec(sql) {
  return new Promise((resolve, reject) => {
    getDb().exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function initializeDatabase() {
  const schema = `
    CREATE TABLE IF NOT EXISTS tblUser (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'teller',
      branch_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblBranch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_code TEXT NOT NULL UNIQUE,
      branch_name TEXT NOT NULL,
      address TEXT,
      contact TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblCollector (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collector_code TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      branch_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblColl_Code (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collector_id INTEGER NOT NULL,
      code TEXT NOT NULL UNIQUE,
      description TEXT
    );
    CREATE TABLE IF NOT EXISTS tblCustomer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      middle_name TEXT,
      full_name TEXT,
      address TEXT,
      contact TEXT,
      birth_date TEXT,
      civil_status TEXT,
      occupation TEXT,
      branch_id INTEGER,
      collector_id INTEGER,
      home_status TEXT,
      business_address TEXT,
      business_location TEXT,
      business_years INTEGER DEFAULT 0,
      business_months INTEGER DEFAULT 0,
      business_ownership TEXT,
      business_permit TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblCustomerStatusHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      changed_by INTEGER,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS tblChartOfAccounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblServicefee (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_type TEXT NOT NULL,
      fee_rate REAL NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblLoan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_code TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      collector_id INTEGER,
      branch_id INTEGER,
      loan_type TEXT NOT NULL DEFAULT 'regular',
      principal REAL NOT NULL,
      interest_rate REAL NOT NULL DEFAULT 0,
      interest_amount REAL DEFAULT 0,
      loan_period INTEGER NOT NULL DEFAULT 1,
      date_released TEXT NOT NULL,
      date_maturity TEXT,
      amortization REAL DEFAULT 0,
      total_amortization REAL DEFAULT 0,
      service_fee REAL DEFAULT 0,
      insurance REAL DEFAULT 0,
      notarial_fee REAL DEFAULT 0,
      filing_fee REAL DEFAULT 0,
      total_deductions REAL DEFAULT 0,
      net_proceeds REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      total_paid REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      or_number TEXT,
      remarks TEXT,
      created_by INTEGER,
      dcr_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblAmortizationSchedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      period_number INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      amount_due REAL NOT NULL,
      amount_paid REAL DEFAULT 0,
      date_paid TEXT,
      status TEXT DEFAULT 'unpaid'
    );
    CREATE TABLE IF NOT EXISTS tblPayment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      collector_id INTEGER,
      or_number TEXT NOT NULL,
      date_paid TEXT NOT NULL,
      amount_paid REAL NOT NULL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      payment_type TEXT DEFAULT 'regular',
      status TEXT DEFAULT 'active',
      reversed_at TEXT,
      reversed_by INTEGER,
      remarks TEXT,
      encoded_by INTEGER,
      dcr_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblCreditInvestigation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      daily_sales REAL DEFAULT 0,
      daily_expenses REAL DEFAULT 0,
      other_income REAL DEFAULT 0,
      other_loans REAL DEFAULT 0,
      exp_electricity REAL DEFAULT 0,
      exp_water REAL DEFAULT 0,
      exp_internet REAL DEFAULT 0,
      exp_transport REAL DEFAULT 0,
      exp_rental REAL DEFAULT 0,
      exp_food REAL DEFAULT 0,
      exp_appliances REAL DEFAULT 0,
      exp_allowance REAL DEFAULT 0,
      exp_tuition REAL DEFAULT 0,
      exp_misc REAL DEFAULT 0,
      check_location INTEGER DEFAULT 0,
      check_activity INTEGER DEFAULT 0,
      check_residency INTEGER DEFAULT 0,
      check_borrowing INTEGER DEFAULT 0,
      check_understanding INTEGER DEFAULT 0,
      check_permit INTEGER DEFAULT 0,
      check_purpose INTEGER DEFAULT 0,
      check_source INTEGER DEFAULT 0,
      check_consent INTEGER DEFAULT 0,
      check_escalate INTEGER DEFAULT 0,
      ci_notes TEXT,
      endorsement TEXT,
      encoded_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblColl_Data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collector_id INTEGER NOT NULL,
      loan_id INTEGER NOT NULL,
      assigned_date TEXT DEFAULT (date('now')),
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS tblDeposit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER,
      deposit_date TEXT NOT NULL,
      amount REAL NOT NULL,
      bank_name TEXT,
      reference_no TEXT,
      deposited_by TEXT,
      remarks TEXT,
      status TEXT DEFAULT 'active',
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblExpense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER,
      expense_date TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      description TEXT,
      payee TEXT,
      status TEXT DEFAULT 'active',
      created_by INTEGER,
      dcr_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblCashOnHand (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER,
      entry_date TEXT NOT NULL,
      opening_balance REAL DEFAULT 0,
      total_collections REAL DEFAULT 0,
      total_releases REAL DEFAULT 0,
      total_expenses REAL DEFAULT 0,
      closing_balance REAL DEFAULT 0,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblDailyCashReport (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dcr_number TEXT UNIQUE NOT NULL,
      branch_id INTEGER,
      report_date TEXT NOT NULL,
      beginning_cash REAL DEFAULT 0,
      total_collections REAL DEFAULT 0,
      total_releases REAL DEFAULT 0,
      total_expenses REAL DEFAULT 0,
      other_income REAL DEFAULT 0,
      other_disbursements REAL DEFAULT 0,
      expected_ending_cash REAL DEFAULT 0,
      count_1000 INTEGER DEFAULT 0,
      count_500 INTEGER DEFAULT 0,
      count_200 INTEGER DEFAULT 0,
      count_100 INTEGER DEFAULT 0,
      count_50 INTEGER DEFAULT 0,
      count_20 INTEGER DEFAULT 0,
      count_coins REAL DEFAULT 0,
      actual_cash_count REAL DEFAULT 0,
      variance REAL DEFAULT 0,
      status TEXT DEFAULT 'CLOSED',
      closed_by INTEGER,
      closed_at TEXT DEFAULT (datetime('now')),
      remarks TEXT
    );
    CREATE TABLE IF NOT EXISTS tblCashOnBank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER,
      bank_name TEXT NOT NULL,
      account_number TEXT,
      entry_date TEXT NOT NULL,
      amount REAL DEFAULT 0,
      transaction_type TEXT,
      reference_no TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblCharge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      charge_type TEXT NOT NULL,
      amount REAL NOT NULL,
      date_charged TEXT DEFAULT (date('now')),
      remarks TEXT
    );
    CREATE TABLE IF NOT EXISTS tblBreakdown (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      amount REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tblLogtime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      reference_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblGovernmentCompliance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency TEXT NOT NULL,
      title TEXT,
      submission_month INTEGER,
      reporting_period TEXT,
      compliance_name TEXT,
      filing_type TEXT,
      tax_type TEXT,
      filing_period TEXT,
      due_date TEXT NOT NULL,
      date_submitted TEXT,
      date_filed TEXT,
      date_paid TEXT,
      or_number TEXT,
      amount REAL DEFAULT 0,
      status TEXT NOT NULL,
      remarks TEXT,
      prepared_by TEXT,
      verified_by TEXT,
      assigned_personnel TEXT,
      created_by INTEGER,
      updated_by INTEGER,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblGovernmentComplianceAttachment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      compliance_id INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      uploaded_by INTEGER,
      uploaded_at TEXT DEFAULT (datetime('now')),
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (compliance_id) REFERENCES tblGovernmentCompliance(id)
    );
    CREATE TABLE IF NOT EXISTS tblCICSubmissionBatch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_number TEXT NOT NULL UNIQUE,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      branch_id INTEGER,
      status TEXT DEFAULT 'generated',
      total_records INTEGER DEFAULT 0,
      generated_by INTEGER,
      generated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblCICSubmissionRecord (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      loan_id INTEGER,
      record_type TEXT NOT NULL,
      raw_data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (batch_id) REFERENCES tblCICSubmissionBatch(id)
    );
  `;

  await dbExec(schema);

  const customerCols = await dbAll(`PRAGMA table_info(tblCustomer)`);
  const customerColNames = new Set(customerCols.map(c => c.name));
  if (!customerColNames.has('for_bir')) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN for_bir INTEGER DEFAULT 0`);
  if (!customerColNames.has('for_cic')) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN for_cic INTEGER DEFAULT 0`);
  if (!customerColNames.has('for_sec')) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN for_sec INTEGER DEFAULT 0`);

  // Seed default admin
  const userCount = await dbGet('SELECT COUNT(*) as count FROM tblUser');
  if (userCount.count === 0) {
    const adminPw = bcrypt.hashSync('admin123', 10);
    const tellerPw = bcrypt.hashSync('teller123', 10);
    await dbRun(`INSERT INTO tblUser (username, password, full_name, role) VALUES (?,?,?,?)`, ['admin', adminPw, 'System Administrator', 'admin']);
    await dbRun(`INSERT INTO tblUser (username, password, full_name, role) VALUES (?,?,?,?)`, ['teller', tellerPw, 'Demo Teller', 'teller']);
    await dbRun(`INSERT INTO tblUser (username, password, full_name, role) VALUES (?,?,?,?)`, ['manager', bcrypt.hashSync('manager123', 10), 'Branch Manager', 'manager']);
    await dbRun(`INSERT INTO tblUser (username, password, full_name, role) VALUES (?,?,?,?)`, ['accounting', bcrypt.hashSync('accounting123', 10), 'Accounting Staff', 'accounting']);
    console.log('✅ Default users seeded');
  }

  // Seed default branch
  const branchCount = await dbGet('SELECT COUNT(*) as count FROM tblBranch');
  if (branchCount.count === 0) {
    await dbRun(`INSERT INTO tblBranch (branch_code, branch_name, address, contact) VALUES (?,?,?,?)`, ['BR001', 'Main Branch', 'Main Office, Melann', '000-0000']);
    console.log('✅ Default branch seeded');
  }

  console.log('✅ Database initialized');
}

module.exports = { getDb, initializeDatabase, dbRun, dbGet, dbAll };
