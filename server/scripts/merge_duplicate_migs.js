const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  db.all(`
    SELECT 
      TRIM(first_name || ' ' || last_name) as name, 
      COUNT(*) as count, 
      GROUP_CONCAT(id) as ids,
      MIN(id) as primary_id
    FROM tblCollector 
    WHERE collector_code LIKE 'MIG-%' 
    GROUP BY name 
    HAVING count > 1
  `, (err, rows) => {
    if (err) {
      console.error(err);
      db.run('ROLLBACK');
      return;
    }

    let updateLoan = db.prepare(`UPDATE tblLoan SET collector_id = ? WHERE collector_id = ?`);
    let updatePayment = db.prepare(`UPDATE tblPayment SET collector_id = ? WHERE collector_id = ?`);
    let updateCustomer = db.prepare(`UPDATE tblCustomer SET collector_id = ? WHERE collector_id = ?`);
    let deleteCollector = db.prepare(`DELETE FROM tblCollector WHERE id = ?`);

    let totalMerged = 0;

    rows.forEach(row => {
      const allIds = row.ids.split(',').map(Number);
      const primaryId = row.primary_id;
      const duplicateIds = allIds.filter(id => id !== primaryId);

      duplicateIds.forEach(dupId => {
        updateLoan.run([primaryId, dupId]);
        updatePayment.run([primaryId, dupId]);
        updateCustomer.run([primaryId, dupId]);
        deleteCollector.run([dupId]);
        totalMerged++;
      });

      console.log(`Merged ${duplicateIds.length} duplicates for "${row.name}" into ID ${primaryId}`);
    });

    updateLoan.finalize();
    updatePayment.finalize();
    updateCustomer.finalize();
    deleteCollector.finalize();

    db.run('COMMIT', (err) => {
      if (err) console.error('Commit failed:', err);
      else console.log(`\nSuccessfully merged ${totalMerged} duplicate MIG collectors!`);
      db.close();
    });
  });
});
