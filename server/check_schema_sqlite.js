const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.all("SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('tblCustomer', 'tblLoan', 'tblBranch');", (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    rows.forEach(r => console.log(`Table: ${r.name}\nSQL: ${r.sql}\n`));
  }
  db.close();
});
