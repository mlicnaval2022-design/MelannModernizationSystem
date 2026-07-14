const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const query = `
  SELECT l.*, c.customer_code, c.first_name, c.last_name, c.middle_name, c.gender, c.birth_date, c.address,
         c.contact, c.id_type, c.id_number, c.id_issue_date, c.id_expiry_date, c.id_issued_by, c.civil_status,
         b.branch_code,
         (SELECT p.date_paid FROM tblPayment p WHERE p.loan_id = l.id AND p.status = 'active' ORDER BY p.date_paid ASC, p.id ASC LIMIT 1) as first_payment_date,
         (SELECT p.date_paid FROM tblPayment p WHERE p.loan_id = l.id AND p.status = 'active' ORDER BY p.date_paid DESC, p.id DESC LIMIT 1) as last_payment_date,
         (SELECT p.amount_paid FROM tblPayment p WHERE p.loan_id = l.id AND p.status = 'active' ORDER BY p.date_paid DESC, p.id DESC LIMIT 1) as last_payment_amount,
         (SELECT p.date_paid FROM tblPayment p WHERE p.loan_id = l.id AND p.status = 'active' AND p.balance_after <= 0 ORDER BY p.date_paid DESC, p.id DESC LIMIT 1) as fully_paid_date
  FROM tblLoan l
  JOIN tblCustomer c ON l.customer_id = c.id
  JOIN tblGovernmentComplianceClients gcc ON l.id = gcc.loan_id AND gcc.agency = 'CIC'
  LEFT JOIN tblBranch b ON l.branch_id = b.id
  WHERE l.date_released BETWEEN '2026-06-01' AND '2026-06-30'
    AND l.status NOT IN ('reversed', 'rejected')
  ORDER BY c.customer_code, l.loan_code
`;

db.all(query, [], (err, rows) => {
  if (err) console.error("SQL Error:", err.message);
  else console.log(`Success! Found ${rows.length} rows.`);
  db.close();
});
