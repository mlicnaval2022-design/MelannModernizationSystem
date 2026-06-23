const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { loan_id, customer_id, date_from, date_to, search } = req.query;
    let q = `SELECT p.*, l.loan_code, l.loan_type, l.date_released, l.principal, l.amortization, l.status as loan_status, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblCollector co ON p.collector_id = co.id WHERE p.status = 'active'`;
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
  try {
    let { loan_id, or_number, date_paid, amount_paid, collector_id, remarks, force_duplicate } = req.body;
    if (!loan_id || !date_paid || !amount_paid) return res.status(400).json({ error: 'loan_id, date_paid, amount_paid required' });
    if (!or_number) or_number = 'N/A';
    const loan = await dbGet(`SELECT * FROM tblLoan WHERE id = ? AND status NOT IN ('reversed','fullpaid')`, [loan_id]);
    if (!loan) return res.status(404).json({ error: 'Active loan not found' });
    
    const sameDay = await dbGet(`SELECT COUNT(*) as c FROM tblPayment WHERE loan_id = ? AND date_paid = ? AND amount_paid = ? AND status = 'active'`, [loan_id, date_paid, amount_paid]);
    if (sameDay.c > 0 && !force_duplicate) {
      return res.status(409).json({ error: 'Possible duplicate payment detected. Please verify before proceeding.', is_duplicate: true });
    }
    
    const balance_before = loan.balance;
    const balance_after = Math.max(0, balance_before - amount_paid);
    const result = await dbRun(`INSERT INTO tblPayment (loan_id, customer_id, collector_id, or_number, date_paid, amount_paid, balance_before, balance_after, status, remarks, encoded_by) VALUES (?,?,?,?,?,?,?,?,'active',?,?)`, [loan_id, loan.customer_id, collector_id || loan.collector_id, or_number, date_paid, amount_paid, balance_before, balance_after, remarks, req.user.id]);
    const newStatus = balance_after <= 0 ? 'fullpaid' : 'active';
    await dbRun(`UPDATE tblLoan SET balance=?, total_paid=total_paid+?, status=?, updated_at=datetime('now') WHERE id=?`, [balance_after, amount_paid, newStatus, loan_id]);
    
    if (newStatus === 'fullpaid') {
      const activeLoansCount = await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE customer_id = ? AND status IN ('active', 'pending', 'approved', 'for_approval')`, [loan.customer_id]);
      if (activeLoansCount.c === 0) {
        const cust = await dbGet(`SELECT status FROM tblCustomer WHERE id = ?`, [loan.customer_id]);
        if (cust && cust.status !== 'FULLY PAID') {
          await dbRun(`UPDATE tblCustomer SET status='FULLY PAID' WHERE id=?`, [loan.customer_id]);
          await dbRun(`INSERT INTO tblCustomerStatusHistory (customer_id, previous_status, new_status, changed_by, remarks) VALUES (?, ?, 'FULLY PAID', ?, 'Auto-transition: Loan fully paid')`, [loan.customer_id, cust.status, req.user.id]);
        }
      }
    }
    
    // Distribute payment across amortization schedule
    let remaining = amount_paid;
    const unpaidSchedules = await dbAll(`SELECT * FROM tblAmortizationSchedule WHERE loan_id = ? AND status != 'paid' ORDER BY period_number ASC`, [loan_id]);
    for (const sched of unpaidSchedules) {
      if (remaining <= 0) break;
      const amountToPay = Math.min(remaining, sched.amount_due - sched.amount_paid);
      if (amountToPay <= 0) continue;
      const newPaid = sched.amount_paid + amountToPay;
      const schedStatus = (newPaid >= sched.amount_due) ? 'paid' : 'partial';
      await dbRun(`UPDATE tblAmortizationSchedule SET amount_paid = ?, date_paid = ?, status = ? WHERE id = ?`, [newPaid, date_paid, schedStatus, sched.id]);
      remaining -= amountToPay;
    }

    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'CREATE', 'PAYMENT', result.lastID, `OR#${or_number} Amt:${amount_paid} Col:${collector_id || loan.collector_id}`]);
    res.status(201).json({ id: result.lastID, balance_before, balance_after, loan_status: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
