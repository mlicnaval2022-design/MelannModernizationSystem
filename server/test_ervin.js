const { dbAll } = require('./src/db/database.js');
async function test() {
  const loans = await dbAll("SELECT * FROM tblLoan WHERE customer_id IN (SELECT id FROM tblCustomer WHERE full_name LIKE '%ERVIN%')");
  console.log(loans);
}
test();
