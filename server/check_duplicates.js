const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.all(`
  SELECT 
    TRIM(first_name || ' ' || last_name) as name, 
    COUNT(*) as count, 
    GROUP_CONCAT(id) as ids,
    MIN(id) as primary_id
  FROM tblCollector 
  WHERE collector_code LIKE 'MIG-%' 
  GROUP BY name 
  HAVING count > 1
`, (err, rows) => {
  if (err) throw err;
  console.table(rows);
});
