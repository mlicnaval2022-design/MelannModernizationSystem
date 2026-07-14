const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const queries = [
  "SELECT * FROM tblGovernmentCompliance WHERE agency = 'BIR' AND is_archived = 0",
  "SELECT * FROM tblGovernmentComplianceClients WHERE agency = 'BIR' ORDER BY created_at DESC",
  "SELECT * FROM tblGovernmentCompliance WHERE agency = 'SEC' AND is_archived = 0",
  "SELECT * FROM tblGovernmentComplianceClients WHERE agency = 'SEC' ORDER BY created_at DESC",
];

let completed = 0;
queries.forEach((q, i) => {
  db.all(q, [], (err, rows) => {
    if (err) console.error(`Query ${i} ERROR:`, err.message);
    else console.log(`Query ${i} SUCCESS: ${rows.length} rows`);
    completed++;
    if (completed === queries.length) db.close();
  });
});
