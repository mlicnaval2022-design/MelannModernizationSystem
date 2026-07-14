const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.run(`ALTER TABLE tblCollector ADD COLUMN assigned_to TEXT`, (err) => {
  if (err && err.message.includes('duplicate column name')) {
    console.log('Column assigned_to already exists.');
  } else if (err) {
    console.error('Error adding assigned_to:', err.message);
  } else {
    console.log('Added assigned_to column to tblCollector.');
  }
  db.close();
});
