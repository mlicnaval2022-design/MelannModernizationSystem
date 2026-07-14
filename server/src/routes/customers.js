const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { computeMaturityDate, generateAmortizationSchedule } = require('../services/loanCalculator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, uploadDir); },
  filename: function(req, file, cb) { cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')); }
});
const upload = multer({ storage });

async function ensureComplianceChecklistColumns() {
  const cols = await dbAll(`PRAGMA table_info(tblCustomer)`);
  const names = new Set(cols.map(c => c.name));
  if (!names.has('for_bir')) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN for_bir INTEGER DEFAULT 0`);
  if (!names.has('for_cic')) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN for_cic INTEGER DEFAULT 0`);
  if (!names.has('for_sec')) await dbRun(`ALTER TABLE tblCustomer ADD COLUMN for_sec INTEGER DEFAULT 0`);
}

const toDateOnly = (value) => {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const daysBetween = (from, to) => {
  const start = toDateOnly(from);
  const end = toDateOnly(to);
  if (!start || !end) return 0;
  return Math.floor((end - start) / 86400000);
};

const getPenaltyRate = (daysOverdue) => {
  if (daysOverdue >= 30) return 5;
  if (daysOverdue >= 15) return 3;
  if (daysOverdue >= 8) return 2;
  if (daysOverdue >= 1) return 1;
  return 0;
};

const getPaymentConsistency = (loan, payments) => {
  const principal = Number(loan.principal || 0);
  const totalLoan = Number(loan.total_amortization || loan.principal || 0);
  const activePayments = payments.filter(p => p.status !== 'reversed').sort((a, b) => {
    const byDate = String(a.date_paid || '').localeCompare(String(b.date_paid || ''));
    return byDate || Number(a.id || 0) - Number(b.id || 0);
  });
  const totalPaid = activePayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
  const lastPayment = activePayments[activePayments.length - 1] || null;
  const finalPaymentAmount = lastPayment ? Number(lastPayment.amount_paid || 0) : 0;
  const paidBeforeFinal = Math.max(0, totalPaid - finalPaymentAmount);
  const paidBeforeFinalPercent = totalLoan > 0 ? Math.round((paidBeforeFinal / totalLoan) * 100) : 0;
  const totalPaidPercent = totalLoan > 0 ? Math.round((totalPaid / totalLoan) * 100) : 0;
  const finalPaymentPercent = totalLoan > 0 ? Math.round((finalPaymentAmount / totalLoan) * 100) : 0;
  const finalBeforeMaturity = lastPayment && loan.date_maturity ? daysBetween(lastPayment.date_paid, loan.date_maturity) > 0 : false;
  const uniquePaymentDays = new Set(activePayments.map(p => p.date_paid).filter(Boolean)).size;
  const expectedDailyDays = Number(loan.loan_period || 0);
  const dailyPaymentPercent = expectedDailyDays > 0 ? Math.round((uniquePaymentDays / expectedDailyDays) * 100) : 0;
  const lumpSumAdvance = finalBeforeMaturity && finalPaymentPercent >= 40 && dailyPaymentPercent < 80;

  let label = 'No payment history';
  let risk = 'neutral';
  let scoreAdjustment = -10;

  if (lumpSumAdvance && paidBeforeFinalPercent <= 30) {
    label = 'Bad - low daily payment history before advance payoff';
    risk = 'bad';
    scoreAdjustment = -35;
  } else if (lumpSumAdvance && paidBeforeFinalPercent < 50) {
    label = 'Fair - advance payoff with weak daily payment consistency';
    risk = 'fair';
    scoreAdjustment = -20;
  } else if (paidBeforeFinalPercent >= 90 || dailyPaymentPercent >= 90) {
    label = 'Excellent - consistent daily payments';
    risk = 'excellent';
    scoreAdjustment = 5;
  } else if (paidBeforeFinalPercent >= 50 || dailyPaymentPercent >= 50) {
    label = 'Good - acceptable payment consistency';
    risk = 'good';
    scoreAdjustment = 0;
  } else if (activePayments.length > 0) {
    label = 'Bad - insufficient daily payment consistency';
    risk = 'bad';
    scoreAdjustment = -30;
  }

  return {
    total_paid: totalPaid,
    total_paid_percent: totalPaidPercent,
    paid_before_final: paidBeforeFinal,
    paid_before_final_percent: paidBeforeFinalPercent,
    final_payment_amount: finalPaymentAmount,
    final_payment_percent: finalPaymentPercent,
    final_payment_date: lastPayment ? lastPayment.date_paid : null,
    final_before_maturity: finalBeforeMaturity,
    unique_payment_days: uniquePaymentDays,
    expected_daily_days: expectedDailyDays,
    daily_payment_percent: dailyPaymentPercent,
    lump_sum_advance: lumpSumAdvance,
    label,
    risk,
    score_adjustment: scoreAdjustment
  };
};

router.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

router.get('/list/fully-paid', authenticateToken, async (req, res) => {
  try {
    const fullyPaid = await dbAll(`
      SELECT 
        c.id, c.customer_code, c.full_name as client_name, c.status,
        co.first_name || ' ' || co.last_name as collector_name,
        (SELECT l.principal FROM tblLoan l WHERE l.customer_id = c.id ORDER BY l.date_released DESC LIMIT 1) as last_loan_amount,
        (SELECT l.date_released FROM tblLoan l WHERE l.customer_id = c.id ORDER BY l.date_released DESC LIMIT 1) as date_released,
        (SELECT p.date_paid FROM tblPayment p JOIN tblLoan l ON p.loan_id = l.id WHERE l.customer_id = c.id AND l.status='fullpaid' ORDER BY p.date_paid DESC LIMIT 1) as date_fully_paid,
        (SELECT COUNT(*) FROM tblLoan l WHERE l.customer_id = c.id) as loan_cycles
      FROM tblCustomer c
      LEFT JOIN tblCollector co ON c.collector_id = co.id
      WHERE c.status = 'FULLY PAID'
        AND EXISTS (
          SELECT 1
          FROM tblLoan paid
          WHERE paid.customer_id = c.id
            AND LOWER(COALESCE(paid.status, '')) = 'fullpaid'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM tblLoan open_loan
          WHERE open_loan.customer_id = c.id
            AND LOWER(COALESCE(open_loan.status, '')) NOT IN ('fullpaid', 'closed', 'rejected', 'cancelled', 'reversed')
            AND COALESCE(open_loan.balance, 0) > 0
        )
    `);
    
    const today = new Date().toISOString().split('T')[0];
    for (let c of fullyPaid) {
      const stats = await dbGet(`SELECT COUNT(*) as total_sched, SUM(CASE WHEN s.status='paid' AND date_paid > due_date THEN 1 ELSE 0 END) as late FROM tblAmortizationSchedule s JOIN tblLoan l ON s.loan_id=l.id WHERE l.customer_id=?`, [c.id]);
      const pastDues = await dbGet(`SELECT COUNT(*) as pd FROM tblLoan WHERE customer_id=? AND status='pastdue'`, [c.id]);
      
      const lastLoan = await dbGet(`
        SELECT * FROM tblLoan WHERE customer_id = ?
        ORDER BY COALESCE(date_released, created_at) DESC, id DESC LIMIT 1`, [c.id]);
      const payments = lastLoan
        ? await dbAll(`SELECT * FROM tblPayment WHERE loan_id = ? AND status != 'reversed' ORDER BY date_paid ASC, id ASC`, [lastLoan.id])
        : [];
      
      const consistency = lastLoan ? getPaymentConsistency(lastLoan, payments) : getPaymentConsistency({}, []);
      
      const daysOverdue = lastLoan && lastLoan.date_maturity && Number(lastLoan.balance || 0) > 0
        ? Math.max(0, daysBetween(lastLoan.date_maturity, today))
        : 0;

      let score = 100 - ((stats && stats.late ? stats.late : 0) * 2) - ((pastDues && pastDues.pd ? pastDues.pd : 0) * 20) + consistency.score_adjustment;
      if (daysOverdue > 0) score -= Math.min(40, daysOverdue * 2);
      c.credit_score = Math.max(0, score);
    }
    res.json(fullyPaid);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, status, branch_id, collector_id } = req.query;
    let q = `
      SELECT c.*, b.branch_name,
        COALESCE(
          NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
          (
            SELECT NULLIF(TRIM(co2.first_name || ' ' || co2.last_name), '')
            FROM tblLoan l2
            JOIN tblCollector co2 ON co2.id = l2.collector_id
            WHERE l2.customer_id = c.id
              AND l2.collector_id IS NOT NULL
            ORDER BY
              CASE WHEN l2.status IN ('active', 'pastdue') THEN 0 ELSE 1 END,
              COALESCE(l2.date_released, l2.created_at) DESC,
              l2.id DESC
            LIMIT 1
          )
        ) as collector_name,
        (
           SELECT date_maturity FROM tblLoan l 
           WHERE l.customer_id = c.id AND l.status NOT IN ('fullpaid', 'closed', 'rejected', 'cancelled', 'reversed')
           ORDER BY CASE WHEN l.status IN ('active', 'pastdue', 'overdue', 'approved') THEN 0 ELSE 1 END, created_at DESC LIMIT 1
        ) as active_loan_maturity,
        (
           SELECT loan_type FROM tblLoan l 
           WHERE l.customer_id = c.id AND l.status NOT IN ('fullpaid', 'closed', 'rejected', 'cancelled', 'reversed')
           ORDER BY CASE WHEN l.status IN ('active', 'pastdue', 'overdue', 'approved') THEN 0 ELSE 1 END, created_at DESC LIMIT 1
        ) as active_loan_type,
        (
           SELECT status FROM tblLoan l 
           WHERE l.customer_id = c.id AND l.status NOT IN ('fullpaid', 'closed', 'rejected', 'cancelled', 'reversed')
           ORDER BY CASE WHEN l.status IN ('active', 'pastdue', 'overdue', 'approved') THEN 0 ELSE 1 END, created_at DESC LIMIT 1
        ) as active_loan_status
      FROM tblCustomer c
      LEFT JOIN tblBranch b ON c.branch_id = b.id
      LEFT JOIN tblCollector co ON c.collector_id = co.id
      WHERE 1=1`;
    const p = [];
    if (search) { q += ` AND (c.full_name LIKE ? OR c.customer_code LIKE ? OR c.contact LIKE ?)`; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { q += ` AND c.status = ?`; p.push(status); }
    if (branch_id) { q += ` AND c.branch_id = ?`; p.push(branch_id); }
    if (collector_id) { q += ` AND c.collector_id = ?`; p.push(collector_id); }
    if (search) { 
      q += ` ORDER BY CASE WHEN c.customer_code = ? THEN 0 ELSE 1 END, c.last_name, c.first_name`; 
      p.push(search.trim());
    } else {
      q += ` ORDER BY c.last_name, c.first_name`;
    }
    const rows = await dbAll(q, p);
    const today = new Date();
    today.setHours(0,0,0,0);
    const finalRows = rows.map(r => {
      let displayStatus = r.status || 'Active';
      if (r.active_loan_status) {
        let isPastdue = false;
        let isOverdue = false;
        if (r.active_loan_maturity) {
          const maturity = new Date(r.active_loan_maturity);
          maturity.setHours(0,0,0,0);
          const diffDays = Math.ceil((today.getTime() - maturity.getTime()) / (1000 * 3600 * 24));
          if (diffDays > 45) isPastdue = true;
          else if (diffDays >= 1) isOverdue = true;
        }
        
        if (isPastdue) {
          displayStatus = 'Pastdue';
        } else if (isOverdue) {
          displayStatus = 'Overdue';
        } else {
          const lType = (r.active_loan_type || '').toLowerCase();
          const lStatus = (r.active_loan_status || '').toLowerCase();
          if (lType === 're-loan' || lType === 'reloan' || lStatus === 'reloan_pending') {
            displayStatus = 'Reloan';
          } else if (lType === 'recon') {
            displayStatus = 'Recon';
          } else {
            displayStatus = String(r.active_loan_status).replace(/_/g, ' ');
            displayStatus = displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1);
          }
        }
      }
      return { ...r, display_status: displayStatus };
    });
    res.json(finalRows);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/compliance-checklist/list', authenticateToken, async (req, res) => {
  try {
    await ensureComplianceChecklistColumns();
    const { search, status, release_date } = req.query;
    let q = `
      SELECT c.id, c.customer_code, c.full_name, c.contact, c.status, c.for_bir, c.for_cic, c.for_sec,
             COALESCE(NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''), 'Unassigned') as collector_name,
             CASE WHEN EXISTS (
               SELECT 1 FROM tblLoan l
               WHERE l.customer_id = c.id
                 AND l.date_released = ?
                 AND l.status != 'cancelled'
             ) THEN 1 ELSE 0 END as has_release_today
      FROM tblCustomer c
      LEFT JOIN tblCollector co ON c.collector_id = co.id
      WHERE 1=1`;
    const p = [release_date || ''];
    if (search) {
      q += ` AND (c.full_name LIKE ? OR c.customer_code LIKE ? OR c.contact LIKE ?)`;
      p.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      q += ` AND c.status = ?`;
      p.push(status);
    }
    if (release_date) {
      q += ` AND EXISTS (
        SELECT 1 FROM tblLoan l
        WHERE l.customer_id = c.id
          AND l.date_released = ?
          AND l.status != 'cancelled'
      )`;
      p.push(release_date);
    }
    q += ` ORDER BY has_release_today DESC, c.last_name, c.first_name LIMIT 500`;
    res.json(await dbAll(q, p));
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/compliance-checklist/bulk', authenticateToken, async (req, res) => {
  try {
    await ensureComplianceChecklistColumns();
    const { customers } = req.body;
    if (!Array.isArray(customers)) return res.status(400).json({ error: 'customers array is required' });
    let updated = 0;
    for (const item of customers) {
      const previous = await dbGet(`SELECT id, for_bir, for_cic, for_sec FROM tblCustomer WHERE id = ?`, [item.id]);
      if (!previous) continue;
      const next = {
        for_bir: item.for_bir ? 1 : 0,
        for_cic: item.for_cic ? 1 : 0,
        for_sec: item.for_sec ? 1 : 0
      };
      if (previous.for_bir === next.for_bir && previous.for_cic === next.for_cic && previous.for_sec === next.for_sec) continue;
      await dbRun(
        `UPDATE tblCustomer SET for_bir = ?, for_cic = ?, for_sec = ?, updated_at = datetime('now') WHERE id = ?`,
        [next.for_bir, next.for_cic, next.for_sec, item.id]
      );
      await dbRun(
        `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
        [req.user.id, req.user.username, 'UPDATE_COMPLIANCE_CHECKLIST', 'CUSTOMER', item.id, JSON.stringify({ previousValue: previous, newValue: next })]
      );
      updated += 1;
    }
    res.json({ message: 'Compliance checklist updated', updated });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const customer = await dbGet(`
      SELECT c.*, b.branch_name,
        COALESCE(
          NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''),
          (
            SELECT NULLIF(TRIM(co2.first_name || ' ' || co2.last_name), '')
            FROM tblLoan l2
            JOIN tblCollector co2 ON co2.id = l2.collector_id
            WHERE l2.customer_id = c.id
              AND l2.collector_id IS NOT NULL
            ORDER BY
              CASE WHEN l2.status IN ('active', 'pastdue') THEN 0 ELSE 1 END,
              COALESCE(l2.date_released, l2.created_at) DESC,
              l2.id DESC
            LIMIT 1
          )
        ) as collector_name
      FROM tblCustomer c
      LEFT JOIN tblBranch b ON c.branch_id = b.id
      LEFT JOIN tblCollector co ON c.collector_id = co.id
      WHERE c.id = ?`, [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const loans = await dbAll(`SELECT * FROM tblLoan WHERE customer_id = ? ORDER BY created_at DESC`, [req.params.id]);
    const payments = await dbAll(`SELECT p.*, l.loan_code FROM tblPayment p JOIN tblLoan l ON p.loan_id = l.id WHERE p.customer_id = ? ORDER BY p.date_paid DESC, p.created_at DESC`, [req.params.id]);
    res.json({ ...customer, loans, payments });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/:id/credit-eval', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const today = new Date().toISOString().split('T')[0];
    const stats = await dbGet(`
      SELECT 
        COUNT(l.id) as total_loans,
        SUM(COALESCE(NULLIF(l.total_amortization, 0), l.principal + COALESCE(l.interest_amount, 0), l.principal)) as total_amount_borrowed,
        MAX(l.principal) as last_loan_amount
      FROM tblLoan l WHERE l.customer_id = ?`, [id]);

    const lastLoan = await dbGet(`
      SELECT *
      FROM tblLoan
      WHERE customer_id = ?
      ORDER BY COALESCE(date_released, created_at) DESC, id DESC
      LIMIT 1`, [id]);
      
    const sched = await dbGet(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN s.status='paid' AND date_paid <= due_date THEN 1 ELSE 0 END) as on_time,
        SUM(CASE WHEN s.status='paid' AND date_paid > due_date THEN 1 ELSE 0 END) as late
      FROM tblAmortizationSchedule s JOIN tblLoan l ON s.loan_id=l.id WHERE l.customer_id = ?`, [id]);

    const pd = await dbGet(`SELECT COUNT(*) as past_due_occurrences FROM tblLoan WHERE customer_id = ? AND status='pastdue'`, [id]);
    const recon = await dbGet(`SELECT COUNT(*) as recon_history FROM tblCustomerStatusHistory WHERE customer_id = ? AND new_status='RECON'`, [id]);

    const payments = lastLoan
      ? await dbAll(`SELECT * FROM tblPayment WHERE loan_id = ? AND status != 'reversed' ORDER BY date_paid ASC, id ASC`, [lastLoan.id])
      : [];
    const totalPaymentCount = payments.length;
    const consistency = lastLoan ? getPaymentConsistency(lastLoan, payments) : getPaymentConsistency({}, []);

    const daysOverdue = lastLoan && lastLoan.date_maturity && Number(lastLoan.balance || 0) > 0
      ? Math.max(0, daysBetween(lastLoan.date_maturity, today))
      : 0;
    const penaltyRate = getPenaltyRate(daysOverdue);
    const penaltyBase = lastLoan ? Number(lastLoan.balance || 0) : 0;
    const recommendedPenalty = Math.round((penaltyBase * (penaltyRate / 100)) * 100) / 100;
    const overdueStatus = daysOverdue > 0
      ? (String(lastLoan.status).toLowerCase() === 'pastdue' ? 'past due' : 'overdue')
      : 'current';

    let score = 100 - ((sched ? sched.late : 0) * 2) - ((pd ? pd.past_due_occurrences : 0) * 20) + consistency.score_adjustment;
    if (daysOverdue > 0) score -= Math.min(40, daysOverdue * 2);
    score = Math.max(0, score);

    res.json({
      total_loans: stats ? stats.total_loans : 0,
      total_amount_borrowed: stats ? stats.total_amount_borrowed : 0,
      last_loan_amount: stats ? stats.last_loan_amount : 0,
      on_time_payments: sched ? sched.on_time : 0,
      late_payments: sched ? sched.late : 0,
      total_payment_count: totalPaymentCount,
      past_due_occurrences: pd ? pd.past_due_occurrences : 0,
      recon_history: recon ? recon.recon_history : 0,
      credit_score: score,
      payment_consistency: consistency,
      last_loan: lastLoan ? {
        id: lastLoan.id,
        loan_code: lastLoan.loan_code,
        status: lastLoan.status,
        balance: Number(lastLoan.balance || 0),
        date_maturity: lastLoan.date_maturity,
        total_amortization: Number(lastLoan.total_amortization || lastLoan.principal || 0)
      } : null,
      overdue: {
        status: overdueStatus,
        days: daysOverdue,
        penalty_rate: penaltyRate,
        recommended_penalty: recommendedPenalty,
        requires_manager_approval: recommendedPenalty > 0
      },
      payments: payments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/reloan-eval', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const stats = await dbGet(`
      SELECT 
        COUNT(l.id) as total_loans,
        SUM(l.principal) as total_amount_borrowed,
        MAX(l.principal) as last_loan_amount,
        MAX(l.date_released) as last_loan_date,
        SUM(CASE WHEN l.status='fullpaid' THEN 1 ELSE 0 END) as successful_loans
      FROM tblLoan l WHERE l.customer_id = ?`, [id]);

    const lastPaid = await dbGet(`
      SELECT p.date_paid as last_fully_paid_date 
      FROM tblPayment p JOIN tblLoan l ON p.loan_id = l.id 
      WHERE l.customer_id = ? AND l.status='fullpaid' 
      ORDER BY p.date_paid DESC LIMIT 1`, [id]);

    const sched = await dbGet(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN s.status='paid' AND date_paid <= due_date THEN 1 ELSE 0 END) as on_time
      FROM tblAmortizationSchedule s JOIN tblLoan l ON s.loan_id=l.id WHERE l.customer_id = ?`, [id]);

    const pd = await dbGet(`SELECT COUNT(*) as past_due_occurrences FROM tblLoan WHERE customer_id = ? AND status='pastdue'`, [id]);
    const recon = await dbGet(`SELECT COUNT(*) as recon_history FROM tblCustomerStatusHistory WHERE customer_id = ? AND new_status='RECON'`, [id]);

    const activeOrPastDueLoans = await dbGet(`SELECT COUNT(*) as count, SUM(balance) as total_balance FROM tblLoan WHERE customer_id = ? AND status IN ('active', 'pastdue')`, [id]);

    let collection_efficiency = 0;
    if (sched && sched.total_payments > 0) {
      collection_efficiency = Math.round((sched.on_time / sched.total_payments) * 100);
    }

    const is_fully_paid = customer.status === 'FULLY PAID';
    const no_active_loan = !activeOrPastDueLoans || activeOrPastDueLoans.count === 0;
    const no_outstanding_balance = !activeOrPastDueLoans || !activeOrPastDueLoans.total_balance || activeOrPastDueLoans.total_balance <= 0;
    const is_good_standing = is_fully_paid && no_active_loan && no_outstanding_balance;

    // Allow new loan if there's no outstanding balance, even if customer status isn't 'FULLY PAID'
    const can_proceed = no_outstanding_balance;

    const last_loan = stats && stats.last_loan_amount ? stats.last_loan_amount : 0;
    
    // Recommendations logic
    const conservative = last_loan;
    const standard = Math.round(last_loan * 1.2);
    const progressive = Math.round(last_loan * 1.5);

    res.json({
      last_loan_amount: last_loan,
      last_loan_date: stats ? stats.last_loan_date : null,
      last_fully_paid_date: lastPaid ? lastPaid.last_fully_paid_date : null,
      total_loans: stats ? stats.total_loans : 0,
      successful_loans: stats ? stats.successful_loans : 0,
      past_due_occurrences: pd ? pd.past_due_occurrences : 0,
      recon_history: recon ? recon.recon_history : 0,
      total_amount_borrowed: stats ? stats.total_amount_borrowed : 0,
      collection_efficiency: collection_efficiency,
      active_balance: activeOrPastDueLoans ? activeOrPastDueLoans.total_balance : 0,
      is_eligible: is_good_standing,
      can_proceed: can_proceed,
      recommendations: {
        conservative: conservative,
        standard: standard,
        progressive: progressive
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, middle_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id,
      sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, 
      loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality,
      home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit,
      proposed_principal,
      customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address,
      messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes,
      business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no,
      id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client
    } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name required' });
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    const maxCust = await dbGet('SELECT MAX(CAST(customer_code AS INTEGER)) as c FROM tblCustomer');
    const customer_code = String((maxCust?.c || 0) + 1).padStart(4, '0');
    
    const cols = ['customer_code', 'first_name', 'last_name', 'middle_name', 'full_name', 'address', 'contact', 'birth_date', 'civil_status', 'occupation', 'branch_id', 'collector_id', 'status', 'sitio', 'purok', 'brgy', 'city', 'gender', 'secondary_contact', 'email', 'income_per_month', 'expenses_per_month', 'loan_purpose', 'collateral', 'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by', 'fb_account', 'nationality', 'home_status', 'business_address', 'business_location', 'business_years', 'business_months', 'business_ownership', 'business_permit', 'customer_classification', 'risk_category', 'cic_verification', 'province', 'zip_code', 'length_of_stay', 'previous_address', 'messenger_account', 'preferred_contact_method', 'preferred_contact_time_from', 'preferred_contact_time_to', 'contact_notes', 'business_type', 'business_name', 'business_employees', 'permit_date_issued', 'permit_place_issued', 'permit_no', 'id_place_of_issue', 'tin_number', 'sss_number', 'id_notes', 'photo_id_front', 'photo_id_back', 'photo_business_proof', 'photo_client'];
    
    const vals = [customer_code, first_name, last_name, middle_name || null, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, 'active', sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality, home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit, customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address, messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes, business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no, id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client];

    const placeholders = cols.map(() => '?').join(',');
    const result = await dbRun(`INSERT INTO tblCustomer (${cols.join(',')}) VALUES (${placeholders})`, vals);
    
    // Auto-create CI Application (pending loan) or Active (Re-Loan)
    const maxLoan = await dbGet("SELECT MAX(CAST(REPLACE(loan_code, 'LN-', '') AS INTEGER)) as c FROM tblLoan");
    const loan_code = `LN-${String((maxLoan?.c || 0) + 1).padStart(6, '0')}`;
    const date_released = new Date().toISOString().split('T')[0];
    const principal = Number(proposed_principal) || 0;
    
    const parsedLoanType = req.body.loan_type === 'Re-Loan' ? 'Re-Loan' : 'New';
    const loanStatus = parsedLoanType === 'Re-Loan' ? 'active' : 'pending';
    
    const interestRate = 15;
    const loanPeriod = 45;
    const interestAmount = principal * (interestRate / 100);
    const totalAmortization = principal + interestAmount;
    const amortization = principal > 0 ? Math.ceil(totalAmortization / 39) : 0;
    const dateMaturity = computeMaturityDate(date_released, loanPeriod);

    const loanInsert = await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, interest_amount, loan_period, date_released, date_maturity, amortization, total_amortization, net_proceeds, balance, status, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, result.lastID, collector_id, branch_id, parsedLoanType, principal, interestRate, interestAmount, loanPeriod, date_released, dateMaturity, amortization, totalAmortization, principal, totalAmortization, loanStatus, loan_purpose, req.user.id]
    );

    if (loanStatus === 'active') {
      const schedule = generateAmortizationSchedule(loanInsert.lastID, date_released, loanPeriod, amortization);
      for (const s of schedule) {
        await dbRun(`INSERT INTO tblAmortizationSchedule (loan_id, period_number, due_date, amount_due, status) VALUES (?,?,?,?,?)`, [s.loan_id, s.period_number, s.due_date, s.amount_due, s.status]);
      }
      await dbRun(`UPDATE tblCustomer SET status='active', updated_at=datetime('now') WHERE id=?`, [result.lastID]);
    }

    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'CREATE', 'CUSTOMER', result.lastID, `Created: ${full_name}`]);
    res.status(201).json({ id: result.lastID, customer_code, full_name });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, middle_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status,
      sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, 
      loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality,
      home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit,
      customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address,
      messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes,
      business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no,
      id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client
    } = req.body;
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    
    const updateCols = ['first_name', 'last_name', 'middle_name', 'full_name', 'address', 'contact', 'birth_date', 'civil_status', 'occupation', 'branch_id', 'collector_id', 'status', 'sitio', 'purok', 'brgy', 'city', 'gender', 'secondary_contact', 'email', 'income_per_month', 'expenses_per_month', 'loan_purpose', 'collateral', 'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by', 'fb_account', 'nationality', 'home_status', 'business_address', 'business_location', 'business_years', 'business_months', 'business_ownership', 'business_permit', 'customer_classification', 'risk_category', 'cic_verification', 'province', 'zip_code', 'length_of_stay', 'previous_address', 'messenger_account', 'preferred_contact_method', 'preferred_contact_time_from', 'preferred_contact_time_to', 'contact_notes', 'business_type', 'business_name', 'business_employees', 'permit_date_issued', 'permit_place_issued', 'permit_no', 'id_place_of_issue', 'tin_number', 'sss_number', 'id_notes', 'photo_id_front', 'photo_id_back', 'photo_business_proof', 'photo_client', 'updated_at'];
    
    const vals = [first_name, last_name, middle_name || null, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status || 'active', sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality, home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit, customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address, messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes, business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no, id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client, req.params.id];
    
    const setClause = updateCols.map(c => c === 'updated_at' ? "updated_at=datetime('now')" : `${c}=?`).join(', ');
    await dbRun(`UPDATE tblCustomer SET ${setClause} WHERE id=?`, vals);
    
    if (collector_id) {
      await dbRun(`UPDATE tblLoan SET collector_id = ? WHERE customer_id = ? AND status = 'active'`, [collector_id, req.params.id]);
    }

    res.json({ message: 'Customer updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/:id/relax', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const loanQuery = await dbGet(`SELECT SUM(balance) as total_balance FROM tblLoan WHERE customer_id = ? AND status IN ('active', 'pastdue')`, [req.params.id]);
    const balance = loanQuery ? Number(loanQuery.total_balance) || 0 : 0;
    
    if (balance > 0) {
      return res.status(400).json({ error: `Cannot relax this client because there is an outstanding balance amounting to ₱${balance.toLocaleString('en-US', {minimumFractionDigits: 2})}. Please settle the remaining balance before proceeding.` });
    }
    
    await dbRun(`UPDATE tblCustomer SET status='inactive', updated_at=datetime('now') WHERE id=?`, [req.params.id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RELAX', 'CUSTOMER', req.params.id, `Relaxed client account`]);
    res.json({ message: 'Customer relaxed successfully' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/:id/penalty', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const loan = await dbGet(`
      SELECT *
      FROM tblLoan
      WHERE customer_id = ?
        AND status IN ('active', 'pastdue')
        AND balance > 0
      ORDER BY COALESCE(date_maturity, date_released) DESC, id DESC
      LIMIT 1`, [req.params.id]);

    if (!loan || !loan.date_maturity) return res.status(400).json({ error: 'No overdue active loan found for penalty.' });

    const daysOverdue = Math.max(0, daysBetween(loan.date_maturity, today));
    const penaltyRate = getPenaltyRate(daysOverdue);
    const penaltyAmount = Math.round((Number(loan.balance || 0) * (penaltyRate / 100)) * 100) / 100;

    if (penaltyAmount <= 0) return res.status(400).json({ error: 'This loan is not overdue enough for a penalty.' });

    const existingPenalty = await dbGet(`SELECT id FROM tblCharge WHERE loan_id = ? AND charge_type = 'Overdue Penalty' AND date_charged = ? LIMIT 1`, [loan.id, today]);
    if (existingPenalty) return res.status(409).json({ error: 'An overdue penalty has already been applied to this loan today.' });

    await dbRun(`INSERT INTO tblCharge (loan_id, charge_type, amount, date_charged, remarks) VALUES (?, 'Overdue Penalty', ?, ?, ?)`,
      [loan.id, penaltyAmount, today, `${penaltyRate}% penalty approved by manager for ${daysOverdue} overdue day(s)`]);
    await dbRun(`UPDATE tblLoan SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?`, [penaltyAmount, loan.id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
      [req.user.id, req.user.username, 'APPROVE_PENALTY', 'CUSTOMER', req.params.id, `Approved ${penaltyRate}% overdue penalty: ${penaltyAmount}`]);

    res.json({ message: 'Penalty approved and added to loan balance.', penalty_amount: penaltyAmount, penalty_rate: penaltyRate, days_overdue: daysOverdue });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/:id/reloan', authenticateToken, async (req, res) => {
  try {
    const { principal, loan_period, interest_rate, date_released, loan_type, previous_balance, remarks } = req.body;
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const maxLoan = await dbGet("SELECT MAX(CAST(REPLACE(loan_code, 'LN-', '') AS INTEGER)) as c FROM tblLoan");
    const loan_code = `LN-${String((maxLoan?.c || 0) + 1).padStart(6, '0')}`;
    const releaseDate = date_released || new Date().toISOString().split('T')[0];
    const amount = Number(principal) || 0;
    const period = Number(loan_period) || 45;
    const interestRate = Number(interest_rate) || 0;
    const normalizedLoanType = loan_type === 'Recon' ? 'Recon' : 'Re-Loan';
    const loanStatus = 'active';
    const actionName = normalizedLoanType === 'Recon' ? 'RECON_APP' : 'RELOAN_APP';
    const defaultRemarks = normalizedLoanType === 'Recon' ? 'Auto-created via Recon application' : 'Auto-created via Re-Loan application';
    const interestAmount = amount * (interestRate / 100);
    const totalAmortization = amount + interestAmount;
    const amortization = amount > 0 && period > 0 ? Math.ceil(totalAmortization / period) : 0;
    const dateMaturity = computeMaturityDate(releaseDate, period);
    
    const result = await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, interest_amount, loan_period, date_released, date_maturity, amortization, total_amortization, net_proceeds, balance, previous_balance, status, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, customer.id, customer.collector_id, customer.branch_id, normalizedLoanType, amount, interestRate, interestAmount, period, releaseDate, dateMaturity, amortization, totalAmortization, amount, totalAmortization, Number(previous_balance || 0), loanStatus, remarks || defaultRemarks, req.user.id]
    );
    if (loanStatus === 'active') {
      const schedule = generateAmortizationSchedule(result.lastID, releaseDate, period, amortization);
      for (const s of schedule) {
        await dbRun(`INSERT INTO tblAmortizationSchedule (loan_id, period_number, due_date, amount_due, status) VALUES (?,?,?,?,?)`, [s.loan_id, s.period_number, s.due_date, s.amount_due, s.status]);
      }
      await dbRun(`UPDATE tblCustomer SET status='active', updated_at=datetime('now') WHERE id=?`, [customer.id]);
      await dbRun(`INSERT INTO tblCustomerStatusHistory (customer_id, previous_status, new_status, changed_by, remarks) VALUES (?, ?, ?, ?, ?)`,
        [customer.id, customer.status, 'active', req.user.id, `${normalizedLoanType} activated: ${loan_code}`]);
    }
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, actionName, 'CUSTOMER', customer.id, `${normalizedLoanType} application created: ${loan_code} for ₱${amount}`]);
    res.json({ message: loanStatus === 'active' ? `${normalizedLoanType} saved to Active Loans successfully` : `${normalizedLoanType} application submitted successfully`, loan_code, status: loanStatus });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/:id/reci', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const maxLoan = await dbGet("SELECT MAX(CAST(REPLACE(loan_code, 'LN-', '') AS INTEGER)) as c FROM tblLoan");
    const loan_code = `LN-${String((maxLoan?.c || 0) + 1).padStart(6, '0')}`;
    const date_released = new Date().toISOString().split('T')[0];
    
    await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, loan_period, date_released, amortization, status, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, customer.id, customer.collector_id, customer.branch_id, 'Re-CI', 0, 15, 45, date_released, 0, 'pending', 'Auto-created via Re-CI action', req.user.id]
    );
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RECI', 'CUSTOMER', customer.id, `Re-CI application created: ${loan_code}`]);
    res.json({ message: 'Re-CI application created successfully', loan_code });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/:id/status', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    if (String(status || '').toUpperCase() === 'FULLY PAID') {
      const openLoansCount = await dbGet(`
        SELECT COUNT(*) as c
        FROM tblLoan
        WHERE customer_id = ?
          AND LOWER(COALESCE(status, '')) NOT IN ('fullpaid', 'closed', 'rejected', 'cancelled', 'reversed')
          AND COALESCE(balance, 0) > 0
      `, [req.params.id]);
      if (openLoansCount.c > 0) {
        return res.status(400).json({ error: 'Cannot set customer to Fully Paid while there is an open loan balance.' });
      }
    }
    
    await dbRun(`UPDATE tblCustomer SET status=?, updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
    await dbRun(`INSERT INTO tblCustomerStatusHistory (customer_id, previous_status, new_status, changed_by, remarks) VALUES (?, ?, ?, ?, ?)`, 
      [req.params.id, customer.status, status, req.user.id, remarks || `Manually changed to ${status}`]);
    
    res.json({ message: `Customer status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
