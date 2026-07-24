const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');
db.all(`SELECT id, customer_code, last_name, first_name, status FROM tblCustomer WHERE last_name = 'ABAD'`, (err, rows) => {
  if (err) console.error(err.message);
  else console.log(rows);
});
db.close();
