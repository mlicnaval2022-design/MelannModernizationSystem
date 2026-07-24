const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { computeMaturityDate, getWorkingDays } = require('./src/services/loanCalculator');

const dbPath = path.join(__dirname, 'melann.db');
const db = new sqlite3.Database(dbPath);

const loanCode = 'LN-049663';

db.get("SELECT * FROM tblLoan WHERE loan_code = ?", [loanCode], (err, loan) => {
  if (err) throw err;
  if (!loan) {
    console.log("Loan not found");
    return;
  }

  const period = parseInt(loan.loan_period) || 45;
  const dateMaturity = computeMaturityDate(loan.date_released, period);
  const workingDays = getWorkingDays(period);
  const amortization = Math.ceil(loan.total_amortization / workingDays);

  console.log(`Fixing ${loanCode}...`);
  console.log(`Period: ${period}`);
  console.log(`Working Days: ${workingDays}`);
  console.log(`New Maturity Date: ${dateMaturity}`);
  console.log(`New Amortization: ${amortization}`);

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // Update loan
    db.run(
      "UPDATE tblLoan SET date_maturity = ?, amortization = ? WHERE id = ?",
      [dateMaturity, amortization, loan.id]
    );

    // Delete old schedule
    db.run("DELETE FROM tblAmortizationSchedule WHERE loan_id = ?", [loan.id]);

    // Generate new schedule
    const schedule = [];
    let currentDate = new Date(loan.date_released);
    let paymentsGenerated = 0;
    
    while (paymentsGenerated < workingDays) {
      currentDate.setDate(currentDate.getDate() + 1);
      if (currentDate.getDay() !== 0) {
        paymentsGenerated++;
        schedule.push({
          loan_id: loan.id,
          period_number: paymentsGenerated,
          due_date: currentDate.toISOString().split('T')[0],
          amount_due: parseFloat(amortization.toFixed(2)),
          status: 'unpaid',
        });
      }
    }

    const stmt = db.prepare("INSERT INTO tblAmortizationSchedule (loan_id, period_number, due_date, amount_due, status) VALUES (?, ?, ?, ?, ?)");
    for (const s of schedule) {
      stmt.run(s.loan_id, s.period_number, s.due_date, s.amount_due, s.status);
    }
    stmt.finalize();

    db.run("COMMIT", (err) => {
      if (err) throw err;
      console.log("Loan fixed successfully.");
    });
  });
});
