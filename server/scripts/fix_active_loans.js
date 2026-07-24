const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.serialize(() => {
  // Check how many loans are currently pastdue vs active
  db.all("SELECT status, COUNT(*) as c FROM tblLoan GROUP BY status", (err, rows) => {
    console.log("Current loan statuses:");
    console.table(rows);
  });

  // Revert loans that were imported from JCash back to 'active'
  db.run(`
    UPDATE tblLoan
    SET status = 'active'
    WHERE status = 'pastdue'
      AND remarks LIKE 'Imported%'
  `, function(err) {
    if (err) console.error(err);
    else console.log(`Reverted ${this.changes} imported loans back to 'active'.`);
  });

  // Also verify again
  db.all("SELECT status, COUNT(*) as c FROM tblLoan GROUP BY status", (err, rows) => {
    console.log("\nNew loan statuses:");
    console.table(rows);
    db.close();
  });
});
