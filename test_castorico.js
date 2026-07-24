const { dbAll } = require('./server/src/db/database.js');
dbAll(`SELECT l.id, c.last_name, c.first_name, l.principal, l.balance, l.previous_balance, l.penalty, l.passbook FROM tblLoan l JOIN tblCustomer c ON l.customer_id = c.id WHERE c.last_name LIKE '%CASTORICO%';`).then(console.log);
