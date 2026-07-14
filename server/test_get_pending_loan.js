const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.get("SELECT id FROM tblLoan WHERE status = 'pending' LIMIT 1", (err, row) => {
  if (err) {
    console.error('ERROR:', err.message);
  } else {
    console.log('Pending loan ID:', row ? row.id : 'None');
  }
  db.close();
});
