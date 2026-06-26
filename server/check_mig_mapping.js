const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.all(`
  SELECT 
    TRIM(first_name || ' ' || last_name) as mig_name, 
    COUNT(DISTINCT l.id) as loans
  FROM tblCollector co
  JOIN tblLoan l ON l.collector_id = co.id
  WHERE co.collector_code LIKE 'MIG-%'
  GROUP BY mig_name
  ORDER BY loans DESC
`, (err, rows) => {
  if (err) throw err;
  console.log('MIG Collectors with loans:');
  console.table(rows);
});

db.all(`
  SELECT id, collector_code, first_name, last_name 
  FROM tblCollector 
  WHERE collector_code NOT LIKE 'MIG-%'
`, (err, rows) => {
  if (err) throw err;
  console.log('\nKnown Collectors:');
  console.table(rows);
});
