const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');
db.all("SELECT * FROM tblPayment WHERE date_paid LIKE '2026-06-25%'", (err, rows) => {
  console.log(rows);
});
