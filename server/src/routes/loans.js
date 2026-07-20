const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { computeAmortization, computeMaturityDate, generateAmortizationSchedule, computeNetProceeds } = require('../services/loanCalculator');
const { requireOperationDate, sqlNotSunday } = require('../services/operationDays');
const router = express.Router();
const sendRouteError = (res, err) => res.status(err.statusCode || 500).json({ error: err.message });

const isNewLoanType = type => ['new', 'new loan'].includes(String(type || '').trim().toLowerCase());
const passbookForLoan = loan => isNewLoanType(loan?.loan_type) ? 50 : Number(loan?.passbook || 0);

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, status, customer_id, collector_id } = req.query;
    let q = `SELECT l.*, COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown Customer (Deleted)') as customer_name, c.customer_code, c.status as customer_status, (SELECT h.remarks FROM tblCustomerStatusHistory h WHERE h.customer_id = l.customer_id AND LOWER(h.new_status) = LOWER(c.status) ORDER BY h.created_at DESC, h.id DESC LIMIT 1) as status_note, c.photo_client, c.photo_id_front, co.first_name || ' ' || co.last_name as collector_name, b.branch_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id LEFT JOIN tblBranch b ON l.branch_id = b.id WHERE 1=1`;
    const p = [];
    if (search) { q += ` AND (c.full_name LIKE ? OR l.loan_code LIKE ? OR c.customer_code LIKE ?)`; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { 
        if (status === 'relax' || status === 'hold') {
            q += ` AND LOWER(c.status) = ? AND l.id = (SELECT MAX(id) FROM tblLoan WHERE customer_id = c.id)`; 
            p.push(status);
        } else {
            q += ` AND l.status = ?`; 
            p.push(status);
        }
    }
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
    requireOperationDate(targetDate, 'Collection sheet date');
    
    const loans = await dbAll(`
      SELECT l.*, COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown Customer (Deleted)') as customer_name, c.customer_code, c.photo_client, c.photo_id_front,
             (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date_paid = ? AND status IN ('active', 'penalty') AND ${sqlNotSunday('date_paid')}) as collected_today
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      WHERE l.collector_id = ? AND LOWER(l.status) IN ('active', 'pastdue') AND COALESCE(l.balance, 0) > 0
      ORDER BY CAST(c.customer_code AS INTEGER) ASC, c.customer_code ASC
    `, [targetDate, collector_id]);
    
    const summary = {
      total_clients: loans.length,
      total_due: loans.reduce((s, l) => s + l.amortization, 0),
      total_collected: loans.reduce((s, l) => s + l.collected_today, 0),
    };
    
    res.json({ loans, summary });
  } catch (err) { sendRouteError(res, err); }
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
    const loanStatus = String(loan.status || '').toLowerCase();
    if (Number(loan.balance || 0) <= 0 || loanStatus === 'fullpaid') return res.status(400).json({ error: 'This account is already fully paid.', is_fully_paid: true });
    if (loanStatus !== 'active' && loanStatus !== 'pastdue') return res.status(400).json({ error: 'This account is inactive and cannot accept payments.', is_inactive: true });

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
    const { customer_id, collector_id, branch_id, loan_type, principal, interest_rate, date_released, previous_balance, penalty, passbook, remarks, status } = req.body;
    if (!customer_id || !principal || !date_released) return res.status(400).json({ error: 'customer_id, principal, date_released required' });
    requireOperationDate(date_released, 'Release date');
    const { interest_amount, total_amortization, amortization } = computeAmortization(principal, interest_rate || 0, 45);
    const date_maturity = computeMaturityDate(date_released, 45);
    const balanceAmount = Number(previous_balance || 0);
    const penaltyAmount = Number(penalty || 0);
    const passbookAmount = passbook === undefined || passbook === null || passbook === ''
      ? (isNewLoanType(loan_type || 'New') ? 50 : 0)
      : Number(passbook || 0);
    const { service_fee, total_deductions } = computeNetProceeds(principal, 0, 0, 0, 0);
    const net_proceeds = Number(principal || 0);
    const maxLoan = await dbGet("SELECT MAX(CAST(REPLACE(loan_code, 'LN-', '') AS INTEGER)) as c FROM tblLoan");
    const loan_code = `LN-${String((maxLoan?.c || 0) + 1).padStart(6, '0')}`;
    const loan_status = status || 'pending';
    const result = await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, interest_amount, loan_period, date_released, date_maturity, amortization, total_amortization, service_fee, insurance, notarial_fee, filing_fee, total_deductions, net_proceeds, balance, previous_balance, penalty, passbook, or_number, remarks, created_by, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, customer_id, collector_id, branch_id || null, loan_type || 'New', principal, interest_rate || 0, interest_amount, 45, date_released, date_maturity, amortization, total_amortization, 0, 0, 0, 0, 0, net_proceeds, total_amortization, balanceAmount, penaltyAmount, passbookAmount, '', remarks, req.user.id, loan_status]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'CREATE', 'LOAN', result.lastID, `New loan created (${loan_status}): ${loan_code}`]);
    res.status(201).json({ id: result.lastID, loan_code, amortization, total_amortization, date_maturity, net_proceeds });
  } catch (err) { sendRouteError(res, err); }
});

router.put('/:id/edit', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const loan_id = req.params.id;
    const { principal, interest_rate, loan_period, date_released } = req.body;
    
    if (!principal || !loan_period || !date_released) {
      return res.status(400).json({ error: 'Principal, loan period, and date released are required' });
    }
    requireOperationDate(date_released, 'Release date');

    const loan = await dbGet('SELECT * FROM tblLoan WHERE id = ?', [loan_id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    
    const paymentsCount = await dbGet(`SELECT COUNT(*) as c FROM tblPayment WHERE loan_id = ? AND status != 'reversed'`, [loan_id]);
    if (paymentsCount.c > 0) {
      return res.status(400).json({ error: 'Cannot edit a loan that already has active payments. Please reverse the payments first.' });
    }

    if (loan.dcr_id) {
      return res.status(400).json({ error: 'Cannot edit a loan that has already been closed in a Daily Cash Report.' });
    }

    const period = parseInt(loan_period) || 45;
    const interestRate = parseFloat(interest_rate) || 0;
    const principalAmount = parseFloat(principal);
    
    const interestAmount = principalAmount * (interestRate / 100);
    const totalAmortization = principalAmount + interestAmount;
    
    const { computeMaturityDate, getWorkingDays, generateAmortizationSchedule } = require('../services/loanCalculator');
    
    const dateMaturity = computeMaturityDate(date_released, period);
    const workingDays = getWorkingDays(period);
    const amortization = principalAmount > 0 && workingDays > 0 ? Math.ceil(totalAmortization / workingDays) : 0;

    await dbRun('BEGIN TRANSACTION');

    await dbRun(`
      UPDATE tblLoan 
      SET principal = ?, interest_rate = ?, interest_amount = ?, loan_period = ?, 
          date_released = ?, date_maturity = ?, amortization = ?, total_amortization = ?,
          net_proceeds = ?, balance = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [principalAmount, interestRate, interestAmount, period, date_released, dateMaturity, amortization, totalAmortization, principalAmount, totalAmortization, loan_id]);

    await dbRun(`DELETE FROM tblAmortizationSchedule WHERE loan_id = ?`, [loan_id]);

    const schedule = generateAmortizationSchedule(loan_id, date_released, period, amortization);
    for (const s of schedule) {
      await dbRun(`INSERT INTO tblAmortizationSchedule (loan_id, period_number, due_date, amount_due, status) VALUES (?,?,?,?,?)`, 
        [s.loan_id, s.period_number, s.due_date, s.amount_due, s.status]);
    }

    const details = `Edited loan ${loan.loan_code}. Old: P${loan.principal}/${loan.loan_period}days/${loan.date_released}. New: P${principalAmount}/${period}days/${date_released}.`;
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, 
      [req.user.id, req.user.username, 'EDIT', 'LOAN', loan_id, details]);

    await dbRun('COMMIT');
    res.json({ message: 'Loan updated successfully', loan_id, date_maturity: dateMaturity, amortization });
  } catch (err) {
    await dbRun('ROLLBACK').catch(() => {});
    console.error('Error editing loan:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Server error editing loan' });
  }
});

router.put('/:id/status', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { status } = req.body;
    await dbRun(`UPDATE tblLoan SET status=?, updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
    
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
      loan_history, business_years, no_hardship, cb_rating,
      ci_notes, endorsement
    } = req.body;

    // Check if CI already exists
    const existing = await dbGet('SELECT id FROM tblCreditInvestigation WHERE loan_id = ?', [loan_id]);
    if (existing) {
      await dbRun(`UPDATE tblCreditInvestigation SET 
        daily_sales=?, daily_expenses=?, other_income=?, other_loans=?,
        exp_electricity=?, exp_water=?, exp_internet=?, exp_transport=?, exp_rental=?, exp_food=?, exp_appliances=?, exp_allowance=?, exp_tuition=?, exp_misc=?,
        check_location=?, check_activity=?, check_residency=?, check_borrowing=?, check_understanding=?, check_permit=?, check_purpose=?, check_source=?, check_consent=?, check_escalate=?,
        loan_history=?, business_years=?, no_hardship=?, cb_rating=?,
        ci_notes=?, endorsement=?, encoded_by=? WHERE id=?`,
        [daily_sales, daily_expenses, other_income, other_loans, exp_electricity, exp_water, exp_internet, exp_transport, exp_rental, exp_food, exp_appliances, exp_allowance, exp_tuition, exp_misc,
         check_location, check_activity, check_residency, check_borrowing, check_understanding, check_permit, check_purpose, check_source, check_consent, check_escalate, 
         loan_history, business_years, no_hardship, cb_rating, ci_notes, endorsement, req.user.id, existing.id]);
    } else {
      await dbRun(`INSERT INTO tblCreditInvestigation (
        loan_id, daily_sales, daily_expenses, other_income, other_loans,
        exp_electricity, exp_water, exp_internet, exp_transport, exp_rental, exp_food, exp_appliances, exp_allowance, exp_tuition, exp_misc,
        check_location, check_activity, check_residency, check_borrowing, check_understanding, check_permit, check_purpose, check_source, check_consent, check_escalate,
        loan_history, business_years, no_hardship, cb_rating,
        ci_notes, endorsement, encoded_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [loan_id, daily_sales, daily_expenses, other_income, other_loans, exp_electricity, exp_water, exp_internet, exp_transport, exp_rental, exp_food, exp_appliances, exp_allowance, exp_tuition, exp_misc,
         check_location, check_activity, check_residency, check_borrowing, check_understanding, check_permit, check_purpose, check_source, check_consent, check_escalate, 
         loan_history, business_years, no_hardship, cb_rating, ci_notes, endorsement, req.user.id]);
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
      const approvalRemarks = String(remarks || '').trim();
      const newRemarks = approvalRemarks
        ? (loan.remarks ? `${loan.remarks} | Manager Note: ${approvalRemarks}` : `Manager Note: ${approvalRemarks}`)
        : (loan.remarks || '');
      await dbRun(`UPDATE tblLoan SET status='active', passbook=?, remarks=?, updated_at=datetime('now') WHERE id=?`, [passbookForLoan(loan), newRemarks, loan_id]);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'APPROVE', 'LOAN', loan_id, `Manager Approved Loan${approvalRemarks ? `: ${approvalRemarks}` : ''}`]);
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
      
      await dbRun(`UPDATE tblLoan SET principal=?, interest_amount=?, amortization=?, total_amortization=?, balance=?, net_proceeds=?, passbook=?, remarks=?, status='active', updated_at=datetime('now') WHERE id=?`,
        [newPrincipal, interest_amount, amortization, total_amortization, total_amortization, net_proceeds, passbookForLoan(loan), newRemarks, loan_id]);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'REDUCE', 'LOAN', loan_id, `Manager Reduced Loan to ${newPrincipal}: ${remarks}`]);
    } else {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    if (decision === 'approve' || decision === 'reduce') {
      const updatedLoan = await dbGet('SELECT * FROM tblLoan WHERE id = ?', [loan_id]);
      const date_released = new Date().toISOString().split('T')[0];
      requireOperationDate(date_released, 'Release date');
      const date_maturity = computeMaturityDate(date_released, updatedLoan.loan_period || 45);
      
      await dbRun(`UPDATE tblLoan SET date_released=?, date_maturity=? WHERE id=?`, [date_released, date_maturity, loan_id]);
      const schedule = generateAmortizationSchedule(updatedLoan.id, date_released, updatedLoan.loan_period || 45, updatedLoan.amortization);
      for (const s of schedule) {
        await dbRun(`INSERT INTO tblAmortizationSchedule (loan_id, period_number, due_date, amount_due, status) VALUES (?,?,?,?,?)`, [s.loan_id, s.period_number, s.due_date, s.amount_due, s.status]);
      }
      
      const cust = await dbGet('SELECT status FROM tblCustomer WHERE id = ?', [updatedLoan.customer_id]);
      await dbRun(`UPDATE tblCustomer SET status='active', updated_at=datetime('now') WHERE id=?`, [updatedLoan.customer_id]);
      await dbRun(`INSERT INTO tblCustomerStatusHistory (customer_id, previous_status, new_status, changed_by, remarks) VALUES (?, ?, ?, ?, ?)`,
        [updatedLoan.customer_id, cust ? cust.status : '', 'active', req.user.id, `Loan auto-released on approval: ${updatedLoan.loan_code}`]);
      await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RELEASE', 'LOAN', updatedLoan.id, `Loan Auto-Released on Manager Approval`]);
    }

    res.json({ message: 'Manager decision recorded successfully' });
  } catch (err) { sendRouteError(res, err); }
});

router.post('/:id/release', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const loan = await dbGet(`SELECT * FROM tblLoan WHERE id=?`, [req.params.id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.status !== 'approved') return res.status(400).json({ error: 'Only approved loans can be released' });

    const date_released = req.body.date_released || loan.date_released;
    requireOperationDate(date_released, 'Release date');
    const date_maturity = computeMaturityDate(date_released, 45);

    // Mark active and generate schedule
    await dbRun(`UPDATE tblLoan SET status='active', date_released=?, date_maturity=?, passbook=?, updated_at=datetime('now') WHERE id=?`, [date_released, date_maturity, passbookForLoan(loan), req.params.id]);
    const schedule = generateAmortizationSchedule(loan.id, date_released, loan.loan_period, loan.amortization);
    for (const s of schedule) {
      await dbRun(`INSERT INTO tblAmortizationSchedule (loan_id, period_number, due_date, amount_due, status) VALUES (?,?,?,?,?)`, [s.loan_id, s.period_number, s.due_date, s.amount_due, s.status]);
    }
    await dbRun(`UPDATE tblCustomer SET status='active', updated_at=datetime('now') WHERE id=?`, [loan.customer_id]);
    await dbRun(`INSERT INTO tblCustomerStatusHistory (customer_id, previous_status, new_status, changed_by, remarks) VALUES (?, (SELECT status FROM tblCustomer WHERE id=?), 'active', ?, 'Loan Released')`, [loan.customer_id, loan.customer_id, req.user.id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RELEASE', 'LOAN', loan.id, `Loan Released`]);
    res.json({ message: 'Loan released successfully' });
  } catch (err) { sendRouteError(res, err); }
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

router.delete('/:id', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const loan_id = req.params.id;
    const loan = await dbGet('SELECT * FROM tblLoan WHERE id = ?', [loan_id]);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    
    await dbRun('DELETE FROM tblLoan WHERE id = ?', [loan_id]);
    await dbRun('DELETE FROM tblCreditInvestigation WHERE loan_id = ?', [loan_id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, 
      [req.user.id, req.user.username, 'DELETE', 'LOAN', loan_id, `Deleted loan ${loan.loan_code}`]);
    
    res.json({ message: 'Loan deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
