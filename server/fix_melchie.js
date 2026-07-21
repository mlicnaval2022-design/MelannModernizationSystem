const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'melann.db'));

db.serialize(() => {
  db.get(`SELECT id FROM tblCustomer WHERE first_name LIKE '%Melchie%' AND last_name LIKE '%De Lara%' LIMIT 1`, (err, customer) => {
    if (err || !customer) {
      console.log('Customer not found', err);
      return;
    }
    console.log('Found customer:', customer.id);
    
    // Find latest loan
    db.all(`SELECT id, loan_code, previous_balance, balance, date_released, created_at FROM tblLoan WHERE customer_id = ? ORDER BY id DESC`, [customer.id], (err, loans) => {
      if (err || !loans || loans.length === 0) {
        console.log('No loans found');
        return;
      }
      const latestLoan = loans[0];
      console.log('Latest loan:', latestLoan);
      
      // If it has 0 previous balance, let's find the balance of the loan before it
      if (loans.length > 1) {
        const previousLoan = loans[1];
        console.log('Previous loan:', previousLoan);
        
        // Wait, did we create a payment today? Let's check tblPayment
        db.get(`SELECT amount FROM tblPayment WHERE loan_id = ? AND payment_type = 'Prior Loan Balance' ORDER BY id DESC LIMIT 1`, [previousLoan.id], (err, payment) => {
          console.log('Prior Loan Balance Payment on old loan:', payment);
          const amountToSet = payment ? payment.amount : previousLoan.balance;
          
          console.log('Setting previous_balance to:', amountToSet);
          if (amountToSet > 0) {
            db.run(`UPDATE tblLoan SET previous_balance = ? WHERE id = ?`, [amountToSet, latestLoan.id], function(err) {
              if (err) console.error(err);
              else console.log('Updated successfully. Changes:', this.changes);
            });
          }
        });
      }
    });
  });
});
