const { dbAll } = require('./src/db/database');
dbAll(`SELECT c.*, b.branch_name, co.first_name || ' ' || co.last_name as collector_name FROM tblCustomer c LEFT JOIN tblBranch b ON c.branch_id = b.id LEFT JOIN tblCollector co ON c.collector_id = co.id WHERE 1=1 ORDER BY c.last_name, c.first_name`)
.then(rows => console.log('Success:', rows.length))
.catch(err => console.error('Database Error:', err));
