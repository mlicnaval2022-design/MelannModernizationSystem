const express = require('express');
const { dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

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
