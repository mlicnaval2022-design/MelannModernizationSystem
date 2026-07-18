const { dbRun, dbGet } = require('./src/db/database');

async function fixAguja() {
  // 1. Delete the auto-posted payment on the old loan
  await dbRun(`DELETE FROM tblPayment WHERE id = 41417`);
  
  // 2. Add 120 back to old loan (1072) balance, subtract from total_paid, ensure status is active
  await dbRun(`UPDATE tblLoan SET balance = balance + 120, total_paid = total_paid - 120, status = 'active' WHERE id = 1072`);
  
  // 3. Set previous_balance = 0 on new loan (1781)
  await dbRun(`UPDATE tblLoan SET previous_balance = 0 WHERE id = 1781`);
  
  console.log("Fixed Aguja Emilia's 120 balance transfer.");
}

fixAguja().catch(console.error);
