const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const columns = ['gender', 'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by'];

db.serialize(() => {
  for (const col of columns) {
    db.run(`ALTER TABLE tblCustomer ADD COLUMN ${col} TEXT`, (err) => {
      if (err && err.message.includes('duplicate column name')) {
        console.log(`Column ${col} already exists.`);
      } else if (err) {
        console.error(`Error adding ${col}:`, err.message);
      } else {
        console.log(`Added ${col} column to tblCustomer.`);
      }
    });
  }
});

setTimeout(() => db.close(), 1000);
