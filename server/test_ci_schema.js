const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.all("PRAGMA table_info(tblCreditInvestigation);", (err, rows) => {
  if (err) {
    console.error('ERROR:', err.message);
  } else {
    console.log(rows.map(r => r.name).join(', '));
  }
  db.close();
});
