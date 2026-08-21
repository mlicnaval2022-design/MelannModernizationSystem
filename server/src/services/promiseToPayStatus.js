const dayjs = require('dayjs');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { SPECIAL_PAYMENT_TYPES } = require('./paymentClassification');

const MANUALLY_RESOLVED_STATUSES = new Set([
  'Paid', 'Partially Paid', 'Broken', 'Cancelled', 'Rescheduled'
]);
const normalizeLoanType = value => String(value || '')
  .toLowerCase()
  .replace(/[^a-z]/g, '');
const balancePaymentStatusesSql = ['active', ...SPECIAL_PAYMENT_TYPES].map(status => `'${status}'`).join(', ');

function getAutomaticStatus({ payments, loan, outcomeLoan, promiseDate, today }) {
  if (!payments.length) {
    return promiseDate < today ? 'Overdue PTP' : (promiseDate === today ? 'Due Today' : 'Pending');
  }

  const latestPayment = payments[payments.length - 1];
  const isFullyPaid = Number(latestPayment.balance_after) <= 0 || Number(loan?.balance) <= 0;
  if (!isFullyPaid) return 'Partial Paid Done';

  const hasReconPayment = payments.some(payment =>
    String(payment.status || '').toLowerCase() === 'recon' ||
    String(payment.payment_type || '').toLowerCase() === 'recon' ||
    String(payment.remarks || '').toLowerCase().includes('recon')
  );
  if (hasReconPayment || normalizeLoanType(outcomeLoan?.loan_type) === 'recon') return 'Fully Paid(Recon)';
  if (normalizeLoanType(outcomeLoan?.loan_type) === 'reloan') return 'Fully Paid(Reloan)';
  return 'Fully Paid';
}

/**
 * Reconciles PTPs with payments posted on or after their promised date.
 * A manual outcome remains authoritative; automatic outcomes remain eligible
 * for a later payment that completes the same promise.
 */
async function synchronizePromiseToPayStatuses({ customerId = null, today = dayjs().format('YYYY-MM-DD') } = {}) {
  const records = await dbAll(`
    SELECT ptp.*, l.balance AS loan_balance, l.status AS loan_status
    FROM tblPromiseToPay ptp
    LEFT JOIN tblLoan l ON l.id = ptp.loan_id
    WHERE (? IS NULL OR ptp.customer_id = ?)
  `, [customerId, customerId]);

  let updated = 0;
  for (const ptp of records) {
    if (MANUALLY_RESOLVED_STATUSES.has(ptp.status)) continue;

    const promiseDate = String(ptp.promise_date || '').slice(0, 10);
    if (!promiseDate) continue;
    const paymentScope = ptp.loan_id ? 'AND p.loan_id = ?' : '';
    const paymentParams = [ptp.customer_id, promiseDate, today];
    if (ptp.loan_id) paymentParams.push(ptp.loan_id);
    const payments = await dbAll(`
      SELECT p.*
      FROM tblPayment p
      WHERE p.customer_id = ?
        AND date(p.date_paid) >= date(?)
        AND date(p.date_paid) <= date(?)
        AND LOWER(COALESCE(p.status, '')) IN (${balancePaymentStatusesSql})
        ${paymentScope}
      ORDER BY date(p.date_paid) ASC, p.id ASC
    `, paymentParams);

    let outcomeLoan = null;
    if (payments.length && Number(payments[payments.length - 1].balance_after) <= 0) {
      outcomeLoan = await dbGet(`
        SELECT loan_type
        FROM tblLoan
        WHERE customer_id = ?
          AND id != COALESCE(?, -1)
          AND date(COALESCE(date_released, created_at)) >= date(?)
          AND LOWER(COALESCE(status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled')
        ORDER BY date(COALESCE(date_released, created_at)) DESC, id DESC
        LIMIT 1
      `, [ptp.customer_id, ptp.loan_id, payments[payments.length - 1].date_paid]);
    }

    const nextStatus = getAutomaticStatus({
      payments,
      loan: { balance: ptp.loan_balance, status: ptp.loan_status },
      outcomeLoan,
      promiseDate,
      today
    });
    const paidAmount = payments.reduce((total, payment) => total + Number(payment.amount_paid || 0), 0);
    const paymentDate = payments.length ? payments[payments.length - 1].date_paid : null;

    if (ptp.status !== nextStatus || Number(ptp.paid_amount || 0) !== paidAmount || (paymentDate && ptp.payment_date !== paymentDate)) {
      await dbRun(`
        UPDATE tblPromiseToPay
        SET status = ?, paid_amount = ?, payment_date = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [nextStatus, paidAmount, paymentDate, ptp.id]);
      updated += 1;
    }
  }
  return updated;
}

module.exports = { synchronizePromiseToPayStatuses, getAutomaticStatus };
