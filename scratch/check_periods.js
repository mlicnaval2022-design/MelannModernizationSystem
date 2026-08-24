const { dbAll } = require('../server/src/db/database');

async function inspectLoanPeriods() {
  const periods = await dbAll(`
    SELECT loan_period, COUNT(*) as cnt
    FROM tblLoan
    GROUP BY loan_period
    ORDER BY cnt DESC
  `);
  console.log('Loan periods in DB:', periods);

  const sampleLoans = await dbAll(`
    SELECT id, loan_code, loan_period, date_released, date_maturity, principal, amortization, total_amortization
    FROM tblLoan
    WHERE loan_period IN (26, 30, 39, 45, 52, 60)
    ORDER BY id DESC
    LIMIT 20
  `);
  console.log('\nSample loans by period:');
  sampleLoans.forEach(l => {
    console.log(`Loan ID: ${l.id} | Code: ${l.loan_code} | Period: ${l.loan_period} | Released: ${l.date_released} | Maturity: ${l.date_maturity} | Principal: ${l.principal} | Amortization: ${l.amortization} | Total: ${l.total_amortization}`);
  });
}

inspectLoanPeriods().catch(console.error);
