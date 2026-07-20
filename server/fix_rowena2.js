const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all(`SELECT id, customer_code, first_name, last_name, full_name, status FROM tblCustomer`, [], (err, customers) => {
    if (err) {
      console.error(err);
      return;
    }
    const servande = customers.filter(c => c.full_name.toUpperCase().includes('SERV'));
    console.log("Customers with SERV:", servande);

    const rowena = customers.filter(c => c.full_name.toUpperCase().includes('ROWENA'));
    console.log("Customers with ROWENA:", rowena.map(r => r.full_name));
  });
});
