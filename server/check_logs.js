const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM tblLogtime WHERE created_at LIKE '2026-07-17 10:29%' OR created_at LIKE '2026-07-17 10:30%' ORDER BY created_at ASC", [], (err, logs) => {
  if (err) throw err;
  console.log(logs);
});
