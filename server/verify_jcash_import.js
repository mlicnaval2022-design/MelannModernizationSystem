const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('melann.db');

const queries = [
  [
    'imported_customers',
    `SELECT COUNT(*) AS count
     FROM tblCustomer
     WHERE customer_code IN (
       SELECT DISTINCT c.customer_code
       FROM tblCustomer c
       JOIN tblLoan l ON l.customer_id = c.id
       WHERE l.remarks LIKE 'Imported read-only from jcashdb.mdb%'
     )`,
  ],
  [
    'imported_loans',
    `SELECT COUNT(*) AS count, ROUND(SUM(balance), 2) AS total_balance
     FROM tblLoan
     WHERE remarks LIKE 'Imported read-only from jcashdb.mdb%'`,
  ],
  [
    'imported_payments',
    `SELECT COUNT(*) AS count, ROUND(SUM(amount_paid), 2) AS total_paid
     FROM tblPayment
     WHERE remarks = 'Imported Good status payment'`,
  ],
  [
    'sample',
    `SELECT c.customer_code, c.full_name, l.loan_code, l.date_maturity, l.balance, l.status,
       (SELECT COUNT(*) FROM tblPayment p WHERE p.loan_id = l.id) AS payments
     FROM tblLoan l
     JOIN tblCustomer c ON c.id = l.customer_id
     WHERE l.remarks LIKE 'Imported read-only from jcashdb.mdb%'
     ORDER BY l.id DESC
     LIMIT 5`,
  ],
  [
    'abad_gemma_39123',
    `SELECT c.customer_code, c.full_name, l.loan_code, l.principal, l.total_amortization AS total_loan,
       l.balance, l.total_paid, l.date_released, l.date_maturity,
       (SELECT COUNT(*) FROM tblPayment p WHERE p.loan_id = l.id) AS payments,
       (SELECT p.balance_after FROM tblPayment p WHERE p.loan_id = l.id ORDER BY p.date_paid DESC, p.id DESC LIMIT 1) AS latest_payment_balance_after
     FROM tblLoan l
     JOIN tblCustomer c ON c.id = l.customer_id
     WHERE c.customer_code = '3308' AND l.loan_code = '39123'`,
  ],
  [
    'siaboc_ma_teresa_49323',
    `SELECT c.customer_code, c.full_name, l.loan_code, l.principal, l.total_amortization AS total_loan,
       l.balance, l.total_paid, l.date_released, l.date_maturity,
       (SELECT COUNT(*) FROM tblPayment p WHERE p.loan_id = l.id) AS payments
     FROM tblLoan l
     JOIN tblCustomer c ON c.id = l.customer_id
     WHERE c.customer_code = '3457' AND l.loan_code = '49323'`,
  ],
  [
    'sanity_totals',
    `SELECT
       SUM(CASE WHEN total_amortization < balance THEN 1 ELSE 0 END) AS total_less_than_balance,
       SUM(CASE WHEN total_amortization <= 0 THEN 1 ELSE 0 END) AS missing_total_loan,
       SUM(CASE WHEN balance < 0 THEN 1 ELSE 0 END) AS negative_balance
     FROM tblLoan
     WHERE remarks LIKE 'Imported read-only from jcashdb.mdb%'`,
  ],
  [
    'sanity_total_less_than_balance_rows',
    `SELECT c.customer_code, c.full_name, l.loan_code, l.principal, l.total_amortization AS total_loan,
       l.balance, l.total_paid, l.date_released, l.date_maturity
     FROM tblLoan l
     JOIN tblCustomer c ON c.id = l.customer_id
     WHERE l.remarks LIKE 'Imported read-only from jcashdb.mdb%'
       AND l.total_amortization < l.balance`,
  ],
];

let index = 0;

function runNext() {
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
    console.log(JSON.stringify(rows));
    runNext();
  });
}

runNext();
