const express = require('express');
const { dbGet, dbRun, dbAll, withTransaction } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { triggerLoanRecalculation } = require('../services/noPaymentMonitoring');
const { recalculateLoanBalances } = require('../services/loanBalanceRecalculator');
const { SPECIAL_PAYMENT_TYPES } = require('../services/paymentClassification');
const router = express.Router();

async function restoreCustomerAfterDeceasedReversal(customerId, userId) {
  if (!customerId) return;
  const remaining = await dbGet(
    `SELECT 1 AS found FROM tblPayment
     WHERE customer_id = ? AND status = 'deceased'
     LIMIT 1`,
    [customerId]
  );
  if (remaining) return;

  const customer = await dbGet(`SELECT status FROM tblCustomer WHERE id = ?`, [customerId]);
  if (!customer || String(customer.status || '').toUpperCase() !== 'DECEASED') return;

  const openLoans = await dbGet(
    `SELECT COUNT(*) AS count FROM tblLoan
     WHERE customer_id = ?
       AND COALESCE(balance, 0) > 0
       AND LOWER(COALESCE(status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled', 'closed')`,
    [customerId]
  );
  const nextStatus = Number(openLoans?.count || 0) > 0 ? 'active' : 'FULLY PAID';
  await dbRun(`UPDATE tblCustomer SET status=?, updated_at=datetime('now') WHERE id=?`, [nextStatus, customerId]);
  await dbRun(
    `INSERT INTO tblCustomerStatusHistory (customer_id, previous_status, new_status, changed_by, remarks)
     VALUES (?, 'DECEASED', ?, ?, 'Auto-transition: Deceased payment reversed')`,
    [customerId, nextStatus, userId || null]
  );
}

router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { customer_code, payment_code } = req.query;
    if (!customer_code || !payment_code) return res.status(400).json({ error: 'Client Code and Payment Code are required' });

    const q = `
      SELECT p.*, l.loan_code, l.principal, l.balance as current_loan_balance, c.full_name as customer_name, c.customer_code, 
             co.first_name || ' ' || co.last_name as collector_name,
             u.username as encoded_by_name
      FROM tblPayment p
      JOIN tblCustomer c ON p.customer_id = c.id
      JOIN tblLoan l ON p.loan_id = l.id
      LEFT JOIN tblCollector co ON p.collector_id = co.id
      LEFT JOIN tblUser u ON p.encoded_by = u.id
      WHERE c.customer_code = ? AND p.payment_code = ?
    `;
    const payment = await dbGet(q, [customer_code, payment_code]);
    if (!payment) return res.status(404).json({ error: 'Payment Code not found for this client.' });

    res.json(payment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/client/:customer_code/payments', authenticateToken, async (req, res) => {
  try {
    const { customer_code } = req.params;
    
    let customer = await dbGet('SELECT id, full_name, customer_code FROM tblCustomer WHERE customer_code = ?', [customer_code]);
    if (!customer) {
      customer = await dbGet('SELECT id, full_name, customer_code FROM tblCustomer WHERE id = ?', [customer_code]);
    }
    if (!customer) return res.status(404).json({ error: 'Client Code not found.' });

    let latestLoan = await dbGet(`
      SELECT l.id, l.loan_code, l.loan_type, l.date_released, l.status,
        (
          SELECT COUNT(*)
          FROM tblLoan lx
          WHERE lx.customer_id = l.customer_id
            AND LOWER(COALESCE(lx.status, '')) NOT IN ('reversed', 'cancelled', 'rejected')
            AND (
              COALESCE(lx.date_released, lx.created_at) < COALESCE(l.date_released, l.created_at)
              OR (
                COALESCE(lx.date_released, lx.created_at) = COALESCE(l.date_released, l.created_at)
                AND lx.id <= l.id
              )
            )
        ) as loan_cycle
      FROM tblLoan l
      WHERE l.customer_id = ?
        AND LOWER(COALESCE(l.status, '')) NOT IN ('reversed', 'cancelled', 'rejected')
      ORDER BY COALESCE(l.date_released, l.created_at) DESC, l.id DESC
      LIMIT 1
    `, [customer.id]);

    if (!latestLoan) {
      latestLoan = await dbGet(`
        SELECT l.id, l.loan_code, l.loan_type, l.date_released, l.status,
          (
            SELECT COUNT(*)
            FROM tblLoan lx
            WHERE lx.customer_id = l.customer_id
              AND LOWER(COALESCE(lx.status, '')) NOT IN ('reversed', 'cancelled', 'rejected')
              AND (
                COALESCE(lx.date_released, lx.created_at) < COALESCE(l.date_released, l.created_at)
                OR (
                  COALESCE(lx.date_released, lx.created_at) = COALESCE(l.date_released, l.created_at)
                  AND lx.id <= l.id
                )
              )
          ) as loan_cycle
        FROM tblLoan l
        JOIN tblPayment p ON p.loan_id = l.id
        WHERE l.customer_id = ?
        GROUP BY l.id
        ORDER BY COALESCE(l.date_released, l.created_at, MAX(p.date_paid)) DESC, l.id DESC
        LIMIT 1
      `, [customer.id]);
    }

    if (!latestLoan) {
      return res.json({ customer, latest_loan: null, payments: [] });
    }

    const q = `
      SELECT p.*, l.loan_code, l.principal, l.balance as current_loan_balance, c.full_name as customer_name, c.customer_code, 
             co.first_name || ' ' || co.last_name as collector_name,
             u.username as encoded_by_name
      FROM tblPayment p
      JOIN tblCustomer c ON p.customer_id = c.id
      JOIN tblLoan l ON p.loan_id = l.id
      LEFT JOIN tblCollector co ON p.collector_id = co.id
      LEFT JOIN tblUser u ON p.encoded_by = u.id
      WHERE c.id = ? AND p.loan_id = ?
      ORDER BY p.date_paid DESC, p.id DESC
    `;
    const payments = await dbAll(q, [customer.id, latestLoan.id]);

    res.json({ customer, latest_loan: latestLoan, payments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/payment/by-code', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { customer_code, payment_code, reason } = req.body;
    if (!customer_code || !payment_code || !reason) return res.status(400).json({ error: 'Client Code, Payment Code, and Reason are required' });

    const p = await dbGet(`
      SELECT p.* FROM tblPayment p
      JOIN tblCustomer c ON p.customer_id = c.id
      WHERE c.customer_code = ? AND p.payment_code = ?
    `, [customer_code, payment_code]);

    if (!p) return res.status(404).json({ error: 'Payment Code not found for this client.' });
    if (p.status === 'reversed') return res.status(400).json({ error: 'This payment has already been reversed.' });

    await withTransaction(async () => {
      await dbRun(`UPDATE tblPayment SET status='reversed', reversed_at=datetime('now'), reversed_by=?, reversal_reason=? WHERE id=?`, [req.user.id, reason, p.id]);
      await recalculateLoanBalances(p.loan_id, { userId: req.user.id });
      if (p.status === 'deceased') await restoreCustomerAfterDeceasedReversal(p.customer_id, req.user.id);

      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REVERSE', 'PAYMENT', p.id, `Reversed OR#${p.or_number} Reason: ${reason}`]);
    });
    
    // Trigger No Payment Monitoring recalculation
    triggerLoanRecalculation(p.loan_id).catch(e => console.error(e));

    res.json({ message: 'Payment reversed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payment/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const reversibleStatuses = ['active', ...SPECIAL_PAYMENT_TYPES];
    const payment = await dbGet(`SELECT * FROM tblPayment WHERE id = ? AND status IN (${reversibleStatuses.map(() => '?').join(', ')})`, [req.params.id, ...reversibleStatuses]);
    if (!payment) return res.status(404).json({ error: 'Active settlement payment not found' });
    await withTransaction(async () => {
      await dbRun(`UPDATE tblPayment SET status='reversed', reversed_at=datetime('now'), reversed_by=? WHERE id=?`, [req.user.id, payment.id]);
      await recalculateLoanBalances(payment.loan_id, { userId: req.user.id });
      if (payment.status === 'deceased') await restoreCustomerAfterDeceasedReversal(payment.customer_id, req.user.id);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REVERSE', 'PAYMENT', payment.id, `Reversed OR#${payment.or_number}`]);
    });
    triggerLoanRecalculation(payment.loan_id).catch(e => console.error(e));
    res.json({ message: 'Payment reversed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/loan/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const loan = await dbGet(`SELECT * FROM tblLoan WHERE id = ? AND status = 'active'`, [req.params.id]);
    if (!loan) return res.status(404).json({ error: 'Active loan not found' });
    await withTransaction(async () => {
      await dbRun(`UPDATE tblPayment SET status='reversed', reversed_at=datetime('now'), reversed_by=? WHERE loan_id=? AND status='active'`, [req.user.id, loan.id]);
      await dbRun(`UPDATE tblLoan SET status='reversed', balance=0, updated_at=datetime('now') WHERE id=?`, [loan.id]);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REVERSE', 'LOAN', loan.id, `Reversed loan ${loan.loan_code}`]);
    });
    triggerLoanRecalculation(loan.id).catch(e => console.error(e));
    res.json({ message: 'Loan reversed successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/batch', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { payment_ids, reason } = req.body;
    if (!payment_ids || !Array.isArray(payment_ids) || payment_ids.length === 0) {
      return res.status(400).json({ error: 'No payments selected' });
    }

    const batch_id = Date.now().toString();

    // Fetch the payments so we can sort them newest first by date and id
    const placeholders = payment_ids.map(() => '?').join(',');
    const payments = await dbAll(`SELECT * FROM tblPayment WHERE id IN (${placeholders}) ORDER BY date_paid DESC, id DESC`, payment_ids);

    await withTransaction(async () => {
      for (const p of payments) {
        if (p.status === 'reversed') continue;

        // Update Payment Status
        await dbRun(`UPDATE tblPayment SET status='reversed', reversed_at=datetime('now'), reversed_by=?, reversal_reason=? WHERE id=?`, [req.user.id, reason || 'Batch Reversal', p.id]);

        await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
          [req.user.id, req.user.username, 'REVERSE', 'PAYMENT', p.id, `Batch Reversal [${batch_id}] OR#${p.or_number}`]
        );
      }

      // Trigger recalculations for unique loans
      const uniqueLoans = [...new Set(payments.map(p => p.loan_id))];
      for (const lid of uniqueLoans) {
        await recalculateLoanBalances(lid, { userId: req.user.id });
        triggerLoanRecalculation(lid).catch(e => console.error(e));
      }
      const deceasedCustomerIds = [...new Set(payments.filter(p => p.status === 'deceased').map(p => p.customer_id))];
      for (const customerId of deceasedCustomerIds) {
        await restoreCustomerAfterDeceasedReversal(customerId, req.user.id);
      }
    });

    res.json({ message: 'Batch reversal processed successfully', batch_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
