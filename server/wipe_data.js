const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const tablesToClear = [
  'tblCustomer',
  'tblLoan',
  'tblAmortizationSchedule',
  'tblPayment',
  'tblCharge',
  'tblBreakdown',
  'tblCreditInvestigation',
  'tblCustomerStatusHistory',
  'tblColl_Data',
  'tblDeposit',
  'tblExpense',
  'tblCashOnHand',
  'tblCashOnBank',
  'tblDailyCashReport',
  'tblGovernmentCompliance',
  'tblGovernmentComplianceAttachment',
  'tblGovernmentComplianceClients',
  'tblCICSubmissionBatch',
  'tblCICSubmissionRecord'
];

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  tablesToClear.forEach(table => {
    db.run(`DELETE FROM ${table}`, function(err) {
      if (err) {
        console.error(`Error clearing table ${table}:`, err.message);
      } else {
        console.log(`Cleared ${this.changes} rows from ${table}`);
      }
    });

    // Reset auto-increment counters
    db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`, function(err) {
        if (err) {
            console.error(`Error resetting sequence for ${table}:`, err.message);
        }
    });
  });

  db.run('COMMIT', (err) => {
    if (err) {
      console.error('Error committing transaction:', err.message);
    } else {
      console.log('Successfully wiped all transactional data.');
    }
    
    // Vacuum the database to reclaim space
    db.run('VACUUM', (err) => {
        if (err) console.error('Error vacuuming database:', err.message);
        else console.log('Database vacuumed successfully.');
        db.close();
    });
  });
});
