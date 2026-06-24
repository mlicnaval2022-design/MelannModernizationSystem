const sqlite3 = require('sqlite3').verbose();

const code = process.argv[2] || 'MIG-0013';
const db = new sqlite3.Database('melann.db');

const queries = [
  [
    'all_mig_collectors',
    `SELECT co.collector_code, co.first_name, co.last_name, COUNT(l.id) AS loans
     FROM tblCollector co
     LEFT JOIN tblLoan l ON l.collector_id = co.id
     WHERE co.collector_code LIKE 'MIG-%'
     GROUP BY co.id
     ORDER BY co.collector_code`,
    [],
  ],
  ['collector', `SELECT * FROM tblCollector WHERE collector_code = ?`, [code]],
  [
    'linked_loans',
    `SELECT l.loan_code, c.customer_code, c.full_name, l.loan_type, l.date_released, l.date_maturity, l.principal, l.total_amortization, l.balance
     FROM tblLoan l
     JOIN tblCustomer c ON c.id = l.customer_id
     JOIN tblCollector co ON co.id = l.collector_id
     WHERE co.collector_code = ?
     ORDER BY l.date_released DESC, l.loan_code DESC
     LIMIT 25`,
    [code],
  ],
  [
    'linked_count',
    `SELECT COUNT(*) AS loans
     FROM tblLoan l
     JOIN tblCollector co ON co.id = l.collector_id
     WHERE co.collector_code = ?`,
    [code],
  ],
];

let index = 0;
function next() {
  if (index >= queries.length) {
    db.close();
    return;
  }
  const [label, sql, params] = queries[index];
  index += 1;
  db.all(sql, params, (err, rows) => {
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
