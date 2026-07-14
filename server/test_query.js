const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');
db.all(`SELECT l.id, l.customer_id, l.loan_code, l.principal, l.net_proceeds, l.loan_type, l.date_released, l.created_at, l.dcr_id, l.service_fee, l.insurance, l.balance, l.previous_balance,
             c.customer_code, c.first_name, c.last_name, u.full_name as encoded_by,
             co.first_name || ' ' || co.last_name as collector_name,
             (SELECT SUM(amount) FROM tblTransaction WHERE category = CAST(l.customer_id AS TEXT) AND transaction_type = 'Penalty' AND transaction_date = l.date_released AND status = 'active') as today_penalty,
             (SELECT SUM(amount) FROM tblTransaction WHERE category = CAST(l.customer_id AS TEXT) AND transaction_type = 'Passbook' AND transaction_date = l.date_released AND status = 'active') as today_passbook
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblUser u ON l.created_by = u.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id LIMIT 1`, (err, rows) => {
  if (err) console.error(err.message);
  else console.log('Success:', rows);
});
