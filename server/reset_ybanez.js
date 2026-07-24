const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.run(`UPDATE tblLoan SET status = 'pending' WHERE id = 1597`, (err) => {
  if (err) console.error(err);
  else console.log("Reset YBAÑEZ to pending");
  db.close();
});
