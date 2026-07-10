const { dbAll } = require('./src/db/database');
dbAll(`SELECT date_paid, SUM(amount_paid) FROM tblPayment WHERE DATE(created_at) = '2026-07-09' GROUP BY date_paid`).then(console.log).catch(console.error);
