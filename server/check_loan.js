const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, 'melann.db'));
db.get("SELECT * FROM tblLoan WHERE loan_code = 'LN-049717'", (err, row) => console.log(row));
