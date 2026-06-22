const { dbAll } = require('./src/db/database');

async function debug() {
  const loans = await dbAll(`
    SELECT l.id, l.loan_code, l.customer_id, c.id as c_id, c.full_name 
    FROM tblLoan l 
    LEFT JOIN tblCustomer c ON l.customer_id = c.id
  `);
  console.log(loans);
}

debug().catch(console.error);
