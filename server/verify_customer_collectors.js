const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('melann.db');

const queries = [
  [
    'summary',
    `SELECT
       COUNT(*) AS customers,
       SUM(CASE WHEN collector_id IS NULL THEN 1 ELSE 0 END) AS unassigned_customers,
       SUM(CASE WHEN collector_id IS NOT NULL THEN 1 ELSE 0 END) AS assigned_customers
     FROM tblCustomer`,
  ],
  [
    'first_page_sample',
    `SELECT c.customer_code, c.full_name, TRIM(co.first_name || ' ' || co.last_name) AS collector_name
     FROM tblCustomer c
     LEFT JOIN tblCollector co ON co.id = c.collector_id
     ORDER BY c.last_name, c.first_name
     LIMIT 10`,
  ],
  [
    'specific_samples',
    `SELECT c.customer_code, c.full_name, TRIM(co.first_name || ' ' || co.last_name) AS collector_name
     FROM tblCustomer c
     LEFT JOIN tblCollector co ON co.id = c.collector_id
     WHERE c.customer_code IN ('3429', '3308', '3457')
     ORDER BY c.customer_code`,
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
