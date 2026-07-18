const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, loan_code, customer_id, loan_type, principal, date_released, created_at, dcr_id, status FROM tblLoan WHERE customer_id IN (SELECT id FROM tblCustomer WHERE last_name LIKE '%Aguja%') ORDER BY created_at DESC", [], (err, rows) => {
  if (err) throw err;
  console.log(rows);
});
