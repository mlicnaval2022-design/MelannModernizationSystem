const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

db.all("PRAGMA table_info(tblPayment)", [], (err, rows) => {
  if (err) throw err;
  console.log(rows);
});
