const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

const query = `
  SELECT 
    'bir' as type, COUNT(*) as count 
  FROM tblGovernmentCompliance 
  WHERE agency = 'bir' AND status = 'pending'
`;

db.all(query, [], (err, rows) => {
  if (err) console.error("Error executing query:", err.message);
  else console.log("Rows:", rows);
  db.close();
});
