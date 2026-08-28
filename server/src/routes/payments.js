const express = require('express');
const { beginTransaction, dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { triggerLoanRecalculation } = require('../services/noPaymentMonitoring');
const { requireOperationDate, sqlNotSunday } = require('../services/operationDays');
const { recalculateLoanBalances } = require('../services/loanBalanceRecalculator');
const { synchronizePromiseToPayStatuses } = require('../services/promiseToPayStatus');
const {
  PAYMENT_TYPE_CONFIG,
  SPECIAL_PAYMENT_TYPES,
  buildSpecialPaymentRemarks,
  resolveSpecialPaymentType,
} = require('../services/paymentClassification');
const router = express.Router();
const sendRouteError = (res, err) => res.status(err.statusCode || 500).json({ error: err.message });
const formatDate = value => {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { loan_id, customer_id, date_from, date_to, search } = req.query;
    let q = `SELECT p.*, l.loan_code, l.loan_type, l.date_released, l.principal, l.amortization, l.status as loan_status, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblCollector co ON p.collector_id = co.id WHERE p.status IN ('active', 'penalty', 'recon', 'deceased', 'writeoff') AND ${sqlNotSunday('p.date_paid')}`;
    const pa = [];
    if (loan_id) { q += ` AND p.loan_id = ?`; pa.push(loan_id); }
    if (customer_id) { q += ` AND p.customer_id = ?`; pa.push(customer_id); }
    if (date_from) { q += ` AND p.date_paid >= ?`; pa.push(date_from); }
    if (date_to) { q += ` AND p.date_paid <= ?`; pa.push(date_to); }
    if (search) { q += ` AND (c.full_name LIKE ? OR c.customer_code LIKE ? OR p.or_number LIKE ? OR l.loan_code LIKE ?)`; pa.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
    q += ` ORDER BY p.created_at DESC LIMIT 100`;
    res.json(await dbAll(q, pa));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const p = await dbGet(`SELECT p.*, l.loan_code, c.full_name as customer_name, co.first_name || ' ' || co.last_name as collector_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblCollector co ON p.collector_id = co.id WHERE p.id = ?`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Payment not found' });
    res.json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  let transaction;
  try {
    let { loan_id, or_number, date_paid, amount_paid, collector_id, remarks, force_duplicate } = req.body;
    if (!loan_id || !date_paid || !amount_paid) return res.status(400).json({ error: 'loan_id, date_paid, amount_paid required' });
    requireOperationDate(date_paid, 'Payment date');
    amount_paid = Number(amount_paid);
    if (!Number.isFinite(amount_paid) || amount_paid <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero' });
    if (!or_number) or_number = 'N/A';
    const specialPaymentType = resolveSpecialPaymentType(req.body);
    const paymentStatus = specialPaymentType || 'active';
    const paymentType = specialPaymentType || 'regular';
    const paymentRemarks = buildSpecialPaymentRemarks(specialPaymentType, remarks);

    let loan = await dbGet(`SELECT * FROM tblLoan WHERE id = ?`, [loan_id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.date_released && String(date_paid).slice(0, 10) < String(loan.date_released).slice(0, 10)) {
      return res.status(400).json({
        error: `You cannot post payment to this loan because the loan was released on ${formatDate(loan.date_released)}. Please use a payment date on or after the release date.`,
        is_loan_timeline_conflict: true,
        release_date: loan.date_released
      });
    }
    const newerLoan = await dbGet(`
      SELECT id, loan_code, loan_type, date_released
      FROM tblLoan
      WHERE customer_id = ?
        AND id != ?
        AND COALESCE(date_released, '') > COALESCE(?, '')
        AND LOWER(COALESCE(status, '')) NOT IN ('reversed', 'cancelled', 'rejected')
      ORDER BY date_released ASC, id ASC
      LIMIT 1
    `, [loan.customer_id, loan_id, loan.date_released || '']);
    if (newerLoan) {
      const newerType = String(newerLoan.loan_type || 'new loan').trim() || 'new loan';
      return res.status(400).json({
        error: `You cannot post payment to this client because the client already has ${newerType} released on ${formatDate(newerLoan.date_released)}.`,
        is_loan_timeline_conflict: true,
        reloan_date: newerLoan.date_released,
        newer_loan_code: newerLoan.loan_code,
        newer_loan_type: newerLoan.loan_type
      });
    }
    const loanStatus = String(loan.status || '').toLowerCase();
    if (Number(loan.balance || 0) <= 0 || loanStatus === 'fullpaid') return res.status(400).json({ error: 'This account is already fully paid.', is_fully_paid: true });
    if (!['active', 'pastdue'].includes(loanStatus)) return res.status(400).json({ error: 'This account is inactive and cannot accept payments.', is_inactive: true });
    
    const balancePaymentStatuses = ['active', ...SPECIAL_PAYMENT_TYPES];
    const sameDay = await dbGet(`SELECT COUNT(*) as c FROM tblPayment WHERE loan_id = ? AND date_paid = ? AND amount_paid = ? AND status IN (${balancePaymentStatuses.map(() => '?').join(', ')})`, [loan_id, date_paid, amount_paid, ...balancePaymentStatuses]);
    if (sameDay.c > 0 && !force_duplicate) {
      return res.status(409).json({ error: 'Possible duplicate payment detected. Please verify before proceeding.', is_duplicate: true });
    }
    
    transaction = await beginTransaction();

    // Re-read state after acquiring the transaction queue. This prevents two
    // simultaneous requests from using the same stale balance or both passing
    // the duplicate-payment check.
    loan = await dbGet(`SELECT * FROM tblLoan WHERE id = ?`, [loan_id]);
    if (!loan || Number(loan.balance || 0) <= 0 || String(loan.status || '').toLowerCase() === 'fullpaid') {
      await transaction.rollback();
      transaction = null;
      return res.status(400).json({ error: 'This account is already fully paid.', is_fully_paid: true });
    }
    if (!force_duplicate) {
      const concurrentDuplicate = await dbGet(
        `SELECT COUNT(*) as c FROM tblPayment WHERE loan_id = ? AND date_paid = ? AND amount_paid = ? AND status IN (${balancePaymentStatuses.map(() => '?').join(', ')})`,
        [loan_id, date_paid, amount_paid, ...balancePaymentStatuses]
      );
      if (concurrentDuplicate.c > 0) {
        await transaction.rollback();
        transaction = null;
        return res.status(409).json({ error: 'Possible duplicate payment detected. Please verify before proceeding.', is_duplicate: true });
      }
    }

    const balance_before = loan.balance;
    const balance_after = Math.max(0, balance_before - amount_paid);

    const maxCodeRes = await dbGet(`SELECT MAX(CAST(payment_code AS INTEGER)) as max_code FROM tblPayment WHERE customer_id = ?`, [loan.customer_id]);
    const nextCode = (maxCodeRes.max_code || 0) + 1;
    const payment_code = String(nextCode).padStart(4, '0');

    const result = await dbRun(`INSERT INTO tblPayment (loan_id, customer_id, collector_id, or_number, date_paid, amount_paid, balance_before, balance_after, payment_type, status, remarks, encoded_by, payment_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [loan_id, loan.customer_id, collector_id || loan.collector_id, or_number, date_paid, amount_paid, balance_before, balance_after, paymentType, paymentStatus, paymentRemarks, req.user.id, payment_code]);
    const recalculation = await recalculateLoanBalances(loan_id, { userId: req.user.id });

    if (specialPaymentType === 'deceased') {
      const customer = await dbGet(`SELECT status FROM tblCustomer WHERE id = ?`, [loan.customer_id]);
      if (customer && String(customer.status || '').toUpperCase() !== 'DECEASED') {
        await dbRun(`UPDATE tblCustomer SET status='DECEASED', updated_at=datetime('now') WHERE id=?`, [loan.customer_id]);
        await dbRun(
          `INSERT INTO tblCustomerStatusHistory (customer_id, previous_status, new_status, changed_by, remarks)
           VALUES (?, ?, 'DECEASED', ?, 'Auto-transition: Deceased payment classification')`,
          [loan.customer_id, customer.status, req.user.id]
        );
      }
    }

    const logTag = specialPaymentType ? `[${PAYMENT_TYPE_CONFIG[specialPaymentType].remarkTag}] ` : '';
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'CREATE', 'PAYMENT', result.lastID, `${logTag}OR#${or_number} Amt:${amount_paid} Col:${collector_id || loan.collector_id}`]);
    await transaction.commit();
    transaction = null;
    
    // Trigger No Payment Monitoring recalculation
    await triggerLoanRecalculation(loan_id).catch(e => console.error('Error triggering recalculation:', e));
    await synchronizePromiseToPayStatuses({ customerId: loan.customer_id })
      .catch(e => console.error('Error synchronizing PTP after payment:', e));

    const postedPayment = await dbGet(`SELECT balance_before, balance_after FROM tblPayment WHERE id = ?`, [result.lastID]);
    res.status(201).json({
      id: result.lastID,
      payment_code,
      balance_before: postedPayment.balance_before,
      balance_after: postedPayment.balance_after,
      loan_status: recalculation.status,
      is_recon: specialPaymentType === 'recon',
      is_deceased: specialPaymentType === 'deceased',
      is_write_off: specialPaymentType === 'writeoff',
      special_payment_type: specialPaymentType,
      status: paymentStatus
    });
  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    sendRouteError(res, err);
  }
});

router.put('/:id/penalty-amount', authenticateToken, async (req, res) => {
  try {
    let { amount_paid, date_paid } = req.body;
    amount_paid = Number(amount_paid);
    if (!Number.isFinite(amount_paid) || amount_paid < 0) return res.status(400).json({ error: 'Invalid penalty amount' });
    if (date_paid) requireOperationDate(date_paid, 'Penalty date');
    
    const payment = await dbGet(`SELECT * FROM tblPayment WHERE id = ?`, [req.params.id]);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status !== 'penalty') return res.status(400).json({ error: 'Only penalty payments can have their amount edited this way' });

    const loan = await dbGet(`SELECT dcr_id, branch_id FROM tblLoan WHERE id = ?`, [payment.loan_id]);
    if (payment.dcr_id || loan?.dcr_id) {
      return res.status(400).json({ error: 'Cannot edit a penalty that has already been closed in a Daily Cash Report.' });
    }
    date_paid = date_paid || payment.date_paid;
    const closedDcr = await dbGet(
      `SELECT id FROM tblDailyCashReport WHERE report_date = ? AND (branch_id IS NULL OR branch_id = ?) LIMIT 1`,
      [date_paid, loan?.branch_id || null]
    );
    if (closedDcr) {
      return res.status(400).json({ error: 'Cannot post this penalty to a date that is already closed in a Daily Cash Report.' });
    }

    await dbRun(`UPDATE tblPayment SET amount_paid = ?, date_paid = ? WHERE id = ?`, [amount_paid, date_paid, req.params.id]);
    await dbRun(`UPDATE tblLoan SET penalty = ? WHERE id = ?`, [amount_paid, payment.loan_id]);
    
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'UPDATE', 'PAYMENT', req.params.id, `Updated penalty from ${payment.amount_paid} on ${payment.date_paid} to ${amount_paid} on ${date_paid}`]);
    
    res.json({ message: 'Penalty payment updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
