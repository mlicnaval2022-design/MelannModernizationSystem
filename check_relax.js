const db = require('./server/src/db/database');
db.dbAll("SELECT * FROM tblCustomerStatusHistory WHERE UPPER(new_status) = 'RELAX' ORDER BY id DESC LIMIT 5").then(console.log);
