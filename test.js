const { dbAll } = require('./server/src/db/database.js'); dbAll(\SELECT id, loan_id, amount_paid FROM tblPayment WHERE status = 'penalty'\).then(console.log);
