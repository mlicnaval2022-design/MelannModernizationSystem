const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, 'melann.db'));

db.serialize(() => {
  db.run(`
    UPDATE tblLoan
    SET net_proceeds = principal - COALESCE(previous_balance, 0) - COALESCE(penalty, 0) - COALESCE(passbook, 0) - COALESCE(service_fee, 0) - COALESCE(insurance, 0) - COALESCE(notarial_fee, 0) - COALESCE(filing_fee, 0)
    WHERE net_proceeds = principal 
      AND (COALESCE(previous_balance, 0) + COALESCE(penalty, 0) + COALESCE(passbook, 0) + COALESCE(service_fee, 0) + COALESCE(insurance, 0) + COALESCE(notarial_fee, 0) + COALESCE(filing_fee, 0) > 0)
  `, function(err) {
    if (err) {
      console.error(err);
    } else {
      console.log(`Updated ${this.changes} loans with correct net_proceeds.`);
    }
  });
});
