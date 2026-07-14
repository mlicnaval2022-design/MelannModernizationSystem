const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.all(`SELECT id, customer_code, last_name, first_name, status FROM tblCustomer WHERE last_name = 'ABAD' AND first_name = 'GEMMA'`, (err, rows) => {
  if (err) console.error(err.message);
  else {
    console.log('Customer:', rows);
    db.all(`SELECT id, customer_id, status, balance FROM tblLoan WHERE customer_id = ?`, [rows[0].id], (err, loans) => {
      if (err) console.error(err.message);
      else console.log('Loans:', loans);
      db.close();
    });
  }
});
