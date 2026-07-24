const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');
db.serialize(() => {
  db.run("ALTER TABLE tblLoan ADD COLUMN previous_balance REAL DEFAULT 0", function(err) {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('Column already exists');
      } else {
        console.error(err);
      }
    } else {
      console.log('Column added successfully');
    }
  });
  db.run("ALTER TABLE tblLoan ADD COLUMN penalty_charge REAL DEFAULT 0", function(err) {});
  db.run("ALTER TABLE tblLoan ADD COLUMN passbook_charge REAL DEFAULT 0", function(err) {});
});
db.close();
