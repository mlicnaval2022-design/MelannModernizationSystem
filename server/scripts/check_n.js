const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');
db.all("SELECT last_name, full_name FROM tblCustomer WHERE last_name LIKE '%O' OR last_name LIKE '%AÑO%' LIMIT 5", (err, rows) => {
  console.log(rows);
});
