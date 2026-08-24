const { dbAll, dbGet } = require('../server/src/db/database');

async function run() {
  const custs = await dbAll("SELECT * FROM tblCustomer WHERE customer_code = '3881' OR first_name LIKE '%Arlyn%' OR last_name LIKE '%Alao%'");
  console.log('Customers found:', custs);
  for (const cust of custs) {
    console.log('--- Customer ID:', cust.id, cust.customer_code, cust.first_name, cust.last_name);
    const loans = await dbAll("SELECT * FROM tblLoan WHERE customer_id = ? ORDER BY id ASC", [cust.id]);
    console.log('Loans:', JSON.stringify(loans, null, 2));
    const payments = await dbAll("SELECT * FROM tblPayment WHERE customer_id = ? ORDER BY id ASC", [cust.id]);
    console.log('Payments:', JSON.stringify(payments, null, 2));
  }
}

run().catch(console.error);
