const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(err.message);
    return;
  }
  db.all("SELECT * FROM tblCustomer WHERE full_name LIKE '%Servande%'", [], (err, rows) => {
    if (err) {
      throw err;
    }
    console.log(rows);
    db.close();
  });
});
