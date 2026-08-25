const { dbAll, dbRun } = require('../db/database');

async function fixReconBalancePayments() {
  console.log('Running RECON Balance Payments fix...');

  // 1. Update Payment ID 52800 (Alao, Arlyn) specifically
  const alaoPayment = await dbAll(`SELECT * FROM tblPayment WHERE id = 52800`);
  if (alaoPayment.length > 0) {
    console.log('Found Alao, Arlyn payment 52800:', alaoPayment[0]);
    await dbRun(`
      UPDATE tblPayment
      SET status = 'active', payment_type = 'regular', remarks = 'Auto-posted old balance during RECON'
      WHERE id = 52800
    `);
    console.log('Updated Payment 52800 to active regular payment with remarks "Auto-posted old balance during RECON"');
  }

  // 2. Update any other non-reversed auto-posted RECON balance payments
  const otherReconBalances = await dbAll(`
    SELECT * FROM tblPayment
    WHERE remarks LIKE '%Auto-posted old balance during RECON%'
      AND status = 'recon'
  `);
  console.log(`Found ${otherReconBalances.length} other auto-posted RECON balance payments with status 'recon'`);
  
  for (const p of otherReconBalances) {
    await dbRun(`
      UPDATE tblPayment
      SET status = 'active', payment_type = 'regular', remarks = 'Auto-posted old balance during RECON'
      WHERE id = ?
    `, [p.id]);
    console.log(`Updated payment ${p.id} (Cust: ${p.customer_id}, Amt: ${p.amount_paid}) to active`);
  }

  console.log('Recon balance payment fix completed successfully.');
}

fixReconBalancePayments()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error fixing recon balance payments:', err);
    process.exit(1);
  });
