const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('server/melann.db');
db.serialize(() => {
  db.run("UPDATE tblCustomer SET status = 'active' WHERE id IN (8, 9)");
});
console.log('Updated status to active');
