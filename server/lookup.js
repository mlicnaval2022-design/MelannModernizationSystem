const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('melann.db');

// First, find the problematic payments (0001 and 0002)
db.all(
  `SELECT p.id, p.payment_code, p.date_paid, p.amount_paid, p.balance_before, p.balance_after, p.status
   FROM tblPayment p
   WHERE p.loan_id = 1418 AND p.payment_code IS NOT NULL
   ORDER BY p.id DESC`,
  (err, rows) => {
    if (err) return console.error(err);
    console.log('=== SYSTEM-POSTED PAYMENTS (with payment_code) ===');
    for (const r of rows) {
      console.log(JSON.stringify(r));
    }
  }
);

// Also check the very latest payments by ID
db.all(
  `SELECT p.id, p.payment_code, p.loan_id, p.customer_id, p.date_paid, p.amount_paid, p.balance_before, p.balance_after, p.status, p.or_number
   FROM tblPayment p
   WHERE p.customer_id = 1418
   ORDER BY p.id DESC
   LIMIT 30`,
  (err, rows) => {
    if (err) return console.error(err);
    console.log('\n=== ALL 30 LATEST PAYMENTS BY ID ===');
    for (const r of rows) {
      console.log(`  ID:${r.id} | Code:${r.payment_code || 'N/A'} | OR:${r.or_number} | Date:${r.date_paid} | Paid:${r.amount_paid} | ${r.balance_before} -> ${r.balance_after} | ${r.status}`);
    }
  }
);

// Check the highest payment ID in the entire table
db.get(`SELECT MAX(id) as max_id FROM tblPayment`, (err, r) => {
  if (err) return console.error(err);
  console.log(`\nMax payment ID in system: ${r.max_id}`);
});
