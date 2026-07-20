const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, 'melann.db'));

db.serialize(() => {
  db.all(`SELECT id, customer_id, loan_code, status, date_released FROM tblLoan ORDER BY id DESC LIMIT 20`, [], (err, loans) => {
    if (err) throw err;
    console.log("Recent loans:", loans);
  });
});
