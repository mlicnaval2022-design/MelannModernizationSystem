const { dbAll, dbGet, dbRun } = require('../server/src/db/database');
const { computeAmortization, computeMaturityDate, generateAmortizationSchedule, getWorkingDays } = require('../server/src/services/loanCalculator');

async function testEditoFix() {
  console.log('Testing Loan 2281 (Edito Codilla):');
  const loan = await dbGet(`SELECT * FROM tblLoan WHERE id = 2281`);
  console.log('Current loan in DB:', loan);

  const amort = computeAmortization(loan.principal, loan.interest_rate, loan.loan_period);
  console.log('Computed amort:', amort);

  const mat = computeMaturityDate(loan.date_released, loan.loan_period);
  console.log('Computed maturity:', mat);

  const sched = generateAmortizationSchedule(loan.id, loan.date_released, loan.loan_period, amort.amortization);
  console.log(`Generated schedule count: ${sched.length}`);
  console.log('First schedule item:', sched[0]);
  console.log('Last schedule item:', sched[sched.length - 1]);
}

testEditoFix().catch(console.error);
