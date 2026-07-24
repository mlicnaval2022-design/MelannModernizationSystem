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
  'LAUDE JR': 8,
  
  // Unmapped names default to Melann Office
  'SPARE': 9,
  'SEROY': 9,
  'SEROY PAST DUE': 9,
  'NABOTAS': 9,
  'BAEZ': 9,
  'LEE': 9
};

// Start a transaction
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

  Object.entries(MAPPING).forEach(([migName, mappedId]) => {
    updateLoanStmt.run([mappedId, migName], function(err) {
      if (err) console.error(err);
      else console.log(`Mapped loans for ${migName} to ID ${mappedId}: ${this.changes} rows updated`);
    });
    
    updatePaymentStmt.run([mappedId, migName], function(err) {
      if (err) console.error(err);
    });
  });

  updateLoanStmt.finalize();
  updatePaymentStmt.finalize();

  // Repair customer collector_ids based on their latest loan collector_id
  db.run(`
    UPDATE tblCustomer
    SET collector_id = (
      SELECT l.collector_id 
      FROM tblLoan l 
      WHERE l.customer_id = tblCustomer.id 
      ORDER BY l.date_released DESC, l.created_at DESC 
      LIMIT 1
    )
    WHERE collector_id IN (
      SELECT id FROM tblCollector WHERE collector_code LIKE 'MIG-%'
    ) OR collector_id IS NULL
  `, function(err) {
    if (err) console.error(err);
    else console.log(`Repaired customer collector IDs: ${this.changes} rows updated`);
  });

  // Delete the orphaned MIG collectors
  db.run(`
    DELETE FROM tblCollector
    WHERE collector_code LIKE 'MIG-%'
  `, function(err) {
    if (err) console.error(err);
    else console.log(`Deleted orphaned MIG collectors: ${this.changes} rows deleted`);
  });

  db.run('COMMIT', (err) => {
    if (err) console.error('Failed to commit transaction:', err);
    else console.log('Successfully completed mapping transaction.');
    db.close();
  });
});
