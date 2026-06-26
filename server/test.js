const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');
db.get("SELECT id, customer_id, principal FROM tblLoan WHERE status = 'active' LIMIT 1", (err, row) => console.log(row));
