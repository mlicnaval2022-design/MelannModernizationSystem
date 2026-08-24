const { dbAll, dbGet } = require('../server/src/db/database');
const { computeAmortization, computeMaturityDate, generateAmortizationSchedule, getWorkingDays } = require('../server/src/services/loanCalculator');

async function verifyMaturityFixes() {
  console.log('======================================================');
  console.log('VERIFYING MATURITY DATE & DISCLOSURE STATEMENT FIXES');
  console.log('======================================================');

  // 1. Term Calculations from 2026-08-24 (Monday)
  const relDate = '2026-08-24';
  const termsToTest = [
    { period: 26, expectedWorkingDays: 26, expectedMaturity: '2026-09-23' },
    { period: 30, expectedWorkingDays: 26, expectedMaturity: '2026-09-23' },
    { period: 39, expectedWorkingDays: 39, expectedMaturity: '2026-10-08' },
    { period: 45, expectedWorkingDays: 39, expectedMaturity: '2026-10-08' },
    { period: 52, expectedWorkingDays: 52, expectedMaturity: '2026-10-23' },
    { period: 60, expectedWorkingDays: 52, expectedMaturity: '2026-10-23' },
    { period: 78, expectedWorkingDays: 78, expectedMaturity: '2026-11-23' },
    { period: 90, expectedWorkingDays: 78, expectedMaturity: '2026-11-23' },
  ];

  console.log(`\n1. Testing Terms from Release Date: ${relDate}`);
  let termPassed = true;
  for (const t of termsToTest) {
    const w = getWorkingDays(t.period);
    const m = computeMaturityDate(relDate, t.period);
    const pass = (w === t.expectedWorkingDays && m === t.expectedMaturity);
    if (!pass) termPassed = false;
    console.log(`- Period ${t.period} Days: WorkingDays=${w} (Expected: ${t.expectedWorkingDays}), Maturity=${m} (Expected: ${t.expectedMaturity}) -> ${pass ? 'PASS' : 'FAIL'}`);
  }

  // 2. Check Edito Codilla (Loan 2281)
  console.log('\n2. Checking Loan 2281 (Edito Codilla):');
  const loan = await dbGet(`SELECT * FROM tblLoan WHERE id = 2281`);
  console.log(`- Loan Code: ${loan.loan_code}`);
  console.log(`- Date Released: ${loan.date_released}`);
  console.log(`- Loan Period: ${loan.loan_period}`);
  console.log(`- Date Maturity: ${loan.date_maturity} (Expected: 2026-09-23)`);
  console.log(`- Principal: ₱${loan.principal}`);
  console.log(`- Total Amortization: ₱${loan.total_amortization}`);
  console.log(`- Daily Amortization: ₱${loan.amortization} (Expected: 635)`);

  const sched = await dbAll(`SELECT * FROM tblAmortizationSchedule WHERE loan_id = 2281 ORDER BY period_number ASC`);
  console.log(`- Schedule Entries Count: ${sched.length} (Expected: 26)`);
  console.log(`- First Due Date: ${sched[0]?.due_date} (Period 1, Amount: ₱${sched[0]?.amount_due})`);
  console.log(`- Last Due Date: ${sched[sched.length - 1]?.due_date} (Period ${sched[sched.length - 1]?.period_number}, Amount: ₱${sched[sched.length - 1]?.amount_due})`);

  const editoPass = (loan.date_maturity === '2026-09-23' && loan.amortization === 635 && sched.length === 26 && sched[sched.length - 1]?.due_date === '2026-09-23');
  console.log(`\nEdito Codilla check: ${editoPass ? 'PASSED' : 'FAILED'}`);

  console.log('\n======================================================');
  console.log(`ALL VERIFICATIONS: ${termPassed && editoPass ? 'PASSED SUCCESSFULLY!' : 'FAILED'}`);
  console.log('======================================================');
}

verifyMaturityFixes().catch(console.error);
