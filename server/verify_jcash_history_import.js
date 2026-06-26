const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('melann.db');

const importedLoanWhere = `
  l.remarks = 'Imported read-only from jcashdb.mdb loan history'
  OR (
    l.remarks = 'Imported read-only from jcashdb.mdb Good status loan'
    AND l.date_released BETWEEN '2026-06-25' AND '2026-06-26'
  )
`;

const queries = [
  [
    'imported_history_summary',
    `SELECT
       COUNT(*) AS loans,
       COUNT(DISTINCT customer_id) AS customers,
       MIN(date_released) AS min_date_released,
       MAX(date_released) AS max_date_released,
       SUM(CASE WHEN status='fullpaid' THEN 1 ELSE 0 END) AS fullpaid_loans,
       SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_good_loans,
       ROUND(SUM(total_amortization), 2) AS total_loan_amount,
       ROUND(SUM(total_paid), 2) AS total_paid,
       ROUND(SUM(balance), 2) AS total_balance
     FROM tblLoan l
     WHERE ${importedLoanWhere}`,
  ],
  [
    'linked_payment_summary',
    `SELECT
       COUNT(*) AS payments,
       ROUND(SUM(p.amount_paid), 2) AS total_payment_amount,
       COUNT(DISTINCT p.loan_id) AS loans_with_payments
     FROM tblPayment p
     JOIN tblLoan l ON l.id = p.loan_id
     WHERE (${importedLoanWhere})
       AND p.status='active'`,
  ],
  [
    'sanity_issues',
    `SELECT
       SUM(CASE WHEN l.date_released < '2024-01-01' OR l.date_released > '2026-06-26' THEN 1 ELSE 0 END) AS out_of_release_range,
       SUM(CASE WHEN l.total_amortization < l.principal THEN 1 ELSE 0 END) AS total_less_than_principal,
       SUM(CASE WHEN l.total_amortization <= 0 THEN 1 ELSE 0 END) AS missing_total_loan,
       SUM(CASE WHEN l.balance < 0 THEN 1 ELSE 0 END) AS negative_balance,
       SUM(CASE WHEN l.status='fullpaid' AND ROUND(l.balance, 2) <> 0 THEN 1 ELSE 0 END) AS fullpaid_nonzero_balance
     FROM tblLoan l
     WHERE ${importedLoanWhere}`,
  ],
  [
    'collector_mapping',
    `SELECT
       SUM(CASE WHEN l.collector_id IS NULL THEN 1 ELSE 0 END) AS loans_without_collector,
       COUNT(DISTINCT CASE WHEN c.collector_id IS NULL THEN c.id END) AS customers_without_collector,
       COUNT(*) AS loans
     FROM tblLoan l
     JOIN tblCustomer c ON c.id = l.customer_id
     WHERE ${importedLoanWhere}`,
  ],
  [
    'sample_3429',
    `SELECT
       c.customer_code,
       c.full_name,
       l.loan_code,
       l.status,
       l.date_released,
       l.date_maturity,
       l.principal,
       l.interest_amount,
       l.total_amortization AS loan_total,
       l.balance,
       l.amortization,
       COUNT(p.id) AS payments
     FROM tblCustomer c
     JOIN tblLoan l ON l.customer_id = c.id
     LEFT JOIN tblPayment p ON p.loan_id = l.id AND p.status='active'
     WHERE c.customer_code = '3429'
       AND (${importedLoanWhere})
     GROUP BY l.id
     ORDER BY l.date_released DESC, l.loan_code DESC
     LIMIT 10`,
  ],
  [
    'latest_samples',
    `SELECT
       c.customer_code,
       c.full_name,
       l.loan_code,
       l.status,
       l.date_released,
       l.total_amortization AS loan_total,
       l.balance,
       COUNT(p.id) AS payments
     FROM tblLoan l
     JOIN tblCustomer c ON c.id = l.customer_id
     LEFT JOIN tblPayment p ON p.loan_id = l.id AND p.status='active'
     WHERE ${importedLoanWhere}
     GROUP BY l.id
     ORDER BY l.date_released DESC, l.loan_code DESC
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
