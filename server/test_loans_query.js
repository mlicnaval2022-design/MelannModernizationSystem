const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.all(`SELECT l.*, c.full_name as customer_name, c.customer_code FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id WHERE l.collector_id = ? AND l.status = 'active' ORDER BY c.full_name ASC`, [1], (err, rows) => {
  if (err) console.error("GET ERROR:", err.message);
  else console.log("GET SUCCESS length:", rows.length);
  db.close();
});
