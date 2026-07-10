const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('melann.db');

const importedLoanWhere = `remarks = 'Imported read-only from jcashdb.mdb Good status loan'`;
const importedPaymentWhere = `remarks = 'Imported read-only from jcashdb.mdb payment ledger'`;

const queries = [
  [
    'active_import_summary',
    `SELECT
       COUNT(*) AS loans,
       COUNT(DISTINCT customer_id) AS customers,
       MIN(date_released) AS min_release,
       MAX(date_released) AS max_release,
       ROUND(SUM(balance), 2) AS total_balance
     FROM tblLoan
     WHERE ${importedLoanWhere}`,
  ],
  [
    'loan_sanity',
    `SELECT
       SUM(CASE WHEN date_released < '2016-01-01' OR date_released > '2026-07-09' THEN 1 ELSE 0 END) AS out_of_range,
       SUM(CASE WHEN balance <= 0 THEN 1 ELSE 0 END) AS non_positive_balance,
       SUM(CASE WHEN lower(status) IN ('fully paid','fullypaid','fullpaid','paid','reverse','reversed','reversing') THEN 1 ELSE 0 END) AS excluded_status
     FROM tblLoan
     WHERE ${importedLoanWhere}`,
  ],
  [
    'payment_alignment',
    `SELECT
       COUNT(*) AS payments,
       COUNT(DISTINCT loan_id) AS loans_with_payments,
       ROUND(SUM(amount_paid), 2) AS total_paid,
       SUM(CASE WHEN lower(status) IN ('reverse','reversed','reversing') THEN 1 ELSE 0 END) AS reversed_payments,
       SUM(CASE WHEN customer_id != (SELECT l.customer_id FROM tblLoan l WHERE l.id = tblPayment.loan_id) THEN 1 ELSE 0 END) AS mismatched_customer
     FROM tblPayment
     WHERE ${importedPaymentWhere}`,
  ],
  [
    'orphan_payments',
    `SELECT COUNT(*) AS orphan_payments
     FROM tblPayment p
     LEFT JOIN tblLoan l ON l.id = p.loan_id
     WHERE p.${importedPaymentWhere}
       AND l.id IS NULL`,
  ],
  [
    'collector_mapping',
    `SELECT
       COUNT(*) AS loans,
       SUM(CASE WHEN collector_id IS NULL THEN 1 ELSE 0 END) AS loans_without_collector,
       COUNT(DISTINCT collector_id) AS collectors_used
     FROM tblLoan
     WHERE ${importedLoanWhere}`,
  ],
  [
    'customer_collector_mapping',
    `SELECT
       COUNT(DISTINCT c.id) AS customers,
       COUNT(DISTINCT CASE WHEN c.collector_id IS NULL THEN c.id END) AS customers_without_collector
     FROM tblCustomer c
     JOIN tblLoan l ON l.customer_id = c.id
     WHERE l.${importedLoanWhere}`,
  ],
  [
    'payment_collector_alignment',
    `SELECT
       COUNT(*) AS payments,
       SUM(CASE WHEN p.collector_id IS NULL THEN 1 ELSE 0 END) AS payments_without_collector,
       SUM(CASE WHEN p.collector_id IS NOT NULL AND l.collector_id IS NOT NULL AND p.collector_id != l.collector_id THEN 1 ELSE 0 END) AS mismatched_payment_collector
     FROM tblPayment p
     JOIN tblLoan l ON l.id = p.loan_id
     WHERE p.${importedPaymentWhere}`,
  ],
  [
    'sample_collectors',
    `SELECT
       co.collector_code,
       TRIM(co.first_name || ' ' || co.last_name) AS collector_name,
       COUNT(l.id) AS loans
     FROM tblLoan l
     LEFT JOIN tblCollector co ON co.id = l.collector_id
     WHERE l.${importedLoanWhere}
     GROUP BY co.id
     ORDER BY loans DESC
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
