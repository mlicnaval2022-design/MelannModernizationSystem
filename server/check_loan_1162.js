const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, payment_code, date_paid, amount_paid, balance_before, balance_after, status, created_at, reversed_at FROM tblPayment WHERE loan_id = 1162 ORDER BY id DESC LIMIT 10", [], (err, rows) => {
  if (err) throw err;
  console.log(rows);
});
