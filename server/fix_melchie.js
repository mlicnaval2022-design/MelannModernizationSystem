const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'melann.db'));

db.serialize(() => {
  db.run(`UPDATE tblLoan SET previous_balance = 30 WHERE id = 1851`, function(err) {
    if (err) console.error(err);
    else console.log('Successfully updated De Lara Melchie. Changes:', this.changes);
  });
});
