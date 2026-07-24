const db = require('./server/src/db/database');
db.dbAll("SELECT * FROM tblLoan WHERE loan_code = 'LN-049628'").then(console.log);
