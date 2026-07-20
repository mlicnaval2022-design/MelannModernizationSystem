const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

db.get("SELECT * FROM tblLoan WHERE principal = 13000 AND date_released = '2026-06-04'", [], (err, loan) => {
  if (err) throw err;
  console.log("=== LOAN ===");
  console.log(loan);

  if (loan) {
    db.all("SELECT * FROM tblPayment WHERE loan_id = ? ORDER BY date_paid DESC LIMIT 5", [loan.id], (err, payments) => {
      console.log("=== PAYMENTS ===");
      console.log(payments);
    });
  }
});
