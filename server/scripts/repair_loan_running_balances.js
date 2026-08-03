const { closeDb, dbAll, dbGet, dbRun } = require('../src/db/database');
const { getOpeningBalance, recalculateLoanBalances, roundMoney } = require('../src/services/loanBalanceRecalculator');

const apply = process.argv.includes('--apply');
const loanArg = process.argv.find(arg => arg.startsWith('--loan-id='));
const loanIdFilter = loanArg ? Number(loanArg.split('=')[1]) : null;

const isDifferent = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) > 0.009;

async function getLoanMismatch(loan) {
  const payments = await dbAll(
    `SELECT id, payment_code, date_paid, amount_paid, balance_before, balance_after
     FROM tblPayment
     WHERE loan_id = ?
       AND status = 'active'
     ORDER BY date_paid ASC, id ASC`,
    [loan.id]
  );

  let runningBalance = getOpeningBalance(loan);
  const paymentMismatches = [];

  for (const payment of payments) {
    const expectedBefore = roundMoney(runningBalance);
    const expectedAfter = roundMoney(Math.max(0, expectedBefore - Number(payment.amount_paid || 0)));

    if (isDifferent(payment.balance_before, expectedBefore) || isDifferent(payment.balance_after, expectedAfter)) {
      paymentMismatches.push({
        id: payment.id,
        payment_code: payment.payment_code,
        date_paid: payment.date_paid,
        amount_paid: payment.amount_paid,
        old_balance_before: payment.balance_before,
        old_balance_after: payment.balance_after,
        expected_balance_before: expectedBefore,
        expected_balance_after: expectedAfter,
      });
    }

    runningBalance = expectedAfter;
  }

  const expectedLoanBalance = roundMoney(runningBalance);
  const expectedTotalPaid = roundMoney(payments.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0));
  const loanBalanceMismatch = isDifferent(loan.balance, expectedLoanBalance);
  const totalPaidMismatch = isDifferent(loan.total_paid, expectedTotalPaid);

  if (!paymentMismatches.length && !loanBalanceMismatch && !totalPaidMismatch) return null;

  return {
    loan_id: loan.id,
    loan_code: loan.loan_code,
    customer_id: loan.customer_id,
    customer_name: loan.customer_name,
    payment_mismatch_count: paymentMismatches.length,
    loan_balance: loan.balance,
    expected_loan_balance: expectedLoanBalance,
    total_paid: loan.total_paid,
    expected_total_paid: expectedTotalPaid,
    samples: paymentMismatches.slice(0, 5),
  };
}

async function main() {
  const where = loanIdFilter ? 'WHERE l.id = ?' : '';
  const params = loanIdFilter ? [loanIdFilter] : [];
  const loans = await dbAll(
    `SELECT l.*, c.full_name as customer_name
     FROM tblLoan l
     LEFT JOIN tblCustomer c ON c.id = l.customer_id
     ${where}
     ORDER BY l.id ASC`,
    params
  );

  const mismatches = [];
  for (const loan of loans) {
    const mismatch = await getLoanMismatch(loan);
    if (mismatch) mismatches.push(mismatch);
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    loans_checked: loans.length,
    mismatch_count: mismatches.length,
    mismatches: mismatches.slice(0, 50),
  }, null, 2));

  if (!apply || mismatches.length === 0) return;

  await dbRun('BEGIN TRANSACTION');
  try {
    for (const mismatch of mismatches) {
      await recalculateLoanBalances(mismatch.loan_id, { recomputeSchedule: true });
    }
    await dbRun('COMMIT');
  } catch (err) {
    await dbRun('ROLLBACK').catch(() => {});
    throw err;
  }

  const remaining = await Promise.all(
    mismatches.map(async mismatch => {
      const loan = await dbGet(
        `SELECT l.*, c.full_name as customer_name
         FROM tblLoan l
         LEFT JOIN tblCustomer c ON c.id = l.customer_id
         WHERE l.id = ?`,
        [mismatch.loan_id]
      );
      return getLoanMismatch(loan);
    })
  );

  console.log(JSON.stringify({
    repaired_count: mismatches.length,
    remaining_mismatch_count: remaining.filter(Boolean).length,
  }, null, 2));
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
