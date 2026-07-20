const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, 'melann.db'));

db.serialize(() => {
  db.all('SELECT id, customer_code, full_name FROM tblCustomer WHERE full_name LIKE "S%" AND full_name LIKE "%ROWENA%"', [], (err, rows) => {
    if (err) throw err;
    console.log("S... Rowena:", rows);
  });
});
