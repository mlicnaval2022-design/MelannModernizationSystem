const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.run(`ALTER TABLE tblCollector ADD COLUMN supervisor TEXT`, (err) => {
  if (err && err.message.includes('duplicate column name')) {
    console.log('Column supervisor already exists.');
  } else if (err) {
    console.error('Error adding supervisor:', err.message);
  } else {
    console.log('Added supervisor column to tblCollector.');
  }
  db.close();
});
