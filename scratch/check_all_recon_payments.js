const { dbAll } = require('../server/src/db/database');

async function run() {
  const payments = await dbAll(`
    SELECT p.*, l.loan_code, l.loan_type as current_loan_type, c.customer_code, c.full_name
    FROM tblPayment p
    JOIN tblCustomer c ON p.customer_id = c.id
    LEFT JOIN tblLoan l ON p.loan_id = l.id
    WHERE p.status = 'recon' OR p.payment_type = 'recon' OR p.remarks LIKE '%recon%'
    ORDER BY p.date_paid DESC, p.id DESC
  `);
  console.log(`Found ${payments.length} recon payment records:`);
  payments.forEach(p => {
    console.log(`ID: ${p.id} | Date: ${p.date_paid} | Cust: ${p.customer_code} ${p.full_name} | Loan: ${p.loan_code} | Amt: ${p.amount_paid} | BalBefore: ${p.balance_before} | BalAfter: ${p.balance_after} | Type: ${p.payment_type} | Status: ${p.status} | Remarks: "${p.remarks}"`);
  });
}

run().catch(console.error);
