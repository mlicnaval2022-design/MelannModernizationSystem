const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const columns = ['loan_history', 'business_years', 'no_hardship', 'cb_rating'];

db.serialize(() => {
  for (const col of columns) {
    db.run(`ALTER TABLE tblCreditInvestigation ADD COLUMN ${col} TEXT`, (err) => {
      if (err && err.message.includes('duplicate column name')) {
        console.log(`Column ${col} already exists.`);
      } else if (err) {
        console.error(`Error adding ${col}:`, err.message);
      } else {
        console.log(`Added ${col} column to tblCreditInvestigation.`);
      }
    });
  }
});

setTimeout(() => db.close(), 1000);
