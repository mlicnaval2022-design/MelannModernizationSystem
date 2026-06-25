const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { computeAmortization, computeMaturityDate, generateAmortizationSchedule, computeNetProceeds } = require('../services/loanCalculator');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, status, customer_id, collector_id } = req.query;
    let q = `SELECT l.*, COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown Customer (Deleted)') as customer_name, c.customer_code, c.photo_client, c.photo_id_front, co.first_name || ' ' || co.last_name as collector_name, b.branch_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id LEFT JOIN tblBranch b ON l.branch_id = b.id WHERE 1=1`;
    const p = [];
    if (search) { q += ` AND (c.full_name LIKE ? OR l.loan_code LIKE ? OR c.customer_code LIKE ?)`; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { q += ` AND l.status = ?`; p.push(status); }
    if (customer_id) { q += ` AND l.customer_id = ?`; p.push(customer_id); }
    if (collector_id) { q += ` AND l.collector_id = ?`; p.push(collector_id); }
    q += ` ORDER BY l.created_at DESC`;
    res.json(await dbAll(q, p));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/sheet/collection', authenticateToken, async (req, res) => {
  try {
    const { collector_id, date } = req.query;
    if (!collector_id) return res.status(400).json({ error: 'collector_id required' });
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const loans = await dbAll(`
      SELECT l.*, COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown Customer (Deleted)') as customer_name, c.customer_code, c.photo_client, c.photo_id_front,
             (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date_paid = ? AND status='active') as collected_today
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      WHERE l.collector_id = ? AND l.status IN ('active', 'pastdue')
      ORDER BY c.full_name ASC
    `, [targetDate, collector_id]);
    
    const summary = {
      total_clients: loans.length,
      total_due: loans.reduce((s, l) => s + l.amortization, 0),
      total_collected: loans.reduce((s, l) => s + l.collected_today, 0),
    };
    
    res.json({ loans, summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/lookup/client', authenticateToken, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'code required' });
    
    // First, check if customer exists
    const customer = await dbGet(`SELECT id, full_name as customer_name, customer_code FROM tblCustomer WHERE customer_code = ?`, [code]);
    if (!customer) return res.status(404).json({ error: 'Customer code not found.', is_missing_customer: true });

    // Get latest loan
    const loan = await dbGet(`
      SELECT l.*, c.full_name as customer_name, c.customer_code, c.photo_client, c.photo_id_front, co.first_name || ' ' || co.last_name as collector_name,
      COALESCE((SELECT SUM(amount_paid) FROM tblPayment WHERE loan_id = l.id AND status != 'reversed'), 0) as total_payments_made
      FROM tblLoan l 
      JOIN tblCustomer c ON l.customer_id = c.id 
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE c.customer_code = ?
      ORDER BY 
        CASE 
          WHEN l.status IN ('active', 'pastdue') THEN 1 
          WHEN l.status = 'approved' THEN 2
          WHEN l.status IN ('pending', 'for_approval') THEN 3
          ELSE 4
        END ASC,
        l.created_at DESC
      LIMIT 1
    `, [code]);
    
    if (!loan) return res.status(404).json({ error: 'This customer has no loans.' });
    if (loan.status === 'fullpaid') return res.status(400).json({ error: 'This account is already fully paid.', is_fully_paid: true });
    if (loan.status !== 'active' && loan.status !== 'pastdue') return res.status(400).json({ error: 'This account is inactive and cannot accept payments.', is_inactive: true });

    res.json(loan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const loan = await dbGet(`SELECT l.*, COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown Customer (Deleted)') as customer_name, c.customer_code, c.photo_client, c.photo_id_front, c.address as customer_address, co.first_name || ' ' || co.last_name as collector_name, b.branch_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id LEFT JOIN tblBranch b ON l.branch_id = b.id WHERE l.id = ?`, [req.params.id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    const schedule = await dbAll('SELECT * FROM tblAmortizationSchedule WHERE loan_id = ? ORDER BY period_number', [req.params.id]);
    const payments = await dbAll(`SELECT * FROM tblPayment WHERE loan_id = ? ORDER BY date_paid DESC`, [req.params.id]);
    res.json({ ...loan, schedule, payments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { customer_id, collector_id, branch_id, loan_type, principal, interest_rate, date_released, remarks, status } = req.body;
    if (!customer_id || !principal || !date_released) return res.status(400).json({ error: 'customer_id, principal, date_released required' });
    const { interest_amount, total_amortization, amortization } = computeAmortization(principal, interest_rate || 0, 45);
    const date_maturity = computeMaturityDate(date_released, 45);
    const { service_fee, total_deductions, net_proceeds } = computeNetProceeds(principal, 0, 0, 0, 0);
    const count = (await dbGet('SELECT COUNT(*) as c FROM tblLoan')).c;
    const loan_code = `LN-${String(count + 1).padStart(6, '0')}`;
    const loan_status = status || 'pending';
    const result = await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, interest_amount, loan_period, date_released, date_maturity, amortization, total_amortization, service_fee, insurance, notarial_fee, filing_fee, total_deductions, net_proceeds, balance, or_number, remarks, created_by, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, customer_id, collector_id, branch_id || null, loan_type || 'New', principal, interest_rate || 0, interest_amount, 45, date_released, date_maturity, amortization, total_amortization, 0, 0, 0, 0, 0, net_proceeds, total_amortization, '', remarks, req.user.id, loan_status]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'CREATE', 'LOAN', result.lastID, `New loan created (${loan_status}): ${loan_code}`]);
    res.status(201).json({ id: result.lastID, loan_code, amortization, total_amortization, date_maturity, net_proceeds });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/status', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { status } = req.body;
    await dbRun(`UPDATE tblLoan SET status=?, updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
    
    // If loan is reversed, mark all unpaid amortization schedules as reversed too
    if (status === 'reversed') {
      await dbRun(`UPDATE tblAmortizationSchedule SET status='reversed' WHERE loan_id=? AND status='unpaid'`, [req.params.id]);
    }
    
    res.json({ message: 'Loan status updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/ci', authenticateToken, async (req, res) => {
  try {
    const ci = await dbGet(`SELECT * FROM tblCreditInvestigation WHERE loan_id = ?`, [req.params.id]);
    res.json(ci || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/ci', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const loan_id = req.params.id;
    const loan = await dbGet('SELECT * FROM tblLoan WHERE id = ?', [loan_id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.status !== 'pending') return res.status(400).json({ error: 'Loan is not pending' });

    const {
      daily_sales, daily_expenses, other_income, other_loans,
      exp_electricity, exp_water, exp_internet, exp_transport, exp_rental, exp_food, exp_appliances, exp_allowance, exp_tuition, exp_misc,
      check_location, check_activity, check_residency, check_borrowing, check_understanding, check_permit, check_purpose, check_source, check_consent, check_escalate,
      ci_notes, endorsement
    } = req.body;

    // Check if CI already exists
    const existing = await dbGet('SELECT id FROM tblCreditInvestigation WHERE loan_id = ?', [loan_id]);
    if (existing) {
      await dbRun(`UPDATE tblCreditInvestigation SET 
        daily_sales=?, daily_expenses=?, other_income=?, other_loans=?,
        exp_electricity=?, exp_water=?, exp_internet=?, exp_transport=?, exp_rental=?, exp_food=?, exp_appliances=?, exp_allowance=?, exp_tuition=?, exp_misc=?,
        check_location=?, check_activity=?, check_residency=?, check_borrowing=?, check_understanding=?, check_permit=?, check_purpose=?, check_source=?, check_consent=?, check_escalate=?,
        ci_notes=?, endorsement=?, encoded_by=? WHERE id=?`,
        [daily_sales, daily_expenses, other_income, other_loans, exp_electricity, exp_water, exp_internet, exp_transport, exp_rental, exp_food, exp_appliances, exp_allowance, exp_tuition, exp_misc,
         check_location, check_activity, check_residency, check_borrowing, check_understanding, check_permit, check_purpose, check_source, check_consent, check_escalate, ci_notes, endorsement, req.user.id, existing.id]);
    } else {
      await dbRun(`INSERT INTO tblCreditInvestigation (
        loan_id, daily_sales, daily_expenses, other_income, other_loans,
        exp_electricity, exp_water, exp_internet, exp_transport, exp_rental, exp_food, exp_appliances, exp_allowance, exp_tuition, exp_misc,
        check_location, check_activity, check_residency, check_borrowing, check_understanding, check_permit, check_purpose, check_source, check_consent, check_escalate,
        ci_notes, endorsement, encoded_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [loan_id, daily_sales, daily_expenses, other_income, other_loans, exp_electricity, exp_water, exp_internet, exp_transport, exp_rental, exp_food, exp_appliances, exp_allowance, exp_tuition, exp_misc,
         check_location, check_activity, check_residency, check_borrowing, check_understanding, check_permit, check_purpose, check_source, check_consent, check_escalate, ci_notes, endorsement, req.user.id]);
    }

    if (endorsement === 'for_approval') {
      await dbRun(`UPDATE tblLoan SET status='for_approval', updated_at=datetime('now') WHERE id=?`, [loan_id]);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'FOR_APPROVAL', 'LOAN', loan_id, `CI Submitted for Manager Approval`]);
    } else if (endorsement === 'approve' || endorsement === 'Approve') {
      await dbRun(`UPDATE tblLoan SET status='approved', updated_at=datetime('now') WHERE id=?`, [loan_id]);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'APPROVE', 'LOAN', loan_id, `CI Approved (Waiting for Release)`]);
    } else if (endorsement === 'reject' || endorsement === 'Reject') {
      await dbRun(`UPDATE tblLoan SET status='rejected', updated_at=datetime('now') WHERE id=?`, [loan_id]);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REJECT', 'LOAN', loan_id, `Loan Rejected via CI`]);
    }

    res.json({ message: 'CI Form saved successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/manager-decision', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const loan_id = req.params.id;
    const loan = await dbGet('SELECT * FROM tblLoan WHERE id = ?', [loan_id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.status !== 'for_approval') return res.status(400).json({ error: 'Loan is not awaiting manager approval' });

    const { decision, remarks, approved_amount } = req.body;

    if (decision === 'approve') {
      await dbRun(`UPDATE tblLoan SET status='approved', updated_at=datetime('now') WHERE id=?`, [loan_id]);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'APPROVE', 'LOAN', loan_id, `Manager Approved Loan`]);
    } else if (decision === 'reject') {
      await dbRun(`UPDATE tblLoan SET status='rejected', remarks=?, updated_at=datetime('now') WHERE id=?`, [remarks || '', loan_id]);
      await dbRun(`UPDATE tblCustomer SET status='hold' WHERE id=?`, [loan.customer_id]);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REJECT', 'LOAN', loan_id, `Manager Rejected Loan: ${remarks || 'No remarks'}`]);
    } else if (decision === 'reduce') {
      if (!approved_amount) return res.status(400).json({ error: 'Approved amount is required' });
      const newPrincipal = Number(approved_amount);
      const { interest_amount, total_amortization, amortization } = computeAmortization(newPrincipal, loan.interest_rate || 0, loan.loan_period || 45);
      const { net_proceeds } = computeNetProceeds(newPrincipal, 0, 0, 0, 0);
      
      const newRemarks = loan.remarks ? `${loan.remarks} | Reduced: ${remarks}` : `Reduced: ${remarks}`;
      
      await dbRun(`UPDATE tblLoan SET principal=?, interest_amount=?, amortization=?, total_amortization=?, balance=?, net_proceeds=?, remarks=?, status='approved', updated_at=datetime('now') WHERE id=?`, 
        [newPrincipal, interest_amount, amortization, total_amortization, total_amortization, net_proceeds, newRemarks, loan_id]);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REDUCE', 'LOAN', loan_id, `Manager Reduced Loan to ${newPrincipal}: ${remarks}`]);
    } else {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    res.json({ message: 'Manager decision recorded successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/release', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const loan = await dbGet(`SELECT * FROM tblLoan WHERE id=?`, [req.params.id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.status !== 'approved') return res.status(400).json({ error: 'Only approved loans can be released' });

    const date_released = req.body.date_released || loan.date_released;
    const date_maturity = computeMaturityDate(date_released, 45);

    // Mark active and generate schedule
    await dbRun(`UPDATE tblLoan SET status='active', date_released=?, date_maturity=?, updated_at=datetime('now') WHERE id=?`, [date_released, date_maturity, req.params.id]);
    const schedule = generateAmortizationSchedule(loan.id, date_released, loan.loan_period, loan.amortization);
    for (const s of schedule) {
      await dbRun(`INSERT INTO tblAmortizationSchedule (loan_id, period_number, due_date, amount_due, status) VALUES (?,?,?,?,?)`, [s.loan_id, s.period_number, s.due_date, s.amount_due, s.status]);
    }
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RELEASE', 'LOAN', loan.id, `Loan Released`]);
    res.json({ message: 'Loan released successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/approve-reloan', authenticateToken, async (req, res) => {
  try {
    const loan_id = req.params.id;
    const loan = await dbGet('SELECT * FROM tblLoan WHERE id = ?', [loan_id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.status !== 'reloan_pending') return res.status(400).json({ error: 'Loan is not a pending reloan' });

    await dbRun(`UPDATE tblLoan SET status='approved', updated_at=datetime('now') WHERE id=?`, [loan_id]);
    await dbRun(`UPDATE tblCustomer SET status='RELOAN APPROVED', updated_at=datetime('now') WHERE id=?`, [loan.customer_id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'APPROVE_RELOAN', 'LOAN', loan_id, `Manager Approved Re-Loan`]);
    res.json({ message: 'Reloan approved successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/reject-reloan', authenticateToken, async (req, res) => {
  try {
    const loan_id = req.params.id;
    const { remarks } = req.body;
    if (!remarks) return res.status(400).json({ error: 'Remarks are required for rejection' });

    const loan = await dbGet('SELECT * FROM tblLoan WHERE id = ?', [loan_id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.status !== 'reloan_pending') return res.status(400).json({ error: 'Loan is not a pending reloan' });

    await dbRun(`UPDATE tblLoan SET status='rejected', remarks=?, updated_at=datetime('now') WHERE id=?`, [remarks, loan_id]);
    await dbRun(`UPDATE tblCustomer SET status='RELOAN REJECTED', updated_at=datetime('now') WHERE id=?`, [loan.customer_id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REJECT_RELOAN', 'LOAN', loan_id, `Manager Rejected Re-Loan: ${remarks}`]);
    res.json({ message: 'Reloan rejected successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
