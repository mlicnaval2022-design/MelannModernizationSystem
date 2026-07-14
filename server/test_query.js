const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.all(`
  SELECT 
    c.id, c.customer_code, c.full_name as client_name, c.status,
    co.first_name || ' ' || co.last_name as collector_name,
    (SELECT l.principal FROM tblLoan l WHERE l.customer_id = c.id ORDER BY l.date_released DESC LIMIT 1) as last_loan_amount,
    (SELECT l.date_released FROM tblLoan l WHERE l.customer_id = c.id ORDER BY l.date_released DESC LIMIT 1) as date_released,
    (SELECT p.date_paid FROM tblPayment p JOIN tblLoan l ON p.loan_id = l.id WHERE l.customer_id = c.id AND l.status='fullpaid' ORDER BY p.date_paid DESC LIMIT 1) as date_fully_paid,
    (SELECT COUNT(*) FROM tblLoan l WHERE l.customer_id = c.id) as loan_cycles
  FROM tblCustomer c
  LEFT JOIN tblCollector co ON c.collector_id = co.id
  WHERE c.status = 'FULLY PAID'
`, (err, rows) => {
  if (err) console.error(err.message);
  else {
    const gemma = rows.filter(r => r.client_name.includes('ABAD'));
    console.log('Gemma in Fully Paid?', gemma);
  }
  db.close();
});
