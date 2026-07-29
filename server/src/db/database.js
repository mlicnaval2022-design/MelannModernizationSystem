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

function closeDb() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close((err) => {
      if (err) return reject(err);
      db = undefined;
      resolve();
    });
  });
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
      assigned_to TEXT,
      supervisor TEXT,
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
      gender TEXT,
      id_type TEXT,
      id_number TEXT,
      id_issue_date TEXT,
      id_expiry_date TEXT,
      id_issued_by TEXT,
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
      previous_balance REAL DEFAULT 0,
      penalty REAL DEFAULT 0,
      passbook REAL DEFAULT 0,
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
      loan_history TEXT,
      business_years TEXT,
      no_hardship TEXT,
      cb_rating TEXT,
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
    CREATE TABLE IF NOT EXISTS tblTransaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER,
      transaction_date TEXT NOT NULL,
      amount REAL NOT NULL,
      transaction_type TEXT DEFAULT 'Expense',
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
      display_total_releases REAL DEFAULT 0,
      total_expenses REAL DEFAULT 0,
      other_income REAL DEFAULT 0,
      other_disbursements REAL DEFAULT 0,
      expected_ending_cash REAL DEFAULT 0,
      ending_cash_on_bank REAL DEFAULT 0,
      total_cash_position REAL DEFAULT 0,
      total_deposits REAL DEFAULT 0,
      total_withdrawals REAL DEFAULT 0,
      total_bank_charges REAL DEFAULT 0,
      total_bank_interest REAL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS tblCollectionFieldRelease (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collector_id INTEGER NOT NULL,
      report_date TEXT NOT NULL,
      amount REAL DEFAULT 0,
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(collector_id, report_date)
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
      agency TEXT,
      title TEXT,
      submission_month TEXT,
      reporting_period TEXT,
      compliance_name TEXT,
      filing_type TEXT,
      tax_type TEXT,
      filing_period TEXT,
      due_date TEXT,
      date_submitted TEXT,
      date_filed TEXT,
      date_paid TEXT,
      or_number TEXT,
      amount REAL,
      status TEXT DEFAULT 'Pending',
      remarks TEXT,
      prepared_by TEXT,
      verified_by TEXT,
      assigned_personnel TEXT,
      is_archived INTEGER DEFAULT 0,
      created_by INTEGER,
      updated_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tblGovernmentComplianceClients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency TEXT,
      loan_id INTEGER,
      customer_id INTEGER,
      customer_code TEXT,
      customer_name TEXT,
      loan_amount REAL,
      loan_type TEXT,
      release_date TEXT,
      collector_name TEXT,
      branch_name TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agency, loan_id)
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
    CREATE TABLE IF NOT EXISTS tblSystemSettings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblHoliday (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holiday_date TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblMonitoringAlert (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      loan_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      collector_id INTEGER NOT NULL,
      first_missed_date TEXT,
      latest_missed_date TEXT,
      consecutive_days INTEGER DEFAULT 0,
      total_missed_days INTEGER DEFAULT 0,
      alert_level TEXT DEFAULT 'Day 1',
      status TEXT DEFAULT 'Active',
      sequence_number INTEGER DEFAULT 1,
      repeat_risk TEXT DEFAULT 'Low Risk',
      resolved_at TEXT,
      resolved_by INTEGER,
      resolution_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblFollowUp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      follow_up_date TEXT NOT NULL,
      follow_up_method TEXT NOT NULL,
      contact_result TEXT NOT NULL,
      remarks TEXT,
      next_follow_up_date TEXT,
      attachment_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblPromiseToPay (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      promise_date TEXT NOT NULL,
      promised_amount REAL NOT NULL,
      payment_method TEXT,
      reason TEXT,
      follow_up_date TEXT,
      remarks TEXT,
      status TEXT DEFAULT 'Pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblSystemAudit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      role TEXT,
      action TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      module TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblInAppNotification (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      related_module TEXT,
      related_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblDcrYtdOverride (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT NOT NULL,
      branch_id INTEGER,
      ytd_beg_releases REAL DEFAULT 0,
      ytd_beg_collections REAL DEFAULT 0,
      ytd_beg_expenses REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tblDemandLetter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      demand_type TEXT NOT NULL,
      customer_id INTEGER,
      loan_id INTEGER,
      loan_code TEXT,
      courier TEXT,
      collector_name TEXT,
      client_name TEXT NOT NULL,
      date_generated TEXT NOT NULL DEFAULT (date('now')),
      date_received TEXT,
      follow_up_date TEXT,
      remarks TEXT,
      status TEXT DEFAULT 'Generated',
      generated_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `;

  await dbExec(schema);

  // Seed default settings for Monitoring if missing
  const settingCount = await dbGet('SELECT COUNT(*) as count FROM tblSystemSettings');
  if (settingCount.count === 0) {
    await dbRun("INSERT INTO tblSystemSettings (setting_key, setting_value, description) VALUES (?, ?, ?)", ['daily_cutoff', '20:00', 'Daily background cut-off time (HH:mm)']);
    await dbRun("INSERT INTO tblSystemSettings (setting_key, setting_value, description) VALUES (?, ?, ?)", ['treat_positive_as_paid', 'true', 'Treat any positive payment as paid for the day']);
    await dbRun("INSERT INTO tblSystemSettings (setting_key, setting_value, description) VALUES (?, ?, ?)", ['exclude_sundays', 'true', 'Do not count Sundays as collection days']);
    await dbRun("INSERT INTO tblSystemSettings (setting_key, setting_value, description) VALUES (?, ?, ?)", ['escalation_threshold', '4', 'Consecutive days required to escalate case']);
  }

  const customerCols = await dbAll(`PRAGMA table_info(tblCustomer)`);
  const customerColNames = new Set(customerCols.map(c => c.name));
  if (!customerColNames.has('for_bir')) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN for_bir INTEGER DEFAULT 0`);
  if (!customerColNames.has('for_cic')) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN for_cic INTEGER DEFAULT 0`);
  if (!customerColNames.has('for_sec')) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN for_sec INTEGER DEFAULT 0`);
  if (!customerColNames.has('encoded_by')) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN encoded_by INTEGER`);
  
  const extCols = ['sitio', 'purok', 'brgy', 'city', 'gender', 'secondary_contact', 'email', 'income_per_month', 'expenses_per_month', 'loan_purpose', 'collateral', 'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by', 'fb_account', 'nationality', 'educational_background', 'occupational_status', 'customer_classification', 'risk_category', 'cic_verification', 'province', 'zip_code', 'length_of_stay', 'previous_address', 'messenger_account', 'preferred_contact_method', 'preferred_contact_time_from', 'preferred_contact_time_to', 'contact_notes', 'business_type', 'business_name', 'business_employees', 'permit_date_issued', 'permit_place_issued', 'permit_no', 'id_place_of_issue', 'tin_number', 'sss_number', 'id_notes', 'photo_id_front', 'photo_id_back', 'photo_business_proof', 'photo_client'];
  for (const c of extCols) {
    if (!customerColNames.has(c)) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN ${c} TEXT`);
  }

  const loanCols = await dbAll(`PRAGMA table_info(tblLoan)`);
  const loanColNames = new Set(loanCols.map(c => c.name));
  if (!loanColNames.has('previous_balance')) await dbRun(`ALTER TABLE tblLoan ADD COLUMN previous_balance REAL DEFAULT 0`);
  if (!loanColNames.has('penalty')) await dbRun(`ALTER TABLE tblLoan ADD COLUMN penalty REAL DEFAULT 0`);
  if (!loanColNames.has('passbook')) await dbRun(`ALTER TABLE tblLoan ADD COLUMN passbook REAL DEFAULT 0`);

  const ciCols = await dbAll(`PRAGMA table_info(tblCreditInvestigation)`);
  const ciColNames = new Set(ciCols.map(c => c.name));
  const ciTextCols = ['loan_history', 'business_years', 'no_hardship', 'cb_rating'];
  for (const c of ciTextCols) {
    if (!ciColNames.has(c)) await dbRun(`ALTER TABLE tblCreditInvestigation ADD COLUMN ${c} TEXT`);
  }

  const dcrCols = await dbAll(`PRAGMA table_info(tblDailyCashReport)`);
  const dcrColNames = new Set(dcrCols.map(c => c.name));
  if (!dcrColNames.has('ending_cash_on_bank')) await dbRun(`ALTER TABLE tblDailyCashReport ADD COLUMN ending_cash_on_bank REAL DEFAULT 0`);
  if (!dcrColNames.has('total_cash_position')) await dbRun(`ALTER TABLE tblDailyCashReport ADD COLUMN total_cash_position REAL DEFAULT 0`);
  if (!dcrColNames.has('total_deposits')) await dbRun(`ALTER TABLE tblDailyCashReport ADD COLUMN total_deposits REAL DEFAULT 0`);
  if (!dcrColNames.has('total_withdrawals')) await dbRun(`ALTER TABLE tblDailyCashReport ADD COLUMN total_withdrawals REAL DEFAULT 0`);
  if (!dcrColNames.has('total_bank_charges')) await dbRun(`ALTER TABLE tblDailyCashReport ADD COLUMN total_bank_charges REAL DEFAULT 0`);
  if (!dcrColNames.has('total_bank_interest')) await dbRun(`ALTER TABLE tblDailyCashReport ADD COLUMN total_bank_interest REAL DEFAULT 0`);
  if (!dcrColNames.has('display_total_releases')) await dbRun(`ALTER TABLE tblDailyCashReport ADD COLUMN display_total_releases REAL DEFAULT 0`);

  const paymentCols = await dbAll(`PRAGMA table_info(tblPayment)`);
  const paymentColNames = new Set(paymentCols.map(c => c.name));
  if (!paymentColNames.has('payment_code')) await dbRun(`ALTER TABLE tblPayment ADD COLUMN payment_code TEXT`);

  const demandCols = await dbAll(`PRAGMA table_info(tblDemandLetter)`);
  const demandColNames = new Set(demandCols.map(c => c.name));
  const demandTextCols = ['loan_code', 'courier', 'collector_name', 'date_received', 'follow_up_date', 'remarks', 'status'];
  for (const c of demandTextCols) {
    if (!demandColNames.has(c)) await dbRun(`ALTER TABLE tblDemandLetter ADD COLUMN ${c} TEXT`);
  }
  if (!demandColNames.has('customer_id')) await dbRun(`ALTER TABLE tblDemandLetter ADD COLUMN customer_id INTEGER`);
  if (!demandColNames.has('loan_id')) await dbRun(`ALTER TABLE tblDemandLetter ADD COLUMN loan_id INTEGER`);
  if (!demandColNames.has('generated_by')) await dbRun(`ALTER TABLE tblDemandLetter ADD COLUMN generated_by INTEGER`);
  if (!demandColNames.has('updated_at')) await dbRun(`ALTER TABLE tblDemandLetter ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`);

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

module.exports = { getDb, closeDb, initializeDatabase, dbRun, dbGet, dbAll };
