const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM tblPayment WHERE amount_paid = 5 AND status = 'reversed' AND date_paid = '2026-07-17'", [], (err, payments) => {
  if (err) throw err;
  console.log("=== PAYMENTS ===");
  console.log(payments);
  
  if (payments && payments.length > 0) {
    db.get("SELECT * FROM tblLoan WHERE id = ?", [payments[0].loan_id], (err, loan) => {
      console.log("=== LOAN ===");
      console.log(loan);
    });
  }
});
