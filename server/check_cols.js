const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const tables = process.argv.slice(2);
const targetTables = tables.length ? tables : ['tblCustomer'];

let pending = targetTables.length;
targetTables.forEach((table) => {
  db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
    if (err) console.error(err);
    else {
      console.log(`TABLE ${table}`);
      console.log(rows.map(r => `${r.name}:${r.type}`).join(', '));
    }
    pending -= 1;
    if (pending === 0) db.close();
  });
});
