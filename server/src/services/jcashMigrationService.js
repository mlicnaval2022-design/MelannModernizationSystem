const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');
const { dbAll, dbGet, dbRun } = require('../db/database');

const DEFAULT_SOURCE = 'C:\\Users\\User\\OneDrive\\Documents\\lendingV3\\db\\jcashdb.mdb';
const IMPORT_REMARK_PREFIX = 'Imported read-only from jcashdb.mdb';
const REVERSED_STATUS = new Set(['reverse', 'reversed', 'reversing']);

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function isGoodStatus(value) {
  const status = normalizeStatus(value);
  return status === 'good' || status === 'good status';
}

function isReversedStatus(value) {
  return REVERSED_STATUS.has(normalizeStatus(value));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined ? [] : [value];
}

function isMigratableLoan(loan) {
  return isGoodStatus(loan.source_loan_status)
    && !isReversedStatus(loan.source_loan_status)
    && !isReversedStatus(loan.source_row_status)
    && Number(loan.balance || 0) > 0;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[, PHPphp]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function pick(row, candidates) {
  const byName = new Map(Object.keys(row || {}).map(key => [normalizeName(key), row[key]]));
  for (const candidate of candidates) {
    const key = normalizeName(candidate);
    if (byName.has(key)) return byName.get(key);
  }
  return null;
}

function accessDateLiteral(isoDate) {
  const [year, month, day] = String(isoDate).split('-');
  return `${month}/${day}/${year}`;
}

function psString(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function validateDateRange(from, to) {
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const err = new Error('Valid From and To dates are required.');
    err.statusCode = 400;
    throw err;
  }
  if (from > to) {
    const err = new Error('From date cannot be later than To date.');
    err.statusCode = 400;
    throw err;
  }
}

function getAccessPassword(password) {
  return password !== undefined && password !== null ? String(password) : (process.env.JCASH_MDB_PASSWORD || '');
}

function validateLoanId(loanId) {
  const normalized = String(loanId ?? '').trim();
  if (!/^\d+$/.test(normalized)) {
    const err = new Error('Loan ID must contain numbers only.');
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

function accessBalanceExpression(prefix = '') {
  return `IIF(IIF(IsNull(${prefix}Balance),0,${prefix}Balance)>0,IIF(IsNull(${prefix}Balance),0,${prefix}Balance),IIF(IsNull(${prefix}LoanTotal),0,${prefix}LoanTotal)-IIF(IsNull(${prefix}TotalPayment),0,${prefix}TotalPayment))`;
}

function accessLoanWhere({ prefix = '', from, to, loanId }) {
  const selector = loanId
    ? `${prefix}LoanID=${validateLoanId(loanId)}`
    : `${prefix}DateRelease >= #${accessDateLiteral(from)}# AND ${prefix}DateRelease <= #${accessDateLiteral(to)}#`;
  return `${prefix}LoanStatus='Good' AND ${selector} AND (IsNull(${prefix}Status) OR ${prefix}Status NOT IN ('Reverse','Reversed','Reversing')) AND ${accessBalanceExpression(prefix)} > 0`;
}

function readAccessRows({ from, to, loanId, source = process.env.JCASH_MDB_PATH || DEFAULT_SOURCE, password }) {
  const normalizedLoanId = loanId ? validateLoanId(loanId) : null;
  if (!normalizedLoanId) validateDateRange(from, to);
  const accessPassword = getAccessPassword(password);
  const balanceExpr = accessBalanceExpression();
  const loanWhere = accessLoanWhere({ from, to, loanId: normalizedLoanId });
  const customerLoanWhere = accessLoanWhere({ prefix: 'l.', from, to, loanId: normalizedLoanId });
  const paymentWhere = "Status='Good'";
  const ps = `
$ErrorActionPreference = 'Stop'
$path = ${psString(source)}
$password = ${psString(accessPassword)}
$loanWhere = ${psString(loanWhere)}
$customerLoanWhere = ${psString(customerLoanWhere)}
$paymentWhere = ${psString(paymentWhere)}
$providers = @('Microsoft.ACE.OLEDB.16.0','Microsoft.ACE.OLEDB.12.0','Microsoft.Jet.OLEDB.4.0')
$errors = @()
function Invoke-AccessQuery($cn, $sql) {
  $cmd = $cn.CreateCommand()
  $cmd.CommandText = $sql
  $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
  $dt = New-Object System.Data.DataTable
  [void]$adapter.Fill($dt)
  $rows = @()
  foreach ($dr in $dt.Rows) {
    $obj = [ordered]@{}
    foreach ($col in $dt.Columns) {
      $value = $dr[$col.ColumnName]
      if ($value -is [DBNull]) { $value = $null }
      elseif ($value -is [DateTime]) { $value = $value.ToString('yyyy-MM-dd') }
      $obj[$col.ColumnName] = $value
    }
    $rows += [pscustomobject]$obj
  }
  return $rows
}
function Convert-SqlLiteral($value) {
  if ($null -eq $value) { return $null }
  $text = [string]$value
  $numeric = 0
  if ([double]::TryParse($text, [ref]$numeric)) { return $text }
  return "'" + $text.Replace("'", "''") + "'"
}
foreach ($provider in $providers) {
  try {
    $escapedPassword = $password.Replace("'", "''")
    $connectionString = "Provider=$provider;Data Source=$path;Mode=Read;Persist Security Info=False;"
    if ($password) { $connectionString += "Jet OLEDB:Database Password=$escapedPassword;" }
    $cn = New-Object System.Data.OleDb.OleDbConnection($connectionString)
    $cn.Open()
    $loans = Invoke-AccessQuery $cn ("SELECT *, ${balanceExpr} AS EffectiveBalance FROM tblLoan WHERE " + $loanWhere)
    $customers = Invoke-AccessQuery $cn ("SELECT DISTINCT c.* FROM tblCustomer AS c INNER JOIN tblLoan AS l ON c.Code = l.Code WHERE " + $customerLoanWhere)
    $loanIds = @($loans | ForEach-Object { Convert-SqlLiteral $_.LoanID } | Where-Object { $_ })
    $payments = @()
    for ($i = 0; $i -lt $loanIds.Count; $i += 200) {
      $end = [Math]::Min($i + 199, $loanIds.Count - 1)
      $idList = ($loanIds[$i..$end] -join ',')
      $payments += Invoke-AccessQuery $cn ("SELECT * FROM tblPayment WHERE " + $paymentWhere + " AND LoanID IN ($idList)")
    }
    $cn.Close()
    [pscustomobject]@{ provider = $provider; source = $path; customers = @($customers); loans = @($loans); payments = @($payments) } | ConvertTo-Json -Depth 8 -Compress
    exit 0
  } catch {
    $errors += ($provider + ': ' + $_.Exception.Message)
  }
}
throw ($errors -join ' | ')
`;

  const powershellCandidates = ['powershell.exe'];
  const windowsDirectory = process.env.WINDIR || process.env.SystemRoot;
  if (windowsDirectory) {
    const powershell32 = path.join(windowsDirectory, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (existsSync(powershell32)) powershellCandidates.push(powershell32);
  }

  let result;
  for (const executable of powershellCandidates) {
    result = spawnSync(executable, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 512,
    });
    const output = `${result.stderr || ''}\n${result.stdout || ''}`;
    if (result.status === 0 || !/provider is not registered/i.test(output)) break;
  }
  if (result.status !== 0) {
    const output = (result.stderr || result.stdout || '').trim();
    const invalidPassword = /not a valid password|invalid password/i.test(output);
    const providerMissing = /provider is not registered/i.test(output);
    const err = new Error(invalidPassword
      ? 'Cannot open jcashdb.mdb because the Access database password is missing or incorrect. Enter the JCash database password and scan again.'
      : providerMissing
        ? 'Cannot open jcashdb.mdb because Microsoft Access Database Engine provider is not installed on this computer.'
        : output || 'Unable to read jcashdb.mdb in read-only mode.');
    err.statusCode = 500;
    throw err;
  }
  return JSON.parse(result.stdout);
}

function mapCustomer(row) {
  const customerCode = String(pick(row, ['Customer Code', 'CustomerCode', 'CustCode', 'Client Code', 'ClientCode', 'CCode', 'Code']) || '').trim();
  const firstName = String(pick(row, ['First Name', 'FirstName', 'FName', 'Given Name']) || '').trim();
  const lastName = String(pick(row, ['Last Name', 'LastName', 'LName', 'Surname']) || '').trim();
  const middleName = String(pick(row, ['Middle Name', 'MiddleName', 'MiddleInitial', 'MName', 'MI']) || '').trim();
  const fullName = [lastName, firstName].filter(Boolean).join(', ') + (middleName ? ` ${middleName}` : '');
  return {
    customer_code: customerCode,
    first_name: firstName || 'Unknown',
    last_name: lastName || customerCode || 'Unknown',
    middle_name: middleName || null,
    full_name: fullName.trim() || customerCode,
    address: pick(row, ['Address', 'Complete Address', 'Home Address']),
    contact: pick(row, ['Phone number', 'Phone Number', 'Phone', 'Contact', 'Contact Number', 'Cellphone', 'Mobile']),
    birth_date: toDateOnly(pick(row, ['Birthday', 'Birth Date', 'BirthDate', 'DOB'])),
    civil_status: pick(row, ['Marital Status', 'Civil Status', 'CivilStatus']),
    occupation: pick(row, ['Business', 'Occupation', 'Work']),
    gender: pick(row, ['Gender', 'Sex']),
    email: pick(row, ['Email address', 'Email Address', 'Email']),
    income_per_month: toNumber(pick(row, ['Income per Month', 'Income Per Month', 'Monthly Income', 'Income'])),
    expenses_per_month: toNumber(pick(row, ['Expense per month', 'Expenses per month', 'Monthly Expense', 'Monthly Expenses', 'Expense'])),
    loan_purpose: pick(row, ['Purpose', 'Loan Purpose']),
    collateral: pick(row, ['Collateral']),
    id_type: pick(row, ['ID1 Type', 'ID Type', 'IDType']),
    id_number: pick(row, ['ID number', 'ID Number', 'ID1 Number', 'IDNo']),
    id_issue_date: toDateOnly(pick(row, ['ID Issue date', 'ID Issue Date', 'ID Issued Date'])),
    id_expiry_date: toDateOnly(pick(row, ['ID Expiry Date', 'ID Expiration Date'])),
    id_issued_by: pick(row, ['ID Issued By', 'Issued By']),
    fb_account: pick(row, ['FB Account', 'Facebook', 'Facebook Account', 'FBAccount']),
    nationality: pick(row, ['Nationality']),
    business_name: pick(row, ['Business', 'Business Name']),
    business_type: pick(row, ['Business Type', 'Business']),
    collector_name: pick(row, ['Collector', 'Collector Name']),
  };
}

function mapLoan(row) {
  const principal = toNumber(pick(row, ['Principal', 'Loan Principal', 'Amount'])) || 0;
  const totalCandidates = [
    toNumber(pick(row, ['Total'])),
    toNumber(pick(row, ['TotalAmortization', 'Total Amortization'])),
    toNumber(pick(row, ['LoanTotal', 'Loan Total', 'Total Loan', 'TotalLoan', 'Total Amount', 'Loan Amount'])),
    principal,
  ].filter(value => Number(value || 0) > 0);
  const total = totalCandidates.length ? Math.max(...totalCandidates) : principal;
  const totalPaid = toNumber(pick(row, ['TotalPayment', 'Total Payment', 'Total Paid'])) || 0;
  const rawBalance = toNumber(pick(row, ['EffectiveBalance', 'Loan Balance', 'Balance', 'Existing Balance', 'Outstanding Balance']));
  const balanceFromTotal = Math.max(0, Number(total || 0) - Number(totalPaid || 0));
  const loanStatus = pick(row, ['Loan Status', 'LoanStatus']);
  const rowStatus = pick(row, ['Status', 'Account Status']);
  return {
    loan_code: String(pick(row, ['Loan Code', 'LoanCode', 'Loan ID', 'LoanID', 'Loan Ref', 'LoanRef']) || '').trim(),
    customer_code: String(pick(row, ['Customer Code', 'CustomerCode', 'CustCode', 'Client Code', 'ClientCode', 'CCode', 'Code']) || '').trim(),
    collector_name: pick(row, ['Collector', 'Collector Name']),
    loan_type: { '1': 'Reloan', '2': 'Emergency', '3': 'Recon', '4': 'New' }[String(pick(row, ['Loan Type', 'LoanType', 'Type'])).trim()] || pick(row, ['Loan Type', 'LoanType', 'Type']) || 'Good',
    date_released: toDateOnly(pick(row, ['Date Release', 'Date Released', 'DateRelease', 'Release Date', 'Loan Date', 'LoanDate', 'Date'])),
    date_maturity: toDateOnly(pick(row, ['Maturity', 'Maturity Date', 'Date Maturity', 'DateMaturity'])),
    loan_period: toNumber(pick(row, ['Loan Period', 'LoanPeriod', 'Period'])) || 0,
    principal,
    interest_rate: toNumber(pick(row, ['Interest Rate', 'InterestRate', 'Rate'])) || 0,
    total_amortization: total,
    amortization: toNumber(pick(row, ['Payment per day', 'Payment Per Day', 'Daily Payment'])) || 0,
    balance: balanceFromTotal > 0 ? balanceFromTotal : (rawBalance || 0),
    source_loan_status: loanStatus,
    source_row_status: rowStatus,
    source_status: loanStatus || rowStatus,
    import_status: 'active',
  };
}

function mapPayment(row) {
  const sourceStatus = pick(row, ['Payment Status', 'PaymentStatus', 'Status']);
  return {
    loan_code: String(pick(row, ['Loan Code', 'LoanCode', 'Loan Ref', 'LoanRef', 'Loan ID', 'LoanID']) || '').trim(),
    customer_code: String(pick(row, ['Customer Code', 'CustomerCode', 'CustCode', 'Client Code', 'ClientCode', 'CCode', 'Code']) || '').trim(),
    or_number: String(pick(row, ['OR No.', 'OR No', 'OR Number', 'ORNumber', 'Receipt No']) || `JCASH-${pick(row, ['ID']) || 'N/A'}`).trim() || 'N/A',
    date_paid: toDateOnly(pick(row, ['Payment Date', 'Date Paid', 'DatePaid', 'PaymentDate', 'Date'])),
    amount_paid: toNumber(pick(row, ['Good Status Payment', 'PaymentsMade', 'Payments Made', 'TotalPayment', 'Total Payment', 'Amount Paid', 'Payment', 'Payment Amount', 'Amount', 'Amortization'])),
    balance_before: toNumber(pick(row, ['TotalBalance', 'Total Balance', 'Balance Before'])),
    balance_after: toNumber(pick(row, ['NewBalance', 'New Balance', 'Balance After', 'Loan Balance', 'Balance'])),
    source_id: toNumber(pick(row, ['ID'])),
    source_status: sourceStatus,
    import_status: 'active',
    remarks: pick(row, ['Remarks', 'Notes']),
  };
}

function getActualPaymentAmount(payment) {
  const balanceBefore = Number(payment.balance_before || 0);
  const balanceAfter = Number(payment.balance_after || 0);
  const balanceDelta = Number((balanceBefore - balanceAfter).toFixed(2));
  if (balanceBefore > 0 && balanceAfter >= 0 && balanceDelta >= 0) return balanceDelta;
  return Number(payment.amount_paid || Math.max(0, balanceDelta) || 0);
}

function applyLedgerTotals(loans, payments) {
  const paymentsByLoan = new Map();
  for (const payment of payments) {
    if (!paymentsByLoan.has(payment.loan_code)) paymentsByLoan.set(payment.loan_code, []);
    paymentsByLoan.get(payment.loan_code).push(payment);
  }
  for (const loan of loans) {
    const loanPayments = paymentsByLoan.get(loan.loan_code) || [];
    if (!loanPayments.length) continue;
    loanPayments.sort((a, b) => String(a.date_paid || '').localeCompare(String(b.date_paid || '')) || Number(a.source_id || 0) - Number(b.source_id || 0));
    const openingBalance = Math.max(Number(loan.total_amortization || 0), ...loanPayments.map(p => Number(p.balance_before || 0)));
    const latest = loanPayments[loanPayments.length - 1];
    if (openingBalance > 0) loan.total_amortization = openingBalance;
    if (Number(latest.balance_after || 0) >= 0) loan.balance = Number(latest.balance_after || 0);
  }
}

async function scanJcash({ from, to, loanId, password }) {
  const normalizedLoanId = loanId ? validateLoanId(loanId) : null;
  const snapshot = readAccessRows({ from, to, loanId: normalizedLoanId, password });
  const customersByCode = new Map(asArray(snapshot.customers).map(mapCustomer).filter(c => c.customer_code).map(c => [c.customer_code, c]));
  const loans = asArray(snapshot.loans)
    .map(mapLoan)
    .filter(loan => loan.loan_code && loan.customer_code)
    .filter(isMigratableLoan)
    .filter(loan => normalizedLoanId ? loan.loan_code === normalizedLoanId : loan.date_released >= from && loan.date_released <= to);
  const loanCodes = new Set(loans.map(loan => loan.loan_code));
  const payments = asArray(snapshot.payments)
    .map(mapPayment)
    .filter(payment => payment.loan_code && loanCodes.has(payment.loan_code))
    .filter(payment => isGoodStatus(payment.source_status) && !isReversedStatus(payment.source_status))
    .filter(payment => payment.date_paid && getActualPaymentAmount(payment) > 0);
  applyLedgerTotals(loans, payments);

  const existingLoanRows = await dbAll(
    `SELECT loan_code FROM tblLoan WHERE loan_code IN (${loans.map(() => '?').join(',') || "''"})`,
    loans.map(loan => loan.loan_code)
  );
  const existingLoanCodes = new Set(existingLoanRows.map(row => row.loan_code));

  const previewRows = loans.map(loan => {
    const customer = customersByCode.get(loan.customer_code) || mapCustomer({ Code: loan.customer_code });
    const loanPayments = payments.filter(payment => payment.loan_code === loan.loan_code);
    return {
      id: loan.loan_code,
      exists: existingLoanCodes.has(loan.loan_code),
      customer,
      loan,
      payments: loanPayments,
      payment_count: loanPayments.length,
      payment_total: loanPayments.reduce((sum, payment) => sum + getActualPaymentAmount(payment), 0),
    };
  });

  return {
    provider: snapshot.provider,
    source: snapshot.source,
    from,
    to,
    loan_id: normalizedLoanId,
    rows: previewRows,
    summary: {
      loans: previewRows.length,
      customers: new Set(previewRows.map(row => row.loan.customer_code)).size,
      payments: payments.length,
      existing_loans: previewRows.filter(row => row.exists).length,
    },
  };
}

function paymentKey(loanId, datePaid, orNumber, amountPaid) {
  return [loanId, datePaid || '', String(orNumber || '').trim(), Number(amountPaid || 0).toFixed(2)].join('|');
}

async function getOrCreateCollector(collectorName) {
  const name = String(collectorName || '').trim();
  if (!name) return null;
  const existing = await dbGet(
    `SELECT id FROM tblCollector
     WHERE lower(trim(first_name || ' ' || last_name)) = lower(?)
        OR lower(trim(last_name || ', ' || first_name)) = lower(?)
        OR lower(trim(last_name)) = lower(?)
        OR lower(trim(first_name)) = lower(?)
     LIMIT 1`,
    [name, name, name, name]
  );
  if (existing) return existing.id;
  const parts = name.includes(',') ? name.split(',') : name.split(/\s+/);
  const lastName = name.includes(',') ? parts[0].trim() : parts.pop();
  const firstName = name.includes(',') ? parts.slice(1).join(',').trim() : parts.join(' ');
  const count = await dbGet('SELECT COUNT(*) as count FROM tblCollector');
  const code = `MIG-${String((count?.count || 0) + 1).padStart(4, '0')}`;
  const result = await dbRun(
    `INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active) VALUES (?,?,?,?,1)`,
    [code, firstName || '', lastName || name, 1]
  );
  return result.lastID;
}

async function upsertCustomer(customer, collectorId) {
  const existing = await dbGet('SELECT id FROM tblCustomer WHERE customer_code = ?', [customer.customer_code]);
  const cols = [
    'first_name', 'last_name', 'middle_name', 'full_name', 'address', 'contact', 'birth_date', 'civil_status',
    'occupation', 'gender', 'email', 'income_per_month', 'expenses_per_month', 'loan_purpose', 'collateral',
    'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by', 'fb_account', 'nationality',
    'business_name', 'business_type'
  ];
  if (existing) {
    const setClause = cols.map(col => `${col} = COALESCE(?, ${col})`).join(', ');
    await dbRun(`UPDATE tblCustomer SET ${setClause}, collector_id=COALESCE(?, collector_id), updated_at=datetime('now') WHERE id=?`, [...cols.map(col => customer[col] ?? null), collectorId, existing.id]);
    return existing.id;
  }
  const insertCols = ['customer_code', ...cols, 'branch_id', 'collector_id', 'status'];
  const values = [customer.customer_code, ...cols.map(col => customer[col] ?? null), 1, collectorId, 'active'];
  const result = await dbRun(`INSERT INTO tblCustomer (${insertCols.join(',')}) VALUES (${insertCols.map(() => '?').join(',')})`, values);
  return result.lastID;
}

async function upsertLoan(loan, customerId, collectorId) {
  const existing = await dbGet('SELECT id FROM tblLoan WHERE loan_code = ?', [loan.loan_code]);
  const interestAmount = Math.max(0, Number(loan.total_amortization || 0) - Number(loan.principal || 0));
  const total = Number(loan.total_amortization || loan.principal || 0);
  const balance = Number(loan.balance ?? total);
  const totalPaid = Math.max(0, total - balance);
  const values = [
    customerId, collectorId, 1, loan.loan_type || 'Good', loan.principal || 0, loan.interest_rate || 0,
    interestAmount, loan.loan_period || 0, loan.date_released || '1900-01-01', loan.date_maturity, loan.amortization || 0,
    total, loan.principal || 0, balance, totalPaid, 'active', `${IMPORT_REMARK_PREFIX} Good status loan`
  ];
  if (existing) {
    await dbRun(
      `UPDATE tblLoan SET customer_id=?, collector_id=?, branch_id=?, loan_type=?, principal=?, interest_rate=?,
       interest_amount=?, loan_period=?, date_released=?, date_maturity=?, amortization=?, total_amortization=?,
       net_proceeds=?, balance=?, total_paid=?, status=?, remarks=?, updated_at=datetime('now') WHERE id=?`,
      [...values, existing.id]
    );
    return { loanId: existing.id, inserted: false };
  }
  const result = await dbRun(
    `INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
     interest_amount, loan_period, date_released, date_maturity, amortization, total_amortization, net_proceeds,
     balance, total_paid, status, remarks)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [loan.loan_code, ...values]
  );
  return { loanId: result.lastID, inserted: true };
}

async function loadExistingPaymentKeys(loanIds) {
  if (!loanIds.length) return new Set();
  const rows = await dbAll(
    `SELECT loan_id, date_paid, or_number, amount_paid FROM tblPayment WHERE loan_id IN (${loanIds.map(() => '?').join(',')})`,
    loanIds
  );
  return new Set(rows.map(row => paymentKey(row.loan_id, row.date_paid, row.or_number, row.amount_paid)));
}

async function insertPaymentIfMissing(payment, loan, loanId, customerId, collectorId, existingPaymentKeys) {
  const amount = getActualPaymentAmount(payment);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const balanceAfter = payment.balance_after ?? Math.max(0, Number(loan.balance || 0));
  const balanceBefore = payment.balance_before ?? balanceAfter + amount;
  const key = paymentKey(loanId, payment.date_paid, payment.or_number, amount);
  if (existingPaymentKeys.has(key)) return false;
  await dbRun(
    `INSERT INTO tblPayment (loan_id, customer_id, collector_id, or_number, date_paid, amount_paid,
     balance_before, balance_after, payment_type, status, remarks)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [loanId, customerId, collectorId, payment.or_number, payment.date_paid, amount, balanceBefore, balanceAfter, 'regular', 'active', payment.remarks || `${IMPORT_REMARK_PREFIX} payment ledger`]
  );
  existingPaymentKeys.add(key);
  return true;
}

async function migrateSelectedJcash({ from, to, loanId, loanCodes = [], user, password }) {
  if (!Array.isArray(loanCodes) || loanCodes.length === 0) {
    const err = new Error('Select at least one loan to migrate.');
    err.statusCode = 400;
    throw err;
  }
  const normalizedLoanId = loanId ? validateLoanId(loanId) : null;
  const scan = await scanJcash({ from, to, loanId: normalizedLoanId, password });
  const selected = new Set(loanCodes.map(String));
  const rows = scan.rows.filter(row => selected.has(String(row.loan.loan_code)));
  const stats = { customers: 0, loans_inserted: 0, loans_updated: 0, payments_inserted: 0, skipped: loanCodes.length - rows.length };
  const linkedLoans = [];

  await dbRun('BEGIN IMMEDIATE TRANSACTION');
  try {
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_tblPayment_import_key ON tblPayment (loan_id, date_paid, amount_paid, or_number, status)`);
    for (const row of rows) {
      const collectorId = await getOrCreateCollector(row.loan.collector_name || row.customer.collector_name);
      const customerId = await upsertCustomer(row.customer, collectorId);
      const { loanId, inserted } = await upsertLoan(row.loan, customerId, collectorId);
      stats.customers += 1;
      if (inserted) stats.loans_inserted += 1;
      else stats.loans_updated += 1;
      linkedLoans.push({ row, loanId, customerId, collectorId });
    }

    const existingPaymentKeys = await loadExistingPaymentKeys(linkedLoans.map(item => item.loanId));
    for (const linked of linkedLoans) {
      for (const payment of linked.row.payments) {
        const inserted = await insertPaymentIfMissing(payment, linked.row.loan, linked.loanId, linked.customerId, linked.collectorId, existingPaymentKeys);
        if (inserted) stats.payments_inserted += 1;
      }
    }

    await dbRun(
      `INSERT INTO tblLogtime (user_id, username, action, module, details) VALUES (?,?,?,?,?)`,
      [user?.id || null, user?.username || 'system', 'MIGRATE', 'JCASH MIGRATION', normalizedLoanId
        ? `Migrated Loan ID ${normalizedLoanId}: ${stats.loans_inserted} new and ${stats.loans_updated} existing Good loans. Payments inserted: ${stats.payments_inserted}.`
        : `Migrated ${stats.loans_inserted} new and ${stats.loans_updated} existing Good loans from ${from} to ${to}. Payments inserted: ${stats.payments_inserted}.`]
    );
    await dbRun('COMMIT');
    return { ...stats, scanned: scan.summary };
  } catch (err) {
    await dbRun('ROLLBACK').catch(() => {});
    throw err;
  }
}

module.exports = {
  scanJcash,
  migrateSelectedJcash,
  validateDateRange,
  _test: { accessLoanWhere, asArray, isMigratableLoan, validateLoanId },
};
