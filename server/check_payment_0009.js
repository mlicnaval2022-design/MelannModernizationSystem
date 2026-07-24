const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

db.get("SELECT * FROM tblPayment WHERE payment_code = '0009' AND date_paid = '2026-07-17'", [], (err, payment) => {
  if (err) throw err;
  console.log("=== PAYMENT 0009 ===");
  console.log(payment);
  
  if (payment) {
    db.get("SELECT * FROM tblLoan WHERE id = ?", [payment.loan_id], (err, loan) => {
      console.log("=== LOAN ===");
      console.log(loan);
    });
  }
});
