const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { computeAmortization, computeMaturityDate, generateAmortizationSchedule, computeNetProceeds } = require('../services/loanCalculator');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, status, customer_id, collector_id } = req.query;
    let q = `SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name, b.branch_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id LEFT JOIN tblBranch b ON l.branch_id = b.id WHERE 1=1`;
    const p = [];
    if (search) { q += ` AND (c.full_name LIKE ? OR l.loan_code LIKE ? OR c.customer_code LIKE ?)`; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { q += ` AND l.status = ?`; p.push(status); }
    if (customer_id) { q += ` AND l.customer_id = ?`; p.push(customer_id); }
    if (collector_id) { q += ` AND l.collector_id = ?`; p.push(collector_id); }
    q += ` ORDER BY l.created_at DESC`;
    res.json(await dbAll(q, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const loan = await dbGet(`SELECT l.*, c.full_name as customer_name, c.customer_code, c.address as customer_address, co.first_name || ' ' || co.last_name as collector_name, b.branch_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id LEFT JOIN tblBranch b ON l.branch_id = b.id WHERE l.id = ?`, [req.params.id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    const schedule = await dbAll('SELECT * FROM tblAmortizationSchedule WHERE loan_id = ? ORDER BY period_number', [req.params.id]);
    const payments = await dbAll(`SELECT * FROM tblPayment WHERE loan_id = ? AND status = 'active' ORDER BY date_paid DESC`, [req.params.id]);
    res.json({ ...loan, schedule, payments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { customer_id, collector_id, branch_id, loan_type, principal, interest_rate, loan_period, date_released, service_fee_pct, insurance, notarial_fee, filing_fee, or_number, remarks } = req.body;
    if (!customer_id || !principal || !date_released) return res.status(400).json({ error: 'customer_id, principal, date_released required' });
    const { interest_amount, total_amortization, amortization } = computeAmortization(principal, interest_rate || 0, loan_period || 1);
    const date_maturity = computeMaturityDate(date_released, loan_period || 1);
    const { service_fee, total_deductions, net_proceeds } = computeNetProceeds(principal, service_fee_pct || 0, insurance || 0, notarial_fee || 0, filing_fee || 0);
    const count = (await dbGet('SELECT COUNT(*) as c FROM tblLoan')).c;
    const loan_code = `LN-${String(count + 1).padStart(6, '0')}`;
    const result = await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, interest_amount, loan_period, date_released, date_maturity, amortization, total_amortization, service_fee, insurance, notarial_fee, filing_fee, total_deductions, net_proceeds, balance, or_number, remarks, created_by, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,
      [loan_code, customer_id, collector_id, branch_id || null, loan_type || 'regular', principal, interest_rate || 0, interest_amount, loan_period || 1, date_released, date_maturity, amortization, total_amortization, service_fee, insurance || 0, notarial_fee || 0, filing_fee || 0, total_deductions, net_proceeds, total_amortization, or_number, remarks, req.user.id]);
    const schedule = generateAmortizationSchedule(result.lastID, date_released, loan_period || 1, amortization);
    for (const s of schedule) {
      await dbRun(`INSERT INTO tblAmortizationSchedule (loan_id, period_number, due_date, amount_due, status) VALUES (?,?,?,?,?)`, [s.loan_id, s.period_number, s.due_date, s.amount_due, s.status]);
    }
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'CREATE', 'LOAN', result.lastID, `New loan: ${loan_code}`]);
    res.status(201).json({ id: result.lastID, loan_code, amortization, total_amortization, date_maturity, net_proceeds });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/status', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    await dbRun(`UPDATE tblLoan SET status=?, updated_at=datetime('now') WHERE id=?`, [req.body.status, req.params.id]);
    res.json({ message: 'Loan status updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
