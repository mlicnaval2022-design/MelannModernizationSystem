const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS test_undef (id INTEGER PRIMARY KEY, val TEXT)`);
  db.run(`INSERT INTO test_undef (val) VALUES (?)`, [undefined], (err) => {
    if (err) {
      console.error('INSERT ERROR:', err.message);
    } else {
      console.log('INSERT SUCCESS');
    }
  });
});
setTimeout(() => db.close(), 1000);
