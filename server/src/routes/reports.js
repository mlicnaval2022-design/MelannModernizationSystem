const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { runPastDueUpdate } = require('../services/pastDueUpdater');
const router = express.Router();

// Manual past-due updater trigger (admin/manager)
router.post('/run-pastdue', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    await runPastDueUpdate();
    res.json({ message: 'Past-due update completed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/due-clients', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const loans = await dbAll(`
      SELECT l.id, l.loan_code, l.loan_type, l.principal, l.balance as outstanding_balance, 
             l.date_released, l.date_maturity, l.status,
             c.customer_code as client_code, c.full_name as client_name,
             co.first_name || ' ' || co.last_name as collector_name,
             b.branch_name as branch_name,
             (SELECT COUNT(*) FROM tblLoan prev WHERE prev.customer_id = l.customer_id AND prev.id < l.id) as previous_loans_count,
             CAST(ROUND(JULIANDAY(?) - JULIANDAY(l.date_maturity)) AS INTEGER) as days_due
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      LEFT JOIN tblBranch b ON l.branch_id = b.id
      WHERE l.status IN ('active', 'pastdue') 
        AND (l.date_maturity <= ? OR l.date_maturity <= date(?, '+7 days') OR EXISTS (SELECT 1 FROM tblAmortizationSchedule s WHERE s.loan_id = l.id AND s.status = 'unpaid' AND s.due_date <= ?))
      ORDER BY co.last_name, l.date_maturity ASC
    `, [today, today, today, today]);

    res.json(loans);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/customers-metrics', authenticateToken, async (req, res) => {
  try {
    res.json({
      total_customers: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer`)).c,
      active_customers: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='active'`)).c,
      inactive_customers: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='inactive'`)).c,
      new_this_month: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`)).c,
      new_last_month: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', '-1 month')`)).c
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const epoch = new Date('2026-01-01T00:00:00Z');
    const diffDays = Math.floor((now - epoch) / (1000 * 60 * 60 * 24));
    const cycleIndex = Math.floor(diffDays / 45);
    const cycleStart = new Date(epoch.getTime() + cycleIndex * 45 * 24 * 60 * 60 * 1000);
    const cycleEnd = new Date(cycleStart.getTime() + 44 * 24 * 60 * 60 * 1000);
    const cycleStartStr = cycleStart.toISOString().split('T')[0];
    const cycleEndStr = cycleEnd.toISOString().split('T')[0];

    res.json({
      cycle_start: cycleStartStr,
      cycle_end: cycleEndStr,
      total_customers: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='active'`)).c,
      new_customers_this_month: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='active' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`)).c,
      expected_collections_today: (await dbGet(`SELECT COALESCE(SUM(amortization), 0) as total FROM tblLoan WHERE status='active'`)).total,
      collections_this_month: (await dbGet(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM tblPayment WHERE status='active' AND strftime('%Y-%m', date_paid) = strftime('%Y-%m', 'now')`)).total,
      collections_last_month: (await dbGet(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM tblPayment WHERE status='active' AND strftime('%Y-%m', date_paid) = strftime('%Y-%m', 'now', '-1 month')`)).total,
      demand_letters_sent: 0,
      total_active_loans: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='active'`)).c,
      total_pastdue: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE date_maturity < ? AND status NOT IN ('fullpaid','reversed')`, [today])).c,
      total_pastdue_amount: (await dbGet(`SELECT COALESCE(SUM(balance), 0) as total FROM tblLoan WHERE date_maturity < ? AND status NOT IN ('fullpaid','reversed')`, [today])).total,
      total_fullpaid: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='fullpaid'`)).c,
      collections_today: (await dbGet(`SELECT COALESCE(SUM(amount_paid),0) as total FROM tblPayment WHERE date_paid=? AND status='active'`, [today])).total,
      releases_today: (await dbGet(`SELECT COALESCE(SUM(principal),0) as total FROM tblLoan WHERE date_released=? AND status != 'reversed'`, [today])).total,
      loans_released_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE date_released=? AND status != 'reversed'`, [today])).c,
      total_portfolio: (await dbGet(`SELECT COALESCE(SUM(balance),0) as total FROM tblLoan WHERE status IN ('active','pastdue')`)).total,
      fully_paid_today: (await dbGet(`SELECT COUNT(DISTINCT customer_id) as c FROM tblCustomerStatusHistory WHERE new_status='FULLY PAID' AND date(created_at) = date('now', 'localtime')`)).c,
      eligible_for_reloan: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='FULLY PAID'`)).c,
      recon_count: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='RECON'`)).c,
      relax_count: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='RELAX'`)).c,
      hold_count: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='hold'`)).c,
      collector_performance: await dbAll(`
        SELECT 
          co.id, 
          co.first_name || ' ' || co.last_name as name,
          1000000 as target,
          COALESCE((SELECT SUM(amount_paid) FROM tblPayment WHERE collector_id = co.id AND date_paid BETWEEN ? AND ? AND status = 'active'), 0) as collected
        FROM tblCollector co
        WHERE co.is_active = 1
        AND LOWER(co.first_name || ' ' || co.last_name) NOT LIKE '%pastdue%'
        ORDER BY collected DESC
      `, [cycleStartStr, cycleEndStr]),
      recent_activities: await dbAll(`SELECT * FROM tblLogtime ORDER BY created_at DESC LIMIT 10`),
      pending_ci: await dbAll(`SELECT l.id, c.full_name, l.principal, l.created_at FROM tblLoan l JOIN tblCustomer c ON l.customer_id = c.id WHERE l.status = 'pending' ORDER BY l.created_at DESC LIMIT 5`),
      pending_ci_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='pending'`)).c,
      for_approval_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='for_approval'`)).c,
      pending_reloan_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='reloan_pending'`)).c,
      approved_reloan_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='approved' AND loan_type='Re-Loan'`)).c,
      rejected_reloan_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='rejected' AND loan_type='Re-Loan'`)).c,
      approved_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='approved' AND DATE(updated_at)=?`, [today])).c,
      rejected_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='rejected' AND DATE(updated_at)=?`, [today])).c,
      account_status_distribution: await dbAll(`SELECT status, COUNT(*) as count FROM tblLoan GROUP BY status`),
      aging_report: await dbGet(`
        SELECT 
          SUM(CASE WHEN days_overdue BETWEEN 1 AND 30 THEN 1 ELSE 0 END) as tier1,
          SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN 1 ELSE 0 END) as tier2,
          SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN 1 ELSE 0 END) as tier3,
          SUM(CASE WHEN days_overdue > 90 THEN 1 ELSE 0 END) as tier4
        FROM (
          SELECT CAST(ROUND(JULIANDAY(?) - JULIANDAY(date_maturity)) AS INTEGER) as days_overdue
          FROM tblLoan WHERE status NOT IN ('fullpaid', 'reversed') AND date_maturity < ?
        )
      `, [today, today])
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/daily-collection', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const payments = await dbAll(`SELECT p.*, l.loan_code, l.loan_type, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblCollector co ON p.collector_id = co.id WHERE p.date_paid BETWEEN ? AND ? AND p.status = 'active' ORDER BY p.date_paid, co.last_name`, [from, to]);
    res.json({ payments, total: payments.reduce((s, p) => s + p.amount_paid, 0), date_from: from, date_to: to });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/monthly-releases', authenticateToken, async (req, res) => {
  try {
    const y = String(req.query.year || new Date().getFullYear());
    const m = String(req.query.month || (new Date().getMonth() + 1)).padStart(2, '0');
    const loans = await dbAll(`SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE strftime('%Y',l.date_released)=? AND strftime('%m',l.date_released)=? AND l.status != 'reversed' ORDER BY l.date_released`, [y, m]);
    res.json({ loans, total_principal: loans.reduce((s, l) => s + l.principal, 0), year: y, month: m });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/past-due', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const loans = await dbAll(`SELECT l.*, c.full_name as customer_name, c.customer_code, c.address, c.contact, co.first_name || ' ' || co.last_name as collector_name, CAST(ROUND(JULIANDAY('now') - JULIANDAY(l.date_maturity)) AS INTEGER) as days_overdue FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.date_maturity < ? AND l.status NOT IN ('fullpaid','reversed') ORDER BY l.date_maturity ASC`, [today]);
    res.json({ loans, total_balance: loans.reduce((s, l) => s + l.balance, 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/payments-encoded', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const data = await dbAll(`SELECT p.*, l.loan_code, c.full_name as customer_name, u.full_name as encoded_by_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblUser u ON p.encoded_by = u.id WHERE p.date_paid BETWEEN ? AND ? AND p.status = 'active' ORDER BY p.created_at`, [from, to]);
    res.json({ data, total: data.reduce((s, p) => s + p.amount_paid, 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/payments-reversed', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const data = await dbAll(`SELECT p.*, l.loan_code, c.full_name as customer_name, u.full_name as reversed_by_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblUser u ON p.reversed_by = u.id WHERE p.status = 'reversed' AND DATE(p.reversed_at) BETWEEN ? AND ? ORDER BY p.reversed_at DESC`, [from, to]);
    res.json({ data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/maturity-check', authenticateToken, async (req, res) => {
  try {
    const days = req.query.days_ahead || 30;
    const loans = await dbAll(`SELECT l.*, c.full_name as customer_name, c.contact, co.first_name || ' ' || co.last_name as collector_name, CAST(ROUND(JULIANDAY(l.date_maturity) - JULIANDAY('now')) AS INTEGER) as days_to_maturity FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.status = 'active' AND JULIANDAY(l.date_maturity) - JULIANDAY('now') BETWEEN 0 AND ? ORDER BY l.date_maturity ASC`, [days]);
    res.json({ loans, days_ahead: days });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/full-paid', authenticateToken, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let q = `SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.status = 'fullpaid'`;
    const p = [];
    if (date_from) { q += ` AND l.updated_at >= ?`; p.push(date_from); }
    if (date_to) { q += ` AND l.updated_at <= ?`; p.push(date_to + ' 23:59:59'); }
    q += ` ORDER BY l.updated_at DESC`;
    res.json(await dbAll(q, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loan-type', authenticateToken, async (req, res) => {
  try {
    res.json(await dbAll(`SELECT loan_type, COUNT(*) as count, SUM(principal) as total_principal, SUM(balance) as total_balance, status FROM tblLoan WHERE status != 'reversed' GROUP BY loan_type, status ORDER BY loan_type`));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/collection-sheet', authenticateToken, async (req, res) => {
  try {
    const { collector_id } = req.query;
    const loans = await dbAll(`SELECT l.*, c.full_name as customer_name, c.customer_code, c.address, co.first_name || ' ' || co.last_name as collector_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.collector_id = ? AND l.status IN ('active','pastdue') ORDER BY c.last_name`, [collector_id]);
    res.json({ loans, collector_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
