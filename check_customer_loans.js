const db = require('./server/src/db/database');
db.dbAll("SELECT id, loan_code, status FROM tblLoan WHERE customer_id = 1655").then(console.log);
