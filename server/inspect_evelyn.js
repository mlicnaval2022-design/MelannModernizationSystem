const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'melann.db'));

db.serialize(() => {
  db.get(`SELECT * FROM tblLoan WHERE loan_code = 'LN-20260721-0012'`, (err, loan) => {
    console.log('Evelyn Ando loan:', loan);
  });
});
