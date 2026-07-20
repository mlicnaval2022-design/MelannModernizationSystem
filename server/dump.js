const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all('SELECT full_name FROM tblCustomer', [], (err, rows) => {
    if (err) throw err;
    const names = rows.map(r => r.full_name).join('\n');
    fs.writeFileSync('all_customers.txt', names);
    console.log("Dumped " + rows.length + " customers.");
  });
});
