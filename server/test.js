const { dbAll } = require('./src/db/database');
async function test() {
  try {
    const res = await dbAll(`SELECT p.*, l.loan_code, l.loan_type, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblCollector co ON p.collector_id = co.id WHERE p.date_paid BETWEEN '2026-06-23' AND '2026-06-24' AND p.status = 'active' ORDER BY p.date_paid, co.last_name`);
    console.log("Success", res.length);
  } catch (err) {
    console.error("Error:", err.message);
  }
}
test();
