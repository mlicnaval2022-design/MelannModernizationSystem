const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DEFAULT_SOURCE = '\\\\SERVERPC\\LendingV2Melan\\db\\jcashdb.mdb';
const DEFAULT_FROM = '2016-01-01';
const DEFAULT_TO = '2026-07-09';
const EXCLUDED_LOAN_STATUS = new Set(['fully paid', 'fullypaid', 'full paid', 'fullpaid', 'paid', 'reverse', 'reversed', 'reversing']);
const REVERSED_STATUS = new Set(['reverse', 'reversed', 'reversing']);
const IMPORT_REMARK_PREFIX = 'Imported read-only from jcashdb.mdb';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const part = process.argv[i];
  if (part.startsWith('--')) {
    const [key, inlineValue] = part.slice(2).split('=');
    const value = inlineValue !== undefined ? inlineValue : process.argv[i + 1];
    args.set(key, value === undefined || value.startsWith('--') ? true : value);
    if (inlineValue === undefined && value !== undefined && !value.startsWith('--')) i += 1;
  }
}

const config = {
  source: args.get('source') || process.env.JCASH_MDB_PATH || DEFAULT_SOURCE,
  password: args.get('password') || process.env.JCASH_MDB_PASSWORD || '',
  dbPath: args.get('db') || process.env.DB_PATH || path.join(__dirname, 'melann.db'),
  from: args.get('from') || DEFAULT_FROM,
  to: args.get('to') || DEFAULT_TO,
  history: Boolean(args.get('history')),
  all: Boolean(args.get('all') || args.get('full')),
  dryRun: Boolean(args.get('dry-run')),
  paymentChunkSize: Number(args.get('payment-chunk-size') || 100000),
};

if (config.all) {
  config.from = args.get('from') || null;
  config.to = args.get('to') || null;
  config.history = false;
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function normalizeCollectorName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getCollectorAlias(value) {
  const name = normalizeCollectorName(value);
  const compact = name.replace(/\s+/g, '');
  const hasPastdue = name.includes('pastdue') || name.includes('past due');

  if (!name) return null;
  if ((name.includes('rosal') || name.includes('aldie')) && hasPastdue) return '10';
  if ((name.includes('torreta') || name.includes('angelito')) && hasPastdue) return '11';
  if ((name.includes('domingono') || name.includes('renato')) && hasPastdue) return '12';
  if ((name.includes('caballes') || name.includes('eddie')) && hasPastdue) return '5';
  if ((name.includes('jugar') || name.includes('noel')) && hasPastdue) return '2';

  if (name.includes('rosal') || name === 'aldie') return '1';
  if (name.includes('torreta') || name === 'angelito') return '3';
  if (name.includes('jugar') || name === 'noel') return '4';
  if (name.includes('caballes') || name === 'eddie') return '6';
  if (name.includes('domingono') || name === 'renato') return '7';
  if (name.includes('laude') || name.includes('reynaldo')) return '8';
  if (name.includes('melann') || name.includes('office')) return '9';
  if (compact.includes('banez') || compact.includes('bañez')) return null;
  return null;
}

function isGoodStatus(value) {
  const status = normalizeStatus(value);
  return status === 'good' || status === 'good status';
}

function notExcludedStatus(value) {
  return !EXCLUDED_LOAN_STATUS.has(normalizeStatus(value));
}

function notReversedStatus(value) {
  return !REVERSED_STATUS.has(normalizeStatus(value));
}

function isFullyPaidStatus(value) {
  const status = normalizeStatus(value).replace(/\s+/g, '');
  return status === 'fullypaid' || status === 'fullpaid' || status === 'paid';
}

function mapSourceLoanStatus(loanStatus, rowStatus, balance) {
  const status = normalizeStatus(loanStatus || rowStatus);
  if (isFullyPaidStatus(loanStatus) || isFullyPaidStatus(rowStatus)) return 'fullpaid';
  if (REVERSED_STATUS.has(status)) return 'reversed';
  if (status.includes('past due') || status.includes('pastdue')) return 'pastdue';
  if (status.includes('reject')) return 'rejected';
  if (status.includes('pending')) return 'pending';
  if (status.includes('approve')) return 'approved';
  if (Number(balance || 0) <= 0 && status) return 'fullpaid';
  return 'active';
}

function accessDateLiteral(isoDate) {
  const [year, month, day] = String(isoDate).split('-');
  return `${month}/${day}/${year}`;
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

function inRange(date, from, to) {
  return Boolean(date && date >= from && date <= to);
}

function pick(row, candidates) {
  const byName = new Map(Object.keys(row).map(key => [normalizeName(key), row[key]]));
  for (const candidate of candidates) {
    const key = normalizeName(candidate);
    if (byName.has(key)) return byName.get(key);
  }
  return null;
}

function detectTable(tables, candidates) {
  const normalizedCandidates = candidates.map(normalizeName);
  return tables.find(table => normalizedCandidates.includes(normalizeName(table.name)))
    || tables.find(table => normalizedCandidates.some(candidate => normalizeName(table.name).includes(candidate)));
}

function readTsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split('\t');
  return lines.slice(1).map(line => {
    const values = line.split('\t');
    const row = {};
    headers.forEach((header, index) => {
      const value = values[index] ?? '';
      row[header] = value === '' ? null : value;
    });
    return row;
  });
}

function parseJsonOutput(result, fallbackMessage) {
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || fallbackMessage);
  }
  const output = String(result.stdout || '').trim();
  const jsonStart = output.lastIndexOf('{');
  return JSON.parse(jsonStart >= 0 ? output.slice(jsonStart) : output);
}

function readAccessAllImportRows() {
  const psString = (value) => `'${String(value || '').replace(/'/g, "''")}'`;
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jcash-all-'));
  const customersFile = path.join(exportDir, 'customers.tsv');
  const loansFile = path.join(exportDir, 'loans.tsv');

  const ps = `
$ErrorActionPreference = 'Stop'
$path = ${psString(config.source)}
$password = ${psString(config.password)}
$customersFile = ${psString(customersFile)}
$loansFile = ${psString(loansFile)}
$providers = @('Microsoft.ACE.OLEDB.16.0','Microsoft.ACE.OLEDB.12.0','Microsoft.Jet.OLEDB.4.0')
$errors = @()
function Format-TsvValue($value) {
  if ($null -eq $value -or $value -is [DBNull]) { return '' }
  if ($value -is [DateTime]) { return $value.ToString('yyyy-MM-dd') }
  return ([string]$value).Replace("\`t", " ").Replace("\`r", " ").Replace("\`n", " ")
}
function Export-AccessQueryTsv($cn, $sql, $file) {
  $cmd = $cn.CreateCommand()
  $cmd.CommandText = $sql
  $reader = $cmd.ExecuteReader()
  $writer = [System.IO.StreamWriter]::new($file, $false, [System.Text.UTF8Encoding]::new($false), 1048576)
  try {
    $headers = New-Object string[] $reader.FieldCount
    for ($i = 0; $i -lt $reader.FieldCount; $i++) { $headers[$i] = $reader.GetName($i) }
    $writer.WriteLine([string]::Join("\`t", $headers))
    while ($reader.Read()) {
      $values = New-Object string[] $reader.FieldCount
      for ($i = 0; $i -lt $reader.FieldCount; $i++) {
        if ($reader.IsDBNull($i)) { $values[$i] = '' }
        else { $values[$i] = Format-TsvValue $reader.GetValue($i) }
      }
      $writer.WriteLine([string]::Join("\`t", $values))
    }
  } finally {
    $writer.Close()
    $reader.Close()
  }
}
foreach ($provider in $providers) {
  try {
    $escapedPassword = $password.Replace("'", "''")
    $connectionString = "Provider=$provider;Data Source=$path;Mode=Read;Persist Security Info=False;"
    if ($password) { $connectionString += "Jet OLEDB:Database Password=$escapedPassword;" }
    $cn = New-Object System.Data.OleDb.OleDbConnection($connectionString)
    $cn.Open()
    Export-AccessQueryTsv $cn "SELECT Code, FirstName, LastName, MiddleInitial, Address, PhoneNumber, Birthday, MaritalStatus, Business, Gender, EmailAddress, Income, Expense, Purpose, Collateral, ID1Type, ID1Number, FBAccount, Nationality, Collector, CollectorCode, CollectorFirstname, Status FROM tblCustomer" $customersFile
    Export-AccessQueryTsv $cn "SELECT LoanID, Code, Collector, CollectorCode, CollectorFname, LoanType, DateRelease, LoanDate, Maturity, Principal, Total, TotalAmortization, LoanTotal, TotalPayment, Balance, InterestRate, LoanPeriod, PaymentPerDay, LoanStatus, Status, Pastdue FROM tblLoan" $loansFile
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = "SELECT MIN(ID), MAX(ID), COUNT(*) FROM tblPayment"
    $reader = $cmd.ExecuteReader()
    $paymentMinId = $null
    $paymentMaxId = $null
    $paymentCount = 0
    if ($reader.Read()) {
      if (-not $reader.IsDBNull(0)) { $paymentMinId = [int]$reader.GetValue(0) }
      if (-not $reader.IsDBNull(1)) { $paymentMaxId = [int]$reader.GetValue(1) }
      if (-not $reader.IsDBNull(2)) { $paymentCount = [int]$reader.GetValue(2) }
    }
    $reader.Close()
    $cn.Close()
    [pscustomobject]@{ provider = $provider; paymentMinId = $paymentMinId; paymentMaxId = $paymentMaxId; paymentCount = $paymentCount } | ConvertTo-Json -Compress
    exit 0
  } catch {
    $errors += ($provider + ': ' + $_.Exception.Message)
  }
}
throw ($errors -join ' | ')
`;

  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  });

  const meta = parseJsonOutput(result, 'Unable to read Access database');
  const snapshot = {
    provider: meta.provider,
    paymentMinId: meta.paymentMinId,
    paymentMaxId: meta.paymentMaxId,
    paymentCount: meta.paymentCount,
    customers: readTsv(customersFile),
    loans: readTsv(loansFile),
    payments: [],
  };

  fs.rmSync(exportDir, { recursive: true, force: true });
  return snapshot;
}

function readAccessPaymentChunk(minId, maxId) {
  const psString = (value) => `'${String(value || '').replace(/'/g, "''")}'`;
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jcash-payments-'));
  const paymentsFile = path.join(exportDir, 'payments.tsv');

  const ps = `
$ErrorActionPreference = 'Stop'
$path = ${psString(config.source)}
$password = ${psString(config.password)}
$paymentsFile = ${psString(paymentsFile)}
$minId = ${Number(minId)}
$maxId = ${Number(maxId)}
$providers = @('Microsoft.ACE.OLEDB.16.0','Microsoft.ACE.OLEDB.12.0','Microsoft.Jet.OLEDB.4.0')
$errors = @()
function Format-TsvValue($value) {
  if ($null -eq $value -or $value -is [DBNull]) { return '' }
  if ($value -is [DateTime]) { return $value.ToString('yyyy-MM-dd') }
  return ([string]$value).Replace("\`t", " ").Replace("\`r", " ").Replace("\`n", " ")
}
function Export-AccessQueryTsv($cn, $sql, $file) {
  $cmd = $cn.CreateCommand()
  $cmd.CommandText = $sql
  $reader = $cmd.ExecuteReader()
  $writer = [System.IO.StreamWriter]::new($file, $false, [System.Text.UTF8Encoding]::new($false), 1048576)
  try {
    $headers = New-Object string[] $reader.FieldCount
    for ($i = 0; $i -lt $reader.FieldCount; $i++) { $headers[$i] = $reader.GetName($i) }
    $writer.WriteLine([string]::Join("\`t", $headers))
    while ($reader.Read()) {
      $values = New-Object string[] $reader.FieldCount
      for ($i = 0; $i -lt $reader.FieldCount; $i++) {
        if ($reader.IsDBNull($i)) { $values[$i] = '' }
        else { $values[$i] = Format-TsvValue $reader.GetValue($i) }
      }
      $writer.WriteLine([string]::Join("\`t", $values))
    }
  } finally {
    $writer.Close()
    $reader.Close()
  }
}
foreach ($provider in $providers) {
  try {
    $escapedPassword = $password.Replace("'", "''")
    $connectionString = "Provider=$provider;Data Source=$path;Mode=Read;Persist Security Info=False;"
    if ($password) { $connectionString += "Jet OLEDB:Database Password=$escapedPassword;" }
    $cn = New-Object System.Data.OleDb.OleDbConnection($connectionString)
    $cn.Open()
    Export-AccessQueryTsv $cn "SELECT ID, LoanID, Code, Date, PaymentsMade, TotalPayment, Amortization, TotalBalance, NewBalance, Status FROM tblPayment WHERE ID >= $minId AND ID <= $maxId" $paymentsFile
    $cn.Close()
    [pscustomobject]@{ provider = $provider } | ConvertTo-Json -Compress
    exit 0
  } catch {
    $errors += ($provider + ': ' + $_.Exception.Message)
  }
}
throw ($errors -join ' | ')
`;

  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  });
  parseJsonOutput(result, 'Unable to read Access payment chunk');
  const payments = readTsv(paymentsFile);
  fs.rmSync(exportDir, { recursive: true, force: true });
  return payments;
}

function readAccessImportRows() {
  if (config.all) return readAccessAllImportRows();

  const psString = (value) => `'${String(value || '').replace(/'/g, "''")}'`;
  const balanceExprFor = (prefix = '') => `IIF(IIF(IsNull(${prefix}Balance),0,${prefix}Balance)>0,IIF(IsNull(${prefix}Balance),0,${prefix}Balance),IIF(IsNull(${prefix}LoanTotal),0,${prefix}LoanTotal)-IIF(IsNull(${prefix}TotalPayment),0,${prefix}TotalPayment))`;
  const balanceExpr = balanceExprFor();
  const fromDate = accessDateLiteral(config.from);
  const toDate = accessDateLiteral(config.to);
  const loanWhereFor = (prefix = '') => {
    if (config.all) return '1=1';
    if (config.history) {
      const fullyPaid = `(${prefix}LoanStatus IN ('Fully Paid','FullyPaid','Full Paid','FullPaid','Paid') OR ${prefix}Status IN ('Fully Paid','FullyPaid','Full Paid','FullPaid','Paid'))`;
      const goodRecent = `(${prefix}DateRelease >= #06/25/2026# AND (${prefix}LoanStatus IN ('Good','Good Status') OR ${prefix}Status IN ('Good','Good Status')))`;
      return `(${fullyPaid} OR ${goodRecent}) AND (IsNull(${prefix}Status) OR ${prefix}Status NOT IN ('Reversed','Reversing')) AND (IsNull(${prefix}LoanStatus) OR ${prefix}LoanStatus NOT IN ('Reversed','Reversing')) AND ${prefix}DateRelease >= #${fromDate}# AND ${prefix}DateRelease <= #${toDate}#`;
    }
    return `${prefix}LoanStatus='Good' AND ${prefix}Status='Good' AND ${prefix}DateRelease >= #${fromDate}# AND ${prefix}DateRelease <= #${toDate}# AND (IsNull(${prefix}Status) OR ${prefix}Status NOT IN ('Fully Paid','FullyPaid','Full Paid','FullPaid','Paid','Reverse','Reversed','Reversing')) AND (IsNull(${prefix}LoanStatus) OR ${prefix}LoanStatus NOT IN ('Fully Paid','FullyPaid','Full Paid','FullPaid','Paid','Reverse','Reversed','Reversing')) AND ${balanceExprFor(prefix)} > 0`;
  };
  const loanWhere = loanWhereFor();
  const queries = {
    loans: `SELECT *, ${balanceExpr} AS EffectiveBalance FROM tblLoan WHERE ${loanWhere}`,
    customers: `SELECT DISTINCT c.* FROM tblCustomer AS c INNER JOIN tblLoan AS l ON c.Code = l.Code WHERE ${loanWhereFor('l.')}`,
  };

  const ps = `
$ErrorActionPreference = 'Stop'
$path = ${psString(config.source)}
$password = ${psString(config.password)}
$queries = @{
  loans = ${psString(queries.loans)}
  customers = ${psString(queries.customers)}
}
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
function Invoke-PaymentBatches($cn, $loanRows) {
  $loanIds = @($loanRows | ForEach-Object { Convert-SqlLiteral $_.LoanID } | Where-Object { $_ })
  $payments = @()
  for ($i = 0; $i -lt $loanIds.Count; $i += 200) {
    $end = [Math]::Min($i + 199, $loanIds.Count - 1)
    $idList = ($loanIds[$i..$end] -join ',')
    $paymentWhere = "LoanID IN ($idList)"
    if (-not ${config.all ? '$true' : '$false'}) { $paymentWhere = "Status='Good' AND " + $paymentWhere }
    $payments += Invoke-AccessQuery $cn ("SELECT * FROM tblPayment WHERE " + $paymentWhere)
  }
  return $payments
}
foreach ($provider in $providers) {
  try {
    $escapedPassword = $password.Replace("'", "''")
    $connectionString = "Provider=$provider;Data Source=$path;Mode=Read;Persist Security Info=False;"
    if ($password) { $connectionString += "Jet OLEDB:Database Password=$escapedPassword;" }
    $cn = New-Object System.Data.OleDb.OleDbConnection($connectionString)
    $cn.Open()
    $loans = Invoke-AccessQuery $cn $queries['loans']
    $customers = Invoke-AccessQuery $cn $queries['customers']
    $payments = Invoke-PaymentBatches $cn $loans
    $result = [ordered]@{
      provider = $provider
      customers = $customers
      loans = $loans
      payments = $payments
    }
    $cn.Close()
    [pscustomobject]$result | ConvertTo-Json -Depth 8 -Compress
    exit 0
  } catch {
    $errors += ($provider + ': ' + $_.Exception.Message)
  }
}
throw ($errors -join ' | ')
`;

  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 512,
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || 'Unable to read Access database');
  }
  return JSON.parse(result.stdout);
}

function mapCustomer(row) {
  const customerCode = String(pick(row, ['Customer Code', 'CustomerCode', 'CustCode', 'Client Code', 'ClientCode', 'CCode', 'Code']) || '').trim();
  const firstName = String(pick(row, ['First Name', 'FirstName', 'FName', 'Given Name']) || '').trim();
  const lastName = String(pick(row, ['Last Name', 'LastName', 'LName', 'Surname']) || '').trim();
  const middleName = String(pick(row, ['Middle Name', 'MiddleName', 'MName', 'MI']) || '').trim();
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
    expenses_per_month: toNumber(pick(row, ['Expense per month', 'Expenses per month', 'Monthly Expense', 'Monthly Expenses'])),
    loan_purpose: pick(row, ['Purpose', 'Loan Purpose']),
    collateral: pick(row, ['Collateral']),
    id_type: pick(row, ['ID1 Type', 'ID Type', 'IDType']),
    id_number: pick(row, ['ID number', 'ID Number', 'ID1 Number', 'IDNo']),
    id_issue_date: toDateOnly(pick(row, ['ID Issue date', 'ID Issue Date', 'ID Issued Date'])),
    id_expiry_date: toDateOnly(pick(row, ['ID Expiry Date', 'ID Expiration Date'])),
    id_issued_by: pick(row, ['ID Issued By', 'Issued By']),
    fb_account: pick(row, ['FB Account', 'Facebook', 'Facebook Account']),
    nationality: pick(row, ['Nationality']),
    business_name: pick(row, ['Business', 'Business Name']),
    business_type: pick(row, ['Business Type', 'Business']),
  };
}

function mapLoan(row) {
  const principal = toNumber(pick(row, ['Principal', 'Loan Principal', 'Amount']));
  const totalCandidates = [
    toNumber(pick(row, ['Total'])),
    toNumber(pick(row, ['TotalAmortization', 'Total Amortization'])),
    toNumber(pick(row, ['LoanTotal', 'Loan Total', 'Total Loan', 'TotalLoan', 'Total Amount', 'Loan Amount'])),
    principal,
  ].filter(value => Number(value || 0) > 0);
  const total = totalCandidates.length > 0 ? Math.max(...totalCandidates) : 0;
  const totalPaid = toNumber(pick(row, ['TotalPayment', 'Total Payment', 'Total Paid']));
  const rawBalance = toNumber(pick(row, ['EffectiveBalance', 'Loan Balance', 'Balance', 'Existing Balance', 'Outstanding Balance']));
  const balanceFromTotal = Math.max(0, Number(total || 0) - Number(totalPaid || 0));
  const loanStatus = pick(row, ['Loan Status', 'LoanStatus']);
  const rowStatus = pick(row, ['Status', 'Account Status']);
  const importStatus = isFullyPaidStatus(loanStatus) || isFullyPaidStatus(rowStatus) ? 'fullpaid' : 'active';
  const balance = importStatus === 'fullpaid' ? 0 : (balanceFromTotal > 0 ? balanceFromTotal : (rawBalance || 0));
  const mappedStatus = config.all ? mapSourceLoanStatus(loanStatus, rowStatus, balance) : importStatus;
  return {
    loan_code: String(pick(row, ['Loan Code', 'LoanCode', 'Loan ID', 'LoanID', 'Loan Ref', 'LoanRef']) || '').trim(),
    customer_code: String(pick(row, ['Customer Code', 'CustomerCode', 'CustCode', 'Client Code', 'ClientCode', 'CCode', 'Code']) || '').trim(),
    collector_name: pick(row, ['Collector', 'Collector Name']),
    loan_type: { '1': 'Reloan', '2': 'Emergency', '3': 'Recon', '4': 'New' }[String(pick(row, ['Loan Type', 'LoanType', 'Type'])).trim()] || pick(row, ['Loan Type', 'LoanType', 'Type']) || 'Good',
    date_released: toDateOnly(pick(row, ['Date Release', 'Date Released', 'DateRelease', 'Release Date', 'Loan Date', 'LoanDate', 'Date'])),
    interest_rate: toNumber(pick(row, ['Interest Rate', 'InterestRate', 'Rate'])),
    amortization: toNumber(pick(row, ['Payment per day', 'Payment Per Day', 'Amortization', 'Daily Payment'])),
    balance,
    legacy_total_payment: totalPaid,
    source_loan_status: loanStatus,
    source_row_status: rowStatus,
    source_status: loanStatus || rowStatus,
    import_status: mappedStatus,
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
    import_status: REVERSED_STATUS.has(normalizeStatus(sourceStatus)) ? 'reversed' : 'active',
    remarks: pick(row, ['Remarks', 'Notes']),
  };
}

function applyLedgerTotals(loans, payments) {
  const paymentsByLoan = new Map();
  for (const payment of payments) {
    if (!paymentsByLoan.has(payment.loan_code)) paymentsByLoan.set(payment.loan_code, []);
    paymentsByLoan.get(payment.loan_code).push(payment);
  }

  for (const loan of loans) {
    const loanPayments = paymentsByLoan.get(loan.loan_code) || [];
    if (loanPayments.length === 0) continue;

    loanPayments.sort((a, b) => {
      const byDate = String(a.date_paid || '').localeCompare(String(b.date_paid || ''));
      return byDate || Number(a.source_id || 0) - Number(b.source_id || 0);
    });

    const openingBalance = Math.max(
      Number(loan.total_amortization || 0),
      ...loanPayments.map(p => Number(p.balance_before || 0))
    );
    const latest = loanPayments[loanPayments.length - 1];
    const latestBalance = Number(latest.balance_after || 0);

    if (openingBalance > 0) loan.total_amortization = openingBalance;
    if (loan.import_status === 'fullpaid') loan.balance = 0;
    else if (latestBalance >= 0) loan.balance = latestBalance;
  }
}

function promisifyDb(db) {
  return {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function callback(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
      });
    },
  };
}

function paymentKey(loanId, datePaid, orNumber, amountPaid) {
  return [
    loanId,
    datePaid || '',
    String(orNumber || '').trim(),
    Number(amountPaid || 0).toFixed(2),
  ].join('|');
}

function getActualPaymentAmount(payment) {
  const balanceBefore = Number(payment.balance_before || 0);
  const balanceAfter = Number(payment.balance_after || 0);
  const balanceDelta = Number((balanceBefore - balanceAfter).toFixed(2));
  if (balanceBefore > 0 && balanceAfter >= 0 && balanceDelta >= 0) {
    return balanceDelta;
  }
  return Number(payment.amount_paid || Math.max(0, balanceDelta) || 0);
}

function chunkArray(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

function backupTargetDb() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${config.dbPath}.before-jcash-${stamp}.bak`;
  fs.copyFileSync(config.dbPath, backupPath);
  return backupPath;
}

async function getOrCreateCollector(sqlite, collectorName) {
  const name = String(collectorName || '').trim();
  if (!name) return null;
  const aliasCode = getCollectorAlias(name);
  if (aliasCode) {
    const aliased = await sqlite.get('SELECT id FROM tblCollector WHERE collector_code = ? LIMIT 1', [aliasCode]);
    if (aliased) return aliased.id;
  }
  const existing = await sqlite.get(
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
  const count = await sqlite.get('SELECT COUNT(*) as count FROM tblCollector');
  const code = `MIG-${String((count?.count || 0) + 1).padStart(4, '0')}`;
  const result = await sqlite.run(
    `INSERT INTO tblCollector (collector_code, first_name, last_name, branch_id, is_active) VALUES (?,?,?,?,1)`,
    [code, firstName || '', lastName || name, 1]
  );
  return result.lastID;
}

async function upsertCustomer(sqlite, customer) {
  const existing = await sqlite.get('SELECT id FROM tblCustomer WHERE customer_code = ?', [customer.customer_code]);
  const cols = [
    'first_name', 'last_name', 'middle_name', 'full_name', 'address', 'contact', 'birth_date', 'civil_status',
    'occupation', 'gender', 'email', 'income_per_month', 'expenses_per_month', 'loan_purpose', 'collateral',
    'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by', 'fb_account', 'nationality',
    'business_name', 'business_type'
  ];

  if (existing) {
    const setClause = cols.map(col => `${col} = COALESCE(?, ${col})`).join(', ');
    await sqlite.run(
      `UPDATE tblCustomer SET ${setClause}, updated_at=datetime('now') WHERE id=?`,
      [...cols.map(col => customer[col] ?? null), existing.id]
    );
    return existing.id;
  }

  const insertCols = ['customer_code', ...cols, 'branch_id', 'status'];
  const placeholders = insertCols.map(() => '?').join(',');
  const values = [customer.customer_code, ...cols.map(col => customer[col] ?? null), 1, config.history ? 'FULLY PAID' : 'active'];
  const result = await sqlite.run(`INSERT INTO tblCustomer (${insertCols.join(',')}) VALUES (${placeholders})`, values);
  return result.lastID;
}

async function upsertLoan(sqlite, loan, customerId, collectorId) {
  const interestAmount = Math.max(0, Number(loan.total_amortization || 0) - Number(loan.principal || 0));
  const total = loan.total_amortization ?? loan.principal ?? 0;
  const balance = loan.import_status === 'fullpaid' ? 0 : (loan.balance ?? total);
  const totalPaid = Math.max(0, Number(total || 0) - Number(balance || 0));
  const dateReleased = loan.date_released || loan.date_maturity || '1900-01-01';
  const existing = await sqlite.get('SELECT id FROM tblLoan WHERE loan_code = ?', [loan.loan_code]);
  const status = loan.import_status || 'active';
  const remarks = config.all
    ? `${IMPORT_REMARK_PREFIX} full loan ledger`
    : status === 'fullpaid'
    ? 'Imported read-only from jcashdb.mdb loan history'
    : 'Imported read-only from jcashdb.mdb Good status loan';
  const values = [
    customerId, collectorId, 1, loan.loan_type || 'Good', loan.principal || 0, loan.interest_rate || 0,
    interestAmount, loan.loan_period || 0, dateReleased, loan.date_maturity, loan.amortization || 0,
    total || 0, loan.principal || 0, balance || 0, totalPaid, status, remarks
  ];

  if (existing) {
    await sqlite.run(
      `UPDATE tblLoan SET customer_id=?, collector_id=?, branch_id=?, loan_type=?, principal=?, interest_rate=?,
       interest_amount=?, loan_period=?, date_released=?, date_maturity=?, amortization=?, total_amortization=?,
       net_proceeds=?, balance=?, total_paid=?, status=?, remarks=?, updated_at=datetime('now') WHERE id=?`,
      [...values, existing.id]
    );
    return existing.id;
  }

  const result = await sqlite.run(
    `INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate,
     interest_amount, loan_period, date_released, date_maturity, amortization, total_amortization, net_proceeds,
     balance, total_paid, status, remarks)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [loan.loan_code, ...values]
  );
  return result.lastID;
}

async function loadExistingPaymentKeys(sqlite, loanIds) {
  const keys = new Set();
  for (const chunk of chunkArray(loanIds, 900)) {
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await sqlite.all(
      `SELECT loan_id, date_paid, or_number, amount_paid
       FROM tblPayment
       WHERE loan_id IN (${placeholders})`,
      chunk
    );
    for (const row of rows) {
      keys.add(paymentKey(row.loan_id, row.date_paid, row.or_number, row.amount_paid));
    }
  }
  return keys;
}

async function insertPaymentIfMissing(sqlite, payment, loan, loanId, customerId, collectorId, existingPaymentKeys) {
  const amount = getActualPaymentAmount(payment);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const balanceAfter = payment.balance_after ?? Math.max(0, Number(loan.balance || 0));
  const balanceBefore = payment.balance_before ?? balanceAfter + amount;
  const key = paymentKey(loanId, payment.date_paid, payment.or_number, amount);
  if (existingPaymentKeys.has(key)) {
    return false;
  }
  await sqlite.run(
    `INSERT INTO tblPayment (loan_id, customer_id, collector_id, or_number, date_paid, amount_paid,
     balance_before, balance_after, payment_type, status, remarks)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [loanId, customerId, collectorId, payment.or_number, payment.date_paid, amount, balanceBefore, balanceAfter, 'regular', payment.import_status || 'active', payment.remarks || `${IMPORT_REMARK_PREFIX} payment ledger`]
  );
  existingPaymentKeys.add(key);
  return true;
}

async function repairCustomerCollector(sqlite, customerId) {
  await sqlite.run(
    `UPDATE tblCustomer
     SET collector_id = (
       SELECT l.collector_id
       FROM tblLoan l
       WHERE l.customer_id = tblCustomer.id
         AND l.collector_id IS NOT NULL
       ORDER BY
         CASE WHEN l.status IN ('active', 'pastdue') THEN 0 ELSE 1 END,
         COALESCE(l.date_released, l.created_at) DESC,
         l.id DESC
       LIMIT 1
     ),
     updated_at = datetime('now')
     WHERE id = ?
       AND EXISTS (
         SELECT 1 FROM tblLoan l
         WHERE l.customer_id = tblCustomer.id
           AND l.collector_id IS NOT NULL
       )`,
    [customerId]
  );
}

async function main() {
  console.log(`Reading Access source in read-only mode: ${config.source}`);
  const snapshot = readAccessImportRows();
  console.log(`Access provider: ${snapshot.provider}`);
  console.log(`Source rows: customers=${snapshot.customers.length}, loans=${snapshot.loans.length}, payments=${config.all ? snapshot.paymentCount || 0 : snapshot.payments.length}`);
  if (config.all) console.log('Import mode: ALL loans and ALL payments linked by source LoanID/Client Code');

  const customersByCode = new Map(snapshot.customers.map(mapCustomer).filter(c => c.customer_code).map(c => [c.customer_code, c]));
  const loans = snapshot.loans
    .map(mapLoan)
    .filter(loan => loan.loan_code && loan.customer_code)
    .filter(loan => {
      if (config.all) return true;
      if (config.history) {
        const fullyPaid = isFullyPaidStatus(loan.source_loan_status) || isFullyPaidStatus(loan.source_row_status);
        const goodRecent = loan.date_released >= '2026-06-25' && (isGoodStatus(loan.source_loan_status) || isGoodStatus(loan.source_row_status));
        return (fullyPaid || goodRecent)
          && notReversedStatus(loan.source_loan_status)
          && notReversedStatus(loan.source_row_status);
      }
      return isGoodStatus(loan.source_status) && notExcludedStatus(loan.source_status) && Number(loan.balance || 0) > 0;
    })
    .filter(loan => config.all || inRange(loan.date_released, config.from, config.to));

  const loanCodes = new Set(loans.map(loan => loan.loan_code));
  const payments = config.all ? [] : snapshot.payments
    .map(mapPayment)
    .filter(payment => payment.loan_code && loanCodes.has(payment.loan_code))
    .filter(payment => isGoodStatus(payment.source_status) && notReversedStatus(payment.source_status))
    .filter(payment => payment.date_paid && getActualPaymentAmount(payment) > 0);
  if (!config.all) applyLedgerTotals(loans, payments);

  console.log(`Matched customers: ${new Set(loans.map(l => l.customer_code)).size}`);
  console.log(`Matched ${config.all ? 'all source' : config.history ? 'loan-history' : 'Good active'} loans${config.all ? '' : ` with date released ${config.from}..${config.to}`}: ${loans.length}`);
  console.log(config.all
    ? `Source payment rows available for chunked import: ${snapshot.paymentCount || 0}`
    : `Matched Good payments for those loans: ${payments.length}`);
  if (config.dryRun) return;

  const backupPath = backupTargetDb();
  console.log(`Target backup created: ${backupPath}`);

  const db = new sqlite3.Database(config.dbPath);
  const sqlite = promisifyDb(db);
  const stats = { customers: 0, loans: 0, payments: 0, skippedMissingCustomer: 0, existingLoansUpdated: 0 };
  const loanIdByCode = new Map();
  const loanByCode = new Map(loans.map(loan => [loan.loan_code, loan]));
  const touchedCustomerIds = new Set();

  try {
    await sqlite.run('BEGIN TRANSACTION');
    await sqlite.run(`CREATE INDEX IF NOT EXISTS idx_tblPayment_import_key ON tblPayment (loan_id, date_paid, amount_paid, or_number, status)`);
    for (const loan of loans) {
      const existingLoan = await sqlite.get('SELECT id FROM tblLoan WHERE loan_code = ?', [loan.loan_code]);
      const customer = customersByCode.get(loan.customer_code);
      if (!customer) {
        stats.skippedMissingCustomer += 1;
        continue;
      }
      const collectorId = await getOrCreateCollector(sqlite, loan.collector_name || customer.collector_name);
      const customerId = await upsertCustomer(sqlite, customer);
      const loanId = await upsertLoan(sqlite, loan, customerId, collectorId);
      touchedCustomerIds.add(customerId);
      loanIdByCode.set(loan.loan_code, { loanId, customerId, collectorId });
      stats.customers += 1;
      if (existingLoan) stats.existingLoansUpdated += 1;
      else stats.loans += 1;
    }

    for (const customerId of touchedCustomerIds) {
      await repairCustomerCollector(sqlite, customerId);
    }

    const existingPaymentKeys = await loadExistingPaymentKeys(sqlite, Array.from(loanIdByCode.values()).map(linked => linked.loanId));
    if (config.all) {
      const minId = Number(snapshot.paymentMinId || 0);
      const maxId = Number(snapshot.paymentMaxId || 0);
      const chunkSize = Number(config.paymentChunkSize || 100000);
      for (let startId = minId; startId <= maxId; startId += chunkSize) {
        const endId = Math.min(startId + chunkSize - 1, maxId);
        const chunkPayments = readAccessPaymentChunk(startId, endId)
          .map(mapPayment)
          .filter(payment => payment.loan_code && loanCodes.has(payment.loan_code))
          .filter(payment => payment.date_paid && getActualPaymentAmount(payment) > 0);

        let chunkInserted = 0;
        for (const payment of chunkPayments) {
          const linked = loanIdByCode.get(payment.loan_code);
          if (!linked) continue;
          const inserted = await insertPaymentIfMissing(sqlite, payment, loanByCode.get(payment.loan_code), linked.loanId, linked.customerId, linked.collectorId, existingPaymentKeys);
          if (inserted) {
            stats.payments += 1;
            chunkInserted += 1;
          }
        }
        console.log(`Payment chunk ${startId}-${endId}: matched=${chunkPayments.length}; inserted=${chunkInserted}; total_inserted=${stats.payments}`);
      }
    } else {
      for (const payment of payments) {
        const linked = loanIdByCode.get(payment.loan_code);
        if (!linked) continue;
        const inserted = await insertPaymentIfMissing(sqlite, payment, loanByCode.get(payment.loan_code), linked.loanId, linked.customerId, linked.collectorId, existingPaymentKeys);
        if (inserted) stats.payments += 1;
      }
    }

    await sqlite.run('COMMIT');
    console.log(`Import complete. Customers upserted: ${stats.customers}; loans inserted: ${stats.loans}; existing loans updated: ${stats.existingLoansUpdated}; payments inserted: ${stats.payments}; loans skipped missing customer: ${stats.skippedMissingCustomer}`);
  } catch (err) {
    await sqlite.run('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
