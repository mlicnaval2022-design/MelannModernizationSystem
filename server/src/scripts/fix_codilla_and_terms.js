const { dbAll, dbGet, dbRun } = require('../db/database');
const { computeAmortization, computeMaturityDate, generateAmortizationSchedule, getWorkingDays } = require('../services/loanCalculator');

async function fixLoans() {
  console.log('Fixing Loan 2281 (Edito Codilla) and other 26-day loans...');

  // 1. Fix Edito Codilla specifically
  const codillaLoan = await dbGet(`SELECT * FROM tblLoan WHERE id = 2281`);
  if (codillaLoan) {
    const period = codillaLoan.loan_period; // 26
    const dateReleased = codillaLoan.date_released; // 2026-08-24
    const newMaturity = computeMaturityDate(dateReleased, period); // 2026-09-23
    const { amortization, total_amortization } = computeAmortization(codillaLoan.principal, codillaLoan.interest_rate, period); // 635, 16500

    console.log(`Updating Loan 2281: Date Released=${dateReleased}, Period=${period}, New Maturity=${newMaturity}, Amortization=${amortization}`);

    await dbRun(`
      UPDATE tblLoan
      SET date_maturity = ?, amortization = ?, total_amortization = ?, balance = ?, updated_at = datetime('now')
      WHERE id = 2281
    `, [newMaturity, amortization, total_amortization, total_amortization]);

    // Regenerate amortization schedule
    await dbRun(`DELETE FROM tblAmortizationSchedule WHERE loan_id = 2281`);
    const schedule = generateAmortizationSchedule(2281, dateReleased, period, amortization);
    for (const s of schedule) {
      await dbRun(`
        INSERT INTO tblAmortizationSchedule (loan_id, period_number, due_date, amount_due, amount_paid, status)
        VALUES (?, ?, ?, ?, 0, 'unpaid')
      `, [s.loan_id, s.period_number, s.due_date, s.amount_due]);
    }
    console.log(`Generated ${schedule.length} schedule entries for Loan 2281 ending on ${schedule[schedule.length - 1].due_date}`);
  }

  // 2. Check any other active loans with period = 26 that have 0 payments
  const other26Loans = await dbAll(`
    SELECT * FROM tblLoan
    WHERE loan_period = 26
      AND id != 2281
      AND status = 'active'
      AND (SELECT COUNT(*) FROM tblPayment WHERE loan_id = tblLoan.id AND status != 'reversed') = 0
  `);
  console.log(`Found ${other26Loans.length} other active 26-day loans with 0 payments:`);
  for (const l of other26Loans) {
    const newMaturity = computeMaturityDate(l.date_released, l.loan_period);
    const { amortization, total_amortization } = computeAmortization(l.principal, l.interest_rate, l.loan_period);
    await dbRun(`
      UPDATE tblLoan
      SET date_maturity = ?, amortization = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [newMaturity, amortization, l.id]);

    await dbRun(`DELETE FROM tblAmortizationSchedule WHERE loan_id = ?`, [l.id]);
    const schedule = generateAmortizationSchedule(l.id, l.date_released, l.loan_period, amortization);
    for (const s of schedule) {
      await dbRun(`
        INSERT INTO tblAmortizationSchedule (loan_id, period_number, due_date, amount_due, amount_paid, status)
        VALUES (?, ?, ?, ?, 0, 'unpaid')
      `, [s.loan_id, s.period_number, s.due_date, s.amount_due]);
    }
    console.log(`Updated Loan ${l.id} (${l.loan_code}): Maturity=${newMaturity}, Amort=${amortization}, ScheduleCount=${schedule.length}`);
  }

  console.log('Loan fix completed successfully.');
}

fixLoans()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error fixing loans:', err);
    process.exit(1);
  });
