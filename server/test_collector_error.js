const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.run(`UPDATE tblCollector SET first_name=?, last_name=?, branch_id=?, assigned_to=?, is_active=? WHERE id=?`, 
  ['Aldie', 'Rosal', 1, 'ORMOC', 1, 1], 
  (err) => {
    if (err) console.error("PUT ERROR:", err.message);
    else console.log("PUT SUCCESS");

    db.get(`SELECT co.*, b.branch_name FROM tblCollector co LEFT JOIN tblBranch b ON co.branch_id = b.id WHERE co.id = ?`, [1], (err, row) => {
      if (err) console.error("GET ERROR:", err.message);
      else console.log("GET SUCCESS:", row);
      db.close();
    });
  }
);
