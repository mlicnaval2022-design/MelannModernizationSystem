const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const MAPPING = {
  'RENATO PAST DUE': 12,
  'ANGELITO': 3,
  'TORRETA': 3,
  'CABALLES': 6,
  'ROSAL PASTDUE': 10,
  'LAUDE': 8,
  'ROSAL': 1,
  'DOMINGONO': 7,
  'EDDIE': 6,
  'NOEL': 4,
  'JUGAR': 4,
  'MELANN': 9,
  'REYNALDO': 8,
  'LAUDE JR': 8
  // Notice: SPARE, SEROY, NABOTAS, BAEZ, LEE are NOT mapped because they are clients/unknown
};

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  let updateLoanStmt = db.prepare(`
    UPDATE tblLoan
    SET collector_id = ?
    WHERE collector_id IN (
      SELECT id FROM tblCollector 
      WHERE collector_code LIKE 'MIG-%' 
      AND TRIM(first_name || ' ' || last_name) = ?
    )
  `);

  let updatePaymentStmt = db.prepare(`
    UPDATE tblPayment
    SET collector_id = ?
    WHERE collector_id IN (
      SELECT id FROM tblCollector 
      WHERE collector_code LIKE 'MIG-%' 
      AND TRIM(first_name || ' ' || last_name) = ?
    )
  `);

  let deleteCollectorStmt = db.prepare(`
    DELETE FROM tblCollector
    WHERE collector_code LIKE 'MIG-%' 
    AND TRIM(first_name || ' ' || last_name) = ?
  `);

  Object.entries(MAPPING).forEach(([migName, mappedId]) => {
    updateLoanStmt.run([mappedId, migName], function(err) {
      if (err) console.error(err);
      else console.log(`Mapped loans for ${migName} to ID ${mappedId}: ${this.changes} rows updated`);
    });
    
    updatePaymentStmt.run([mappedId, migName], function(err) {
      if (err) console.error(err);
    });

    deleteCollectorStmt.run([migName], function(err) {
      if (err) console.error(err);
    });
  });

  updateLoanStmt.finalize();
  updatePaymentStmt.finalize();
  deleteCollectorStmt.finalize();

  db.run('COMMIT', (err) => {
    if (err) console.error('Failed to commit transaction:', err);
    else console.log('Successfully completed mapping transaction.');
    db.close();
  });
});
