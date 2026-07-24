const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  db.all('SELECT id, customer_id FROM tblPayment ORDER BY customer_id ASC, date_paid ASC, created_at ASC, id ASC', (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }

    let updates = 0;
    let currentCustomer = null;
    let currentCode = 0;

    const stmt = db.prepare('UPDATE tblPayment SET payment_code = ? WHERE id = ?');

    rows.forEach(row => {
      if (row.customer_id !== currentCustomer) {
        currentCustomer = row.customer_id;
        currentCode = 1;
      } else {
        currentCode++;
      }

      const formattedCode = String(currentCode).padStart(4, '0');
      stmt.run(formattedCode, row.id);
      updates++;
    });

    stmt.finalize();

    db.run('COMMIT', (err) => {
      if (err) console.error(err);
      else console.log(`Successfully migrated ${updates} payment codes!`);
      db.close();
    });
  });
});
