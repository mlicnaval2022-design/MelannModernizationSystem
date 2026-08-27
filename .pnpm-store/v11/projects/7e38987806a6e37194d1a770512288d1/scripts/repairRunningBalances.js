const { closeDb, dbAll, dbRun } = require('../src/db/database');
const { calculateLoanLedger, recalculateLoanBalances } = require('../src/services/loanBalanceRecalculator');

const APPLY = process.argv.includes('--apply');
const BALANCE_STATUSES = ['active', 'recon', 'deceased', 'writeoff'];

function differs(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) > 0.009;
}

async function findInconsistentLoans() {
  const loans = await dbAll(`
    SELECT l.*, c.customer_code
    FROM tblLoan l
    JOIN tblCustomer c ON c.id = l.customer_id
    WHERE EXISTS (
      SELECT 1 FROM tblPayment p
      WHERE p.loan_id = l.id
        AND p.status IN (${BALANCE_STATUSES.map(() => '?').join(', ')})
    )
    ORDER BY l.id
  `, BALANCE_STATUSES);

  const inconsistent = [];
  for (const loan of loans) {
    const payments = await dbAll(`
      SELECT * FROM tblPayment
      WHERE loan_id = ?
        AND status IN (${BALANCE_STATUSES.map(() => '?').join(', ')})
      ORDER BY date_paid ASC, id ASC
    `, [loan.id, ...BALANCE_STATUSES]);
    const ledger = calculateLoanLedger(loan, payments);
    const paymentChanges = ledger.entries.filter(({ payment, balanceBefore, balanceAfter }) =>
      differs(payment.balance_before, balanceBefore) || differs(payment.balance_after, balanceAfter)
    ).length;
    const loanChanged = differs(loan.balance, ledger.finalBalance) || differs(loan.total_paid, ledger.totalPaid);
    if (paymentChanges || loanChanged) {
      inconsistent.push({ loan, paymentChanges, loanChanged, ledger });
    }
  }
  return { scanned: loans.length, inconsistent };
}

async function main() {
  const audit = await findInconsistentLoans();
  const summary = {
    mode: APPLY ? 'apply' : 'dry-run',
    loans_scanned: audit.scanned,
    loans_inconsistent: audit.inconsistent.length,
    payment_rows_inconsistent: audit.inconsistent.reduce((sum, item) => sum + item.paymentChanges, 0),
    client_codes: [...new Set(audit.inconsistent.map(item => item.loan.customer_code))],
  };

  if (APPLY && audit.inconsistent.length) {
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    try {
      for (const item of audit.inconsistent) {
        await recalculateLoanBalances(item.loan.id, { recomputeSchedule: false });
      }
      await dbRun('COMMIT');
    } catch (error) {
      await dbRun('ROLLBACK').catch(() => {});
      throw error;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
