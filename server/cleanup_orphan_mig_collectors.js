const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('melann.db');

db.run(
  `DELETE FROM tblCollector
   WHERE collector_code LIKE 'MIG-%'
     AND id NOT IN (
       SELECT DISTINCT collector_id
       FROM tblLoan
       WHERE collector_id IS NOT NULL
     )`,
  function handleResult(err) {
    if (err) {
      db.close();
      throw err;
    }
    console.log(`deleted_orphan_mig_collectors=${this.changes}`);
    db.close();
  }
);
