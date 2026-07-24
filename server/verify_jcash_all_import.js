const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('melann.db');

const importedLoanWhere = `l.remarks = 'Imported read-only from jcashdb.mdb full loan ledger'`;
const importedPaymentWhere = `p.remarks = 'Imported read-only from jcashdb.mdb payment ledger' OR p.remarks LIKE '%jcash%'`;

const queries = [
  [
    'full_import_summary',
    `SELECT
       COUNT(*) AS loans,
       COUNT(DISTINCT l.customer_id) AS customers,
       MIN(l.date_released) AS min_date_released,
       MAX(l.date_released) AS max_date_released,
       SUM(CASE WHEN l.status='active' THEN 1 ELSE 0 END) AS active_loans,
       SUM(CASE WHEN l.status='pastdue' THEN 1 ELSE 0 END) AS pastdue_loans,
       SUM(CASE WHEN l.status='fullpaid' THEN 1 ELSE 0 END) AS fullpaid_loans,
       SUM(CASE WHEN l.status='reversed' THEN 1 ELSE 0 END) AS reversed_loans,
       ROUND(SUM(l.principal), 2) AS total_principal,
       ROUND(SUM(l.total_amortization), 2) AS total_loan_amount,
       ROUND(SUM(l.total_paid), 2) AS total_paid,
       ROUND(SUM(l.balance), 2) AS total_balance
     FROM tblLoan l
     WHERE ${importedLoanWhere}`,
  ],
  [
    'payment_alignment',
    `SELECT
       COUNT(p.id) AS payments,
       COUNT(DISTINCT p.loan_id) AS loans_with_payments,
       COUNT(DISTINCT p.customer_id) AS customers_with_payments,
       ROUND(SUM(CASE WHEN p.status='active' THEN p.amount_paid ELSE 0 END), 2) AS active_payment_amount,
       ROUND(SUM(p.amount_paid), 2) AS all_payment_amount,
       SUM(CASE WHEN p.customer_id != l.customer_id THEN 1 ELSE 0 END) AS mismatched_payment_customer,
       SUM(CASE WHEN p.collector_id IS NOT NULL AND l.collector_id IS NOT NULL AND p.collector_id != l.collector_id THEN 1 ELSE 0 END) AS mismatched_payment_collector
     FROM tblPayment p
     JOIN tblLoan l ON l.id = p.loan_id
     WHERE ${importedLoanWhere}
       AND (${importedPaymentWhere})`,
  ],
  [
    'collector_mapping',
    `SELECT
       COUNT(*) AS loans,
       SUM(CASE WHEN l.collector_id IS NULL THEN 1 ELSE 0 END) AS loans_without_collector,
       COUNT(DISTINCT CASE WHEN c.collector_id IS NULL THEN c.id END) AS customers_without_collector
     FROM tblLoan l
     JOIN tblCustomer c ON c.id = l.customer_id
     WHERE ${importedLoanWhere}`,
  ],
  [
    'client_code_shape',
    `SELECT
       COUNT(*) AS clients,
       SUM(CASE WHEN loan_count > 1 THEN 1 ELSE 0 END) AS clients_with_multiple_loans,
       MAX(loan_count) AS max_loans_per_client
     FROM (
       SELECT c.customer_code, COUNT(l.id) AS loan_count
       FROM tblCustomer c
       JOIN tblLoan l ON l.customer_id = c.id
       WHERE ${importedLoanWhere}
       GROUP BY c.id, c.customer_code
     ) grouped`,
  ],
  [
    'sanity_issues',
    `SELECT
       SUM(CASE WHEN l.customer_id IS NULL THEN 1 ELSE 0 END) AS loans_without_customer,
       SUM(CASE WHEN l.loan_code IS NULL OR TRIM(l.loan_code) = '' THEN 1 ELSE 0 END) AS loans_without_loan_code,
       SUM(CASE WHEN l.total_amortization < l.principal THEN 1 ELSE 0 END) AS total_less_than_principal,
       SUM(CASE WHEN l.balance < 0 THEN 1 ELSE 0 END) AS negative_balance,
       SUM(CASE WHEN l.status='fullpaid' AND ROUND(l.balance, 2) <> 0 THEN 1 ELSE 0 END) AS fullpaid_nonzero_balance
     FROM tblLoan l
     WHERE ${importedLoanWhere}`,
  ],
  [
    'sample_clients',
    `SELECT
       c.customer_code,
       c.full_name,
       COUNT(l.id) AS loans,
       GROUP_CONCAT(l.loan_code, ', ') AS loan_codes,
       TRIM(co.first_name || ' ' || co.last_name) AS customer_collector
     FROM tblCustomer c
     JOIN tblLoan l ON l.customer_id = c.id
     LEFT JOIN tblCollector co ON co.id = c.collector_id
     WHERE ${importedLoanWhere}
     GROUP BY c.id
     ORDER BY loans DESC, c.customer_code
     LIMIT 10`,
  ],
];

let index = 0;

function next() {
  if (index >= queries.length) {
    db.close();
    return;
  }

  const [label, sql] = queries[index];
  index += 1;
  db.all(sql, (err, rows) => {
    if (err) {
      db.close();
      throw err;
    }
    console.log(`QUERY ${label}`);
    console.log(JSON.stringify(rows, null, 2));
    next();
  });
}

next();
