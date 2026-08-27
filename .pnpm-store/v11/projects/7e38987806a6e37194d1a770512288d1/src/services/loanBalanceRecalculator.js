const { dbAll, dbGet, dbRun } = require('../db/database');
const { SPECIAL_PAYMENT_TYPES } = require('./paymentClassification');

const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const terminalLoanStatuses = new Set(['reversed', 'cancelled', 'rejected']);

const getOpeningBalance = loan => {
  if (Number.isFinite(Number(loan?.total_amortization)) && Number(loan.total_amortization) > 0) {
    return roundMoney(loan.total_amortization);
  }
  return roundMoney(Number(loan?.principal || 0) + Number(loan?.interest_amount || 0));
};

const calculateLoanLedger = (loan, payments) => {
  let runningBalance = getOpeningBalance(loan);
  let totalPaid = 0;

  const entries = payments.map(payment => {
    const balanceBefore = roundMoney(runningBalance);
    const amountPaid = roundMoney(payment.amount_paid);
    const balanceAfter = roundMoney(Math.max(0, balanceBefore - amountPaid));
    totalPaid = roundMoney(totalPaid + amountPaid);
    runningBalance = balanceAfter;

    return { payment, balanceBefore, balanceAfter };
  });

  return {
    entries,
    finalBalance: roundMoney(runningBalance),
    totalPaid,
  };
};

async function recomputeAmortizationSchedule(loanId, payments) {
  await dbRun(
    `UPDATE tblAmortizationSchedule
     SET amount_paid = 0, date_paid = NULL, status = 'unpaid'
     WHERE loan_id = ?`,
    [loanId]
  );

  const schedules = await dbAll(
    `SELECT *
     FROM tblAmortizationSchedule
     WHERE loan_id = ?
     ORDER BY period_number ASC, id ASC`,
    [loanId]
  );

  let scheduleIndex = 0;
  for (const payment of payments) {
    let remaining = roundMoney(payment.amount_paid);
    while (remaining > 0 && scheduleIndex < schedules.length) {
      const schedule = schedules[scheduleIndex];
      const paid = roundMoney(schedule.amount_paid);
      const due = roundMoney(schedule.amount_due);
      const unpaid = roundMoney(due - paid);

      if (unpaid <= 0) {
        scheduleIndex += 1;
        continue;
      }

      const amountToApply = Math.min(remaining, unpaid);
      const newPaid = roundMoney(paid + amountToApply);
      const status = newPaid >= due ? 'paid' : 'partial';

      schedule.amount_paid = newPaid;
      await dbRun(
        `UPDATE tblAmortizationSchedule
         SET amount_paid = ?, date_paid = ?, status = ?
         WHERE id = ?`,
        [newPaid, payment.date_paid, status, schedule.id]
      );

      remaining = roundMoney(remaining - amountToApply);
      if (newPaid >= due) scheduleIndex += 1;
    }
  }
}

async function updateCustomerFullyPaidStatus(customerId, userId) {
  const openLoansCount = await dbGet(`
    SELECT COUNT(*) as c
    FROM tblLoan
    WHERE customer_id = ?
      AND LOWER(COALESCE(status, '')) NOT IN ('fullpaid', 'closed', 'rejected', 'cancelled', 'reversed')
      AND COALESCE(balance, 0) > 0
  `, [customerId]);

  if (openLoansCount.c !== 0) return;

  const customer = await dbGet(`SELECT status FROM tblCustomer WHERE id = ?`, [customerId]);
  if (customer && !['FULLY PAID', 'DECEASED'].includes(String(customer.status || '').toUpperCase())) {
    await dbRun(`UPDATE tblCustomer SET status='FULLY PAID' WHERE id=?`, [customerId]);
    await dbRun(
      `INSERT INTO tblCustomerStatusHistory (customer_id, previous_status, new_status, changed_by, remarks)
       VALUES (?, ?, 'FULLY PAID', ?, 'Auto-transition: Loan fully paid')`,
      [customerId, customer.status, userId || null]
    );
  }
}

async function recalculateLoanBalances(loanId, options = {}) {
  const loan = await dbGet(`SELECT * FROM tblLoan WHERE id = ?`, [loanId]);
  if (!loan) throw new Error(`Loan ${loanId} not found`);

  const balancePaymentStatuses = ['active', ...SPECIAL_PAYMENT_TYPES];
  const payments = await dbAll(
    `SELECT *
     FROM tblPayment
     WHERE loan_id = ?
       AND status IN (${balancePaymentStatuses.map(() => '?').join(', ')})
     ORDER BY date_paid ASC, id ASC`,
    [loanId, ...balancePaymentStatuses]
  );

  const changes = [];
  const ledger = calculateLoanLedger(loan, payments);

  for (const { payment, balanceBefore, balanceAfter } of ledger.entries) {
    if (
      Math.abs(Number(payment.balance_before || 0) - balanceBefore) > 0.009 ||
      Math.abs(Number(payment.balance_after || 0) - balanceAfter) > 0.009
    ) {
      changes.push({
        payment_id: payment.id,
        payment_code: payment.payment_code,
        date_paid: payment.date_paid,
        old_balance_before: Number(payment.balance_before || 0),
        old_balance_after: Number(payment.balance_after || 0),
        balance_before: balanceBefore,
        balance_after: balanceAfter
      });
      await dbRun(
        `UPDATE tblPayment
         SET balance_before = ?, balance_after = ?
         WHERE id = ?`,
        [balanceBefore, balanceAfter, payment.id]
      );
    }
  }

  const finalBalance = ledger.finalBalance;
  const currentStatus = String(loan.status || '').toLowerCase();
  let nextStatus = loan.status || 'active';
  if (!terminalLoanStatuses.has(currentStatus)) {
    if (finalBalance <= 0) nextStatus = 'fullpaid';
    else if (currentStatus === 'fullpaid') nextStatus = 'active';
  }

  await dbRun(
    `UPDATE tblLoan
     SET balance = ?, total_paid = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [finalBalance, ledger.totalPaid, nextStatus, loanId]
  );

  if (options.recomputeSchedule !== false) {
    await recomputeAmortizationSchedule(loanId, payments);
  }

  if (finalBalance <= 0 && !terminalLoanStatuses.has(currentStatus)) {
    await updateCustomerFullyPaidStatus(loan.customer_id, options.userId);
  }

  return {
    loan_id: loanId,
    opening_balance: getOpeningBalance(loan),
    final_balance: finalBalance,
    total_paid: ledger.totalPaid,
    status: nextStatus,
    payment_changes: changes
  };
}

module.exports = {
  calculateLoanLedger,
  getOpeningBalance,
  recalculateLoanBalances,
  roundMoney,
};
