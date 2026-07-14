const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.all(`SELECT ci.*, c.full_name FROM tblCreditInvestigation ci JOIN tblLoan l ON ci.loan_id = l.id JOIN tblCustomer c ON l.customer_id = c.id WHERE c.full_name LIKE '%YBAÑEZ%' ORDER BY ci.id DESC LIMIT 1`, (err, rows) => {
  if (err) console.error(err);
  else console.log(rows);
  db.close();
});
