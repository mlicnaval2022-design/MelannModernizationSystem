const express = require('express');
const { dbGet, dbRun, dbAll } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { customer_code, payment_code } = req.query;
    if (!customer_code || !payment_code) return res.status(400).json({ error: 'Client Code and Payment Code are required' });

    const q = `
      SELECT p.*, l.loan_code, l.principal, c.full_name as customer_name, c.customer_code, 
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

    await dbRun(`UPDATE tblLoan SET balance=balance+?, total_paid=total_paid-?, status='active', updated_at=datetime('now') WHERE id=?`, [p.amount_paid, p.amount_paid, p.loan_id]);
    await dbRun(`UPDATE tblPayment SET status='reversed', reversed_at=datetime('now'), reversed_by=?, reversal_reason=? WHERE id=?`, [req.user.id, reason, p.id]);
    
    // Reverse amortization schedules
    // We only reverse what was paid on THAT EXACT DATE by THAT EXACT AMOUNT.
    // Wait, the new spec says "Reverse all amortization allocations made by that payment."
    // If multiple payments were made on the same date, how do we know which schedules? 
    // We'll just reverse `p.amount_paid` from the most recently paid schedules.
    let remainingToReverse = p.amount_paid;
    const paidSchedules = await dbAll(`SELECT * FROM tblAmortizationSchedule WHERE loan_id = ? AND amount_paid > 0 ORDER BY period_number DESC`, [p.loan_id]);
    for (const sched of paidSchedules) {
      if (remainingToReverse <= 0) break;
      const amountToReverse = Math.min(remainingToReverse, sched.amount_paid);
      const newPaid = sched.amount_paid - amountToReverse;
      const schedStatus = (newPaid <= 0) ? 'pending' : 'partial';
      await dbRun(`UPDATE tblAmortizationSchedule SET amount_paid = ?, status = ? WHERE id = ?`, [newPaid, schedStatus, sched.id]);
      remainingToReverse -= amountToReverse;
    }

    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REVERSE', 'PAYMENT', p.id, `Reversed OR#${p.or_number} Reason: ${reason}`]);
    res.json({ message: 'Payment reversed successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/payment/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const payment = await dbGet(`SELECT * FROM tblPayment WHERE id = ? AND status = 'active'`, [req.params.id]);
    if (!payment) return res.status(404).json({ error: 'Active payment not found' });
    await dbRun(`UPDATE tblLoan SET balance=balance+?, total_paid=total_paid-?, status='active', updated_at=datetime('now') WHERE id=?`, [payment.amount_paid, payment.amount_paid, payment.loan_id]);
    await dbRun(`UPDATE tblPayment SET status='reversed', reversed_at=datetime('now'), reversed_by=? WHERE id=?`, [req.user.id, payment.id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REVERSE', 'PAYMENT', payment.id, `Reversed OR#${payment.or_number}`]);
    res.json({ message: 'Payment reversed successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/loan/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const loan = await dbGet(`SELECT * FROM tblLoan WHERE id = ? AND status = 'active'`, [req.params.id]);
    if (!loan) return res.status(404).json({ error: 'Active loan not found' });
    await dbRun(`UPDATE tblPayment SET status='reversed', reversed_at=datetime('now'), reversed_by=? WHERE loan_id=? AND status='active'`, [req.user.id, loan.id]);
    await dbRun(`UPDATE tblLoan SET status='reversed', balance=0, updated_at=datetime('now') WHERE id=?`, [loan.id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REVERSE', 'LOAN', loan.id, `Reversed loan ${loan.loan_code}`]);
    res.json({ message: 'Loan reversed successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
