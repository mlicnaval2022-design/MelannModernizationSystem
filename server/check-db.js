const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

db.get("SELECT id, loan_code, date_released, created_at, status, loan_type FROM tblLoan WHERE loan_code = 'LN-049663'", [], (err, row) => {
  if (err) {
    console.error(err);
  } else {
    console.log(row);
  }
});
