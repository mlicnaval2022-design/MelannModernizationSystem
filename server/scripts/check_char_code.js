const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.get("SELECT last_name FROM tblCustomer WHERE last_name LIKE 'ABA%O%'", (err, row) => {
  if (row) {
    console.log(row.last_name);
    for (let i = 0; i < row.last_name.length; i++) {
      console.log(row.last_name[i], row.last_name.charCodeAt(i));
    }
  } else {
    console.log("No row found");
  }
  db.close();
});
