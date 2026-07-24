const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const clients = [
  { loan_id: 1, customer_id: 1, customer_code: 'C001', customer_name: 'Test', loan_amount: 1000, loan_type: 'New', date_released: '2026-07-14', collector_name: 'Col 1', branch_name: 'Branch 1' }
];

let inserted = 0;
const targetAgency = 'CIC';

db.serialize(() => {
  for (const c of clients) {
    db.run(`
      INSERT OR IGNORE INTO tblGovernmentComplianceClients 
      (agency, loan_id, customer_id, customer_code, customer_name, loan_amount, loan_type, release_date, collector_name, branch_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [targetAgency, c.loan_id, c.customer_id, c.customer_code, c.customer_name, c.loan_amount, c.loan_type, c.date_released, c.collector_name, c.branch_name, 'Sent'], function(err) {
      if (err) console.error("INSERT ERROR:", err.message);
      else console.log("INSERT SUCCESS");
    });
  }
});

setTimeout(() => db.close(), 1000);
