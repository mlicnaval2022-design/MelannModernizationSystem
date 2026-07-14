const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.all(`SELECT * FROM tblCustomer WHERE customer_code = '3808'`, (err, rows) => {
  if (err) console.error(err.message);
  else console.log('Code 3808:', rows);
  
  db.all(`SELECT * FROM tblCustomer WHERE full_name LIKE '%ABAD%' AND full_name LIKE '%GEMMA%'`, (err, rows2) => {
    if (err) console.error(err.message);
    else console.log('Gemma:', rows2);
    db.close();
  });
});
