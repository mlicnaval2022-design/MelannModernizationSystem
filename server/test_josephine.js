const { dbAll } = require('./src/db/database.js');
async function test() {
  const loans = await dbAll("SELECT l.*, COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown Customer (Deleted)') as customer_name, c.customer_code, c.photo_client, c.photo_id_front, co.first_name || ' ' || co.last_name as collector_name, b.branch_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id LEFT JOIN tblBranch b ON l.branch_id = b.id WHERE c.customer_code = '0003'");
  console.log(loans);
}
test();
