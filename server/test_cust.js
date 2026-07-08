const { dbAll } = require('./src/db/database');
async function run() {
  console.log(await dbAll("SELECT id, full_name, customer_code FROM tblCustomer WHERE customer_code IN ('1512', '91', '0091', '01512')"));
}
run();
