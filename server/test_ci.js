const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('melann.db');

db.serialize(() => {
  db.run(`UPDATE tblCreditInvestigation SET 
        daily_sales=?, daily_expenses=?, other_income=?, other_loans=?,
        exp_electricity=?, exp_water=?, exp_internet=?, exp_transport=?, exp_rental=?, exp_food=?, exp_appliances=?, exp_allowance=?, exp_tuition=?, exp_misc=?,
        check_location=?, check_activity=?, check_residency=?, check_borrowing=?, check_understanding=?, check_permit=?, check_purpose=?, check_source=?, check_consent=?, check_escalate=?,
        loan_history=?, business_years=?, no_hardship=?, cb_rating=?,
        ci_notes=?, endorsement=?, encoded_by=? WHERE id=?`,
        [0,0,0,0, 0,0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0,0, 'none', 'none', 'yes', 'none', 'test', 'approve', 1, 99999], (err) => {
    if (err) {
      console.error('ERROR:', err.message);
    } else {
      console.log('SUCCESS');
    }
  });
});

setTimeout(() => db.close(), 1000);
