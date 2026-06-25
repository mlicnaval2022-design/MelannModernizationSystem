const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.serialize(() => {
  db.all("PRAGMA table_info(tblPayment)", (err, rows) => {
    console.table(rows);
    db.close();
  });
});
