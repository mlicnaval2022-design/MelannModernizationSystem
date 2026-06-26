const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  // Update loans assigned to Past Due collectors
  db.run(`
    UPDATE tblLoan
    SET status = 'pastdue'
    WHERE status = 'active'
      AND collector_id IN (
        SELECT id FROM tblCollector 
        WHERE last_name LIKE '%Pastdue%' OR last_name LIKE '%Past due%'
      )
  `, function(err) {
    if (err) console.error(err);
    else console.log(`Updated ${this.changes} loans to 'pastdue' status.`);
  });

  // Update customers assigned to Past Due collectors
  db.run(`
    UPDATE tblCustomer
    SET status = 'pastdue'
    WHERE status = 'active'
      AND id IN (
        SELECT customer_id FROM tblLoan 
        WHERE status = 'pastdue'
      )
  `, function(err) {
    if (err) console.error(err);
    else console.log(`Updated ${this.changes} customers to 'pastdue' status.`);
  });

  db.run('COMMIT', (err) => {
    if (err) console.error('Commit failed:', err);
    else console.log('Successfully fixed pastdue statuses!');
    db.close();
  });
});
