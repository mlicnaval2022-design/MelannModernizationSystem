const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('melann.db');

const queries = [
  [
    'mig_summary',
    `SELECT
       COUNT(*) AS mig_collectors,
       SUM(CASE WHEN linked.loans > 0 THEN 1 ELSE 0 END) AS mig_with_loans,
       SUM(CASE WHEN linked.loans = 0 THEN 1 ELSE 0 END) AS mig_orphaned,
       SUM(linked.loans) AS loans_on_mig_collectors
     FROM (
       SELECT co.id, COUNT(l.id) AS loans
       FROM tblCollector co
       LEFT JOIN tblLoan l ON l.collector_id = co.id
       WHERE co.collector_code LIKE 'MIG-%'
       GROUP BY co.id
     ) linked`,
  ],
  [
    'mig_with_loans',
    `SELECT co.collector_code, trim(co.first_name || ' ' || co.last_name) AS collector_name, COUNT(l.id) AS loans
     FROM tblCollector co
     JOIN tblLoan l ON l.collector_id = co.id
     WHERE co.collector_code LIKE 'MIG-%'
     GROUP BY co.id
     ORDER BY loans DESC, co.collector_code
     LIMIT 25`,
  ],
  [
    'known_collectors',
    `SELECT co.collector_code, trim(co.first_name || ' ' || co.last_name) AS collector_name, COUNT(l.id) AS loans
     FROM tblCollector co
     LEFT JOIN tblLoan l ON l.collector_id = co.id
     WHERE co.collector_code NOT LIKE 'MIG-%'
     GROUP BY co.id
     ORDER BY CAST(co.collector_code AS INTEGER)`,
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
