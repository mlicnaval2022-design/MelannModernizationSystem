const { dbAll } = require('../server/src/db/database');

async function checkReconBalancePayments() {
  const rows = await dbAll(`
    SELECT p.id, p.date_paid, p.customer_id, p.amount_paid, p.balance_before, p.balance_after, p.status, p.payment_type, p.remarks,
           c.customer_code, c.full_name
    FROM tblPayment p
    JOIN tblCustomer c ON p.customer_id = c.id
    WHERE (
      p.remarks LIKE '%Auto-posted old balance during RECON%'
      OR (p.status = 'recon' AND p.remarks LIKE '%Reconstruction balance adjustment%' AND p.balance_after = 0 AND p.amount_paid < 1000)
    )
    ORDER BY p.id ASC
  `);
  console.log(`Found ${rows.length} candidate auto-posted balance payments:`);
  rows.forEach(r => {
    console.log(`ID: ${r.id} | Date: ${r.date_paid} | Cust: ${r.customer_code} ${r.full_name} | Amt: ${r.amount_paid} | Status: ${r.status} | Remarks: "${r.remarks}"`);
  });
}

checkReconBalancePayments().catch(console.error);
