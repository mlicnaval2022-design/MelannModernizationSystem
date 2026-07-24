const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'melann.db'));

db.serialize(() => {
  db.run(`UPDATE tblLoan SET principal = 3000, interest_amount = 450, net_proceeds = 3000 WHERE id = 1853`, function(err) {
    if (err) console.error(err);
    else console.log('Successfully updated Evelyn Ando loan. Changes:', this.changes);
  });
});
