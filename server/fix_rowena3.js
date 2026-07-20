const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all(`SELECT id, customer_code, first_name, last_name, full_name, status, created_at FROM tblCustomer ORDER BY id DESC LIMIT 50`, [], (err, customers) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("Recent customers:", customers.map(c => `${c.id}: ${c.full_name} (${c.created_at})`));
  });
});
