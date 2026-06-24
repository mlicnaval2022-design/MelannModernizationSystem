const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('melann.db');

const sql = `
  UPDATE tblCustomer
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
  WHERE EXISTS (
    SELECT 1
    FROM tblLoan l
    WHERE l.customer_id = tblCustomer.id
      AND l.collector_id IS NOT NULL
  )
`;

db.run(sql, function handleRepair(err) {
  if (err) {
    db.close();
    throw err;
  }
  console.log(`customers_collector_repaired=${this.changes}`);
  db.close();
});
