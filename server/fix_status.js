const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const fixStatuses = async () => {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE tblCustomer 
      SET status = 'active'
      WHERE id IN (
        SELECT customer_id FROM tblLoan WHERE status IN ('active', 'pastdue')
      ) AND status = 'FULLY PAID'
    `, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

fixStatuses().then(changes => {
  console.log('Fixed', changes, 'customers');
  db.close();
}).catch(err => {
  console.error(err);
  db.close();
});
