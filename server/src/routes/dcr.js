const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');
const router = express.Router();

// Get summary for a specific date (combines collections, releases, expenses)
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { date, branch_id } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    // Base conditions
    let pCond = `date_paid = ? AND status != 'reversed'`;
    let lCond = `date_released = ? AND status != 'cancelled'`;
    let eCond = `expense_date = ? AND status = 'active'`;
    const params = [date];

    if (branch_id) {
      // Assuming loans have branch_id natively or via collector, expenses have branch_id.
      // For simplicity in this demo, we might not strictly filter payments by branch if branch_id is missing from tblPayment
      eCond += ` AND branch_id = ?`;
      params.push(branch_id);
    }

    // 1. Collections
    const collections = await dbAll(`
      SELECT p.id, p.or_number, p.amount_paid, p.payment_type, p.date_paid, p.created_at, p.dcr_id,
             c.customer_code, c.first_name, c.last_name, u.full_name as encoded_by,
             co.first_name || ' ' || co.last_name as collector_name
      FROM tblPayment p
      JOIN tblCustomer c ON p.customer_id = c.id
      LEFT JOIN tblUser u ON p.encoded_by = u.id
      LEFT JOIN tblCollector co ON p.collector_id = co.id
      WHERE p.date_paid = ? AND p.status != 'reversed'
    `, [date]);

    // 2. Loan Releases
    const releases = await dbAll(`
      SELECT l.id, l.customer_id, l.loan_code, l.net_proceeds, l.loan_type, l.date_released, l.created_at, l.dcr_id,
             c.customer_code, c.first_name, c.last_name, u.full_name as encoded_by,
             co.first_name || ' ' || co.last_name as collector_name
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblUser u ON l.created_by = u.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE l.date_released = ? AND l.status != 'cancelled'
    `, [date]);

    // 3. Expenses
    const expenses = await dbAll(`
      SELECT e.id, e.amount, e.category, e.description, e.payee, e.expense_date, e.created_at, e.dcr_id,
             u.full_name as encoded_by
      FROM tblExpense e
      LEFT JOIN tblUser u ON e.created_by = u.id
      WHERE e.expense_date = ? AND e.status = 'active'
    `, [date]);

    // Check if a DCR already exists for this date (simplification: 1 DCR per day per branch)
    let dcrQuery = `SELECT * FROM tblDailyCashReport WHERE report_date = ?`;
    let dcrParams = [date];
    if (branch_id) {
      dcrQuery += ` AND branch_id = ?`;
      dcrParams.push(branch_id);
    }
    const existingDcr = await dbGet(dcrQuery, dcrParams);

    // Compute totals
    const total_collections = collections.reduce((acc, c) => acc + c.amount_paid, 0);
    const total_releases = releases.reduce((acc, r) => acc + (r.net_proceeds || 0), 0);
    const total_expenses = expenses.reduce((acc, e) => acc + e.amount, 0);

    // Get previous day's ending balance to serve as today's beginning cash
    const prevDcr = await dbGet(`
      SELECT actual_cash_count FROM tblDailyCashReport 
      WHERE report_date < ? ORDER BY report_date DESC LIMIT 1
    `, [date]);
    const beginning_cash = prevDcr ? prevDcr.actual_cash_count : 0;

    const expected_ending_cash = beginning_cash + total_collections - total_releases - total_expenses;

    // Combine transactions for ledger
    const ledger = [
      ...collections.map(c => ({ type: 'Collection', ref: c.or_number, code: c.customer_code, name: `${c.first_name} ${c.last_name}`, amount: c.amount_paid, user: c.encoded_by, time: c.created_at, dcr_id: c.dcr_id })),
      ...releases.map(r => ({ type: 'Loan Release', ref: r.loan_code, code: r.customer_code, name: `${r.first_name} ${r.last_name}`, amount: r.net_proceeds, user: r.encoded_by, time: r.created_at, dcr_id: r.dcr_id })),
      ...expenses.map(e => ({ type: 'Expense', ref: e.category, code: '—', name: e.payee || '—', amount: e.amount, user: e.encoded_by, time: e.created_at, remarks: e.description, dcr_id: e.dcr_id }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json({
      date,
      dcr: existingDcr,
      beginning_cash,
      total_collections,
      total_releases,
      total_expenses,
      expected_ending_cash,
      collections,
      releases,
      expenses,
      ledger
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching DCR summary' });
  }
});

// Get loan releases for BIR Checklist
router.get('/loan-releases', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const releases = await dbAll(`
      SELECT l.id as loan_id, l.customer_id, l.net_proceeds as loan_amount, l.loan_type, l.date_released, l.status,
             c.customer_code, c.first_name || ' ' || c.last_name as customer_name,
             co.first_name || ' ' || co.last_name as collector_name,
             b.branch_name
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      LEFT JOIN tblBranch b ON l.branch_id = b.id
      WHERE l.date_released = ? AND l.status != 'cancelled'
      ORDER BY l.created_at DESC
    `, [date]);

    res.json(releases);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching loan releases' });
  }
});

// Close Day
router.post('/close', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { date, branch_id, denom, actual_cash, variance, totals } = req.body;
    
    // Check if already closed
    const existing = await dbGet(`SELECT * FROM tblDailyCashReport WHERE report_date = ?`, [date]);
    if (existing) return res.status(400).json({ error: 'This date is already closed.' });

    // Generate DCR Number
    const countRow = await dbGet(`SELECT COUNT(*) as c FROM tblDailyCashReport WHERE report_date LIKE ?`, [`${date.substring(0,7)}%`]);
    const nextNum = (countRow.c + 1).toString().padStart(6, '0');
    const dcr_number = `DCR-${date.replace(/-/g, '')}-${nextNum}`;

    // Insert DCR
    const result = await dbRun(`
      INSERT INTO tblDailyCashReport (
        dcr_number, branch_id, report_date, beginning_cash, total_collections, total_releases, total_expenses,
        expected_ending_cash, count_1000, count_500, count_200, count_100, count_50, count_20, count_coins,
        actual_cash_count, variance, status, closed_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      dcr_number, branch_id, date, totals.beginning_cash, totals.total_collections, totals.total_releases, totals.total_expenses,
      totals.expected_ending_cash, denom.count_1000, denom.count_500, denom.count_200, denom.count_100, denom.count_50, denom.count_20, denom.count_coins,
      actual_cash, variance, 'CLOSED', req.user.id
    ]);

    const dcrId = result.lastID;

    // Lock transactions
    await dbRun(`UPDATE tblPayment SET dcr_id = ? WHERE date_paid = ? AND status != 'reversed' AND dcr_id IS NULL`, [dcrId, date]);
    await dbRun(`UPDATE tblLoan SET dcr_id = ? WHERE date_released = ? AND status != 'cancelled' AND dcr_id IS NULL`, [dcrId, date]);
    await dbRun(`UPDATE tblExpense SET dcr_id = ? WHERE expense_date = ? AND status = 'active' AND dcr_id IS NULL`, [dcrId, date]);

    await dbRun(`INSERT INTO tblLogtime (user_id, action) VALUES (?, ?)`, [req.user.id, `CLOSED DAY: ${dcr_number} for ${date}`]);

    res.json({ message: 'Day successfully closed', dcr_number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List historical DCRs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT d.*, u.full_name as closed_by_name 
      FROM tblDailyCashReport d 
      LEFT JOIN tblUser u ON d.closed_by = u.id 
      ORDER BY d.report_date DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
