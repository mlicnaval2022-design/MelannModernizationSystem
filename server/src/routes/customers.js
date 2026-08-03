const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { computeMaturityDate, generateAmortizationSchedule, getWorkingDays } = require('../services/loanCalculator');
const { requireOperationDate } = require('../services/operationDays');
const { recalculateLoanBalances } = require('../services/loanBalanceRecalculator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const sendRouteError = (res, err) => res.status(err.statusCode || 500).json({ error: err.message });

const uploadDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const customerPhotoFields = ['photo_id_front', 'photo_id_back', 'photo_business_proof', 'photo_client'];

function getStoredUploadPath(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  if (!fileUrl.startsWith('/uploads/')) return null;

  const relativePath = fileUrl.replace(/^\/uploads\//, '');
  if (!relativePath || relativePath.includes('..') || path.isAbsolute(relativePath)) return null;

  return path.join(uploadDir, relativePath);
}

function assertCustomerPhotoFilesExist(body) {
  for (const field of customerPhotoFields) {
    const fileUrl = body[field];
    if (!fileUrl) continue;

    const storedPath = getStoredUploadPath(fileUrl);
    if (!storedPath || !fs.existsSync(storedPath)) {
      const err = new Error(`${field} was not stored in the system. Please upload the picture again.`);
      err.statusCode = 400;
      throw err;
    }
  }
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, uploadDir); },
  filename: function(req, file, cb) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
  }
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

const todayDateOnly = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

async function postPriorLoanBalancePayment({ customerId, sourceLoanId, amount, user, date_released, loanType }) {
  const paymentAmount = Number(amount || 0);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return null;
  const loanTypeLabel = String(loanType || '').toUpperCase() === 'RELOAN'
    ? 'Re-Loan'
    : String(loanType || '').toUpperCase() === 'RECON'
      ? 'RECON'
      : loanType;

  const sourceLoan = sourceLoanId
    ? await dbGet(
      `SELECT * FROM tblLoan
       WHERE id = ? AND customer_id = ? AND LOWER(status) IN ('active', 'pastdue') AND COALESCE(balance, 0) > 0`,
      [sourceLoanId, customerId]
    )
    : await dbGet(
      `SELECT * FROM tblLoan
       WHERE customer_id = ? AND LOWER(status) IN ('active', 'pastdue') AND COALESCE(balance, 0) > 0
       ORDER BY date_released DESC, id DESC LIMIT 1`,
      [customerId]
    );

  if (!sourceLoan) {
    throw new Error('No active loan account found for posting the old balance.');
  }

  const datePaid = date_released || todayDateOnly();
  requireOperationDate(datePaid, 'Payment date');
  const latestPayment = await dbGet(
    `SELECT balance_after FROM tblPayment
     WHERE loan_id = ? AND status = 'active'
     ORDER BY date_paid DESC, id DESC LIMIT 1`,
    [sourceLoan.id]
  );
  const loanBalance = Number(sourceLoan.balance || 0);
  const latestRunningBalance = Number(latestPayment?.balance_after || 0);
  const balanceBefore = Math.max(loanBalance, latestRunningBalance);
  const balanceAfter = Math.max(0, balanceBefore - paymentAmount);
  const maxCodeRes = await dbGet(`SELECT MAX(CAST(payment_code AS INTEGER)) as max_code FROM tblPayment WHERE customer_id = ?`, [customerId]);
  const nextCode = (maxCodeRes?.max_code || 0) + 1;
  const paymentCode = String(nextCode).padStart(4, '0');

  const payment = await dbRun(
    `INSERT INTO tblPayment (loan_id, customer_id, collector_id, or_number, date_paid, amount_paid, balance_before, balance_after, status, remarks, encoded_by, payment_code)
     VALUES (?,?,?,?,?,?,?,?,'active',?,?,?)`,
    [
      sourceLoan.id,
      customerId,
      sourceLoan.collector_id,
      'N/A',
      datePaid,
      paymentAmount,
      balanceBefore,
      balanceAfter,
      `Auto-posted old balance during ${loanTypeLabel}`,
      user.id,
      paymentCode
    ]
  );

  let newStatus;
  let postedPayment;
  if (latestPayment) {
    const recalculation = await recalculateLoanBalances(sourceLoan.id, { userId: user.id });
    postedPayment = await dbGet(`SELECT balance_before, balance_after FROM tblPayment WHERE id = ?`, [payment.lastID]);
    newStatus = recalculation.status;
  } else {
    newStatus = balanceAfter <= 0 ? 'fullpaid' : 'active';
    await dbRun(
      `UPDATE tblLoan SET balance = ?, total_paid = total_paid + ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
      [balanceAfter, paymentAmount, newStatus, sourceLoan.id]
    );
    postedPayment = { balance_before: balanceBefore, balance_after: balanceAfter };
  }

  await dbRun(
    `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
    [user.id, user.username, 'CREATE', 'PAYMENT', payment.lastID, `${loanTypeLabel} old balance auto-posted. Loan:${sourceLoan.loan_code} Amt:${paymentAmount}`]
  );

  return {
    id: payment.lastID,
    loan_id: sourceLoan.id,
    loan_code: sourceLoan.loan_code,
    payment_code: paymentCode,
    date_paid: datePaid,
    amount_paid: paymentAmount,
    balance_before: postedPayment.balance_before,
    balance_after: postedPayment.balance_after,
    loan_status: newStatus
  };
}

async function postLoanPenaltyEntry({ loan, customer, amount, datePaid, user }) {
  const penaltyAmount = Number(amount || 0);
  if (!Number.isFinite(penaltyAmount) || penaltyAmount <= 0) return null;
  requireOperationDate(datePaid, 'Penalty payment date');

  const maxCodeRes = await dbGet(`SELECT MAX(CAST(payment_code AS INTEGER)) as max_code FROM tblPayment WHERE customer_id = ?`, [customer.id]);
  const nextCode = (maxCodeRes?.max_code || 0) + 1;
  const paymentCode = String(nextCode).padStart(4, '0');
  const balance = Number(loan.balance || 0);

  const payment = await dbRun(
    `INSERT INTO tblPayment (loan_id, customer_id, collector_id, or_number, date_paid, amount_paid, balance_before, balance_after, payment_type, status, remarks, encoded_by, payment_code)
     VALUES (?,?,?,?,?,?,?,?,?,'penalty',?,?,?)`,
    [
      loan.id,
      customer.id,
      loan.collector_id,
      'N/A',
      datePaid,
      penaltyAmount,
      balance,
      balance,
      'penalty',
      'Penalty charge posted during loan release',
      user.id,
      paymentCode
    ]
  );

  await dbRun(
    `INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`,
    [user.id, user.username, 'CREATE', 'PAYMENT', payment.lastID, `Penalty entry posted. Loan:${loan.loan_code} Amt:${penaltyAmount}`]
  );

  return {
    id: payment.lastID,
    loan_id: loan.id,
    loan_code: loan.loan_code,
    payment_code: paymentCode,
    date_paid: datePaid,
    amount_paid: penaltyAmount,
    status: 'penalty'
  };
}

const getPenaltyRate = (daysOverdue) => {
  if (daysOverdue >= 30) return 5;
  if (daysOverdue >= 15) return 3;
  if (daysOverdue >= 8) return 2;
  if (daysOverdue >= 1) return 1;
  return 0;
};

const normalizeLoanType = value => {
  const type = String(value || '').trim().toUpperCase().replace(/[-\s]/g, '');
  if (type === 'NEW') return 'NEW';
  if (type === 'RECON') return 'RECON';
  if (type === 'RELOAN') return 'RELOAN';
  return '';
};

const generateLoanReference = async (releaseDate) => {
  const datePart = String(releaseDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const latest = await dbGet(
    `SELECT loan_code FROM tblLoan WHERE loan_code LIKE ? ORDER BY loan_code DESC LIMIT 1`,
    [`LN-${datePart}-%`]
  );
  const next = latest?.loan_code ? Number(String(latest.loan_code).split('-').pop()) + 1 : 1;
  return `LN-${datePart}-${String(next).padStart(4, '0')}`;
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
  const url = `/uploads/${req.file.filename}`;
  const storedPath = getStoredUploadPath(url);
  if (!storedPath || !fs.existsSync(storedPath)) {
    return res.status(500).json({ error: 'File upload did not finish storing in the system.' });
  }
  res.json({ url, stored: true });
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
        (SELECT COUNT(*) FROM tblLoan l WHERE l.customer_id = c.id) as loan_cycles,
        (SELECT h.remarks FROM tblCustomerStatusHistory h WHERE h.customer_id = c.id AND UPPER(h.new_status) = 'RELAX' ORDER BY h.created_at DESC, h.id DESC LIMIT 1) as relax_note,
        (SELECT h.created_at FROM tblCustomerStatusHistory h WHERE h.customer_id = c.id AND UPPER(h.new_status) = 'RELAX' ORDER BY h.created_at DESC, h.id DESC LIMIT 1) as relax_note_date,
        (SELECT h.remarks FROM tblCustomerStatusHistory h WHERE h.customer_id = c.id AND UPPER(h.new_status) = 'HOLD' ORDER BY h.created_at DESC, h.id DESC LIMIT 1) as hold_note,
        (SELECT h.created_at FROM tblCustomerStatusHistory h WHERE h.customer_id = c.id AND UPPER(h.new_status) = 'HOLD' ORDER BY h.created_at DESC, h.id DESC LIMIT 1) as hold_note_date
      FROM tblCustomer c
      LEFT JOIN tblCollector co ON c.collector_id = co.id
      WHERE c.status = 'FULLY PAID'
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
    if (search) {
      q += ` AND (c.full_name LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.customer_code LIKE ? OR c.contact LIKE ?)`;
      p.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
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
  } catch (err) { console.error(err); sendRouteError(res, err); }
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
  } catch (err) { console.error(err); sendRouteError(res, err); }
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
  } catch (err) { console.error(err); sendRouteError(res, err); }
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
    const loans = await dbAll(`
      SELECT * FROM tblLoan l
      WHERE l.customer_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM tblLoan dup
          WHERE dup.customer_id = l.customer_id
            AND dup.date_released = l.date_released
            AND LOWER(COALESCE(dup.loan_type, '')) = LOWER(COALESCE(l.loan_type, ''))
            AND COALESCE(dup.principal, 0) = COALESCE(l.principal, 0)
            AND LOWER(COALESCE(dup.status, '')) NOT IN ('reversed', 'rejected')
            AND dup.id < l.id
        )
      ORDER BY l.created_at DESC
    `, [req.params.id]);
    const payments = await dbAll(`SELECT p.*, l.loan_code FROM tblPayment p JOIN tblLoan l ON p.loan_id = l.id WHERE p.customer_id = ? ORDER BY p.date_paid DESC, p.created_at DESC`, [req.params.id]);
    res.json({ ...customer, loans, payments });
  } catch (err) { console.error(err); sendRouteError(res, err); }
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

    const customerStatus = String(customer.status || '').trim().toUpperCase();
    const is_fully_paid = customerStatus === 'FULLY PAID';
    const is_relax = customerStatus === 'RELAX';
    const no_active_loan = !activeOrPastDueLoans || activeOrPastDueLoans.count === 0;
    const no_outstanding_balance = !activeOrPastDueLoans || !activeOrPastDueLoans.total_balance || activeOrPastDueLoans.total_balance <= 0;
    const has_loan_history = Number(stats?.total_loans || 0) > 0;
    const is_good_standing = (is_fully_paid || (is_relax && has_loan_history)) && no_active_loan && no_outstanding_balance;

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
      educational_background, occupational_status,
      home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit,
      proposed_principal,
      customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address,
      messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes,
      business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no,
      id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client
    } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name required' });
    assertCustomerPhotoFilesExist(req.body);
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    const maxCust = await dbGet('SELECT MAX(CAST(customer_code AS INTEGER)) as c FROM tblCustomer');
    const customer_code = String((maxCust?.c || 0) + 1).padStart(4, '0');
    
    const cols = ['customer_code', 'first_name', 'last_name', 'middle_name', 'full_name', 'address', 'contact', 'birth_date', 'civil_status', 'occupation', 'branch_id', 'collector_id', 'status', 'sitio', 'purok', 'brgy', 'city', 'gender', 'secondary_contact', 'email', 'income_per_month', 'expenses_per_month', 'loan_purpose', 'collateral', 'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by', 'fb_account', 'nationality', 'educational_background', 'occupational_status', 'home_status', 'business_address', 'business_location', 'business_years', 'business_months', 'business_ownership', 'business_permit', 'customer_classification', 'risk_category', 'cic_verification', 'province', 'zip_code', 'length_of_stay', 'previous_address', 'messenger_account', 'preferred_contact_method', 'preferred_contact_time_from', 'preferred_contact_time_to', 'contact_notes', 'business_type', 'business_name', 'business_employees', 'permit_date_issued', 'permit_place_issued', 'permit_no', 'id_place_of_issue', 'tin_number', 'sss_number', 'id_notes', 'photo_id_front', 'photo_id_back', 'photo_business_proof', 'photo_client'];
    
    const vals = [customer_code, first_name, last_name, middle_name || null, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, 'active', sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality, educational_background, occupational_status, home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit, customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address, messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes, business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no, id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client];

    const placeholders = cols.map(() => '?').join(',');
    const result = await dbRun(`INSERT INTO tblCustomer (${cols.join(',')}) VALUES (${placeholders})`, vals);
    
    // Auto-create CI Application (pending loan) or Active (Re-Loan)
    const maxLoan = await dbGet("SELECT MAX(CAST(REPLACE(loan_code, 'LN-', '') AS INTEGER)) as c FROM tblLoan");
    const loan_code = `LN-${String((maxLoan?.c || 0) + 1).padStart(6, '0')}`;
    const date_released = new Date().toISOString().split('T')[0];
    requireOperationDate(date_released, 'Release date');
    const principal = Number(proposed_principal) || 0;
    
    const requestedLoanType = normalizeLoanType(req.body.loan_type) || normalizeLoanType(customer_classification);
    const parsedLoanType = requestedLoanType === 'RELOAN' ? 'Re-Loan' : 'New';
    const loanStatus = parsedLoanType === 'Re-Loan' ? 'active' : 'pending';
    
    const interestRate = 15;
    const loanPeriod = 45;
    const interestAmount = principal * (interestRate / 100);
    const totalAmortization = Math.ceil(principal + interestAmount);
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
      educational_background, occupational_status,
      home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit,
      customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address,
      messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes,
      business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no,
      id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client
    } = req.body;
    assertCustomerPhotoFilesExist(req.body);
    const full_name = `${last_name}, ${first_name}${middle_name ? ' ' + middle_name : ''}`;
    
    const updateCols = ['first_name', 'last_name', 'middle_name', 'full_name', 'address', 'contact', 'birth_date', 'civil_status', 'occupation', 'branch_id', 'collector_id', 'status', 'sitio', 'purok', 'brgy', 'city', 'gender', 'secondary_contact', 'email', 'income_per_month', 'expenses_per_month', 'loan_purpose', 'collateral', 'id_type', 'id_number', 'id_issue_date', 'id_expiry_date', 'id_issued_by', 'fb_account', 'nationality', 'educational_background', 'occupational_status', 'home_status', 'business_address', 'business_location', 'business_years', 'business_months', 'business_ownership', 'business_permit', 'customer_classification', 'risk_category', 'cic_verification', 'province', 'zip_code', 'length_of_stay', 'previous_address', 'messenger_account', 'preferred_contact_method', 'preferred_contact_time_from', 'preferred_contact_time_to', 'contact_notes', 'business_type', 'business_name', 'business_employees', 'permit_date_issued', 'permit_place_issued', 'permit_no', 'id_place_of_issue', 'tin_number', 'sss_number', 'id_notes', 'photo_id_front', 'photo_id_back', 'photo_business_proof', 'photo_client', 'updated_at'];
    
    const vals = [first_name, last_name, middle_name || null, full_name, address, contact, birth_date, civil_status, occupation, branch_id, collector_id, status || 'active', sitio, purok, brgy, city, gender, secondary_contact, email, income_per_month, expenses_per_month, loan_purpose, collateral, id_type, id_number, id_issue_date, id_expiry_date, id_issued_by, fb_account, nationality, educational_background, occupational_status, home_status, business_address, business_location, business_years, business_months, business_ownership, business_permit, customer_classification, risk_category, cic_verification, province, zip_code, length_of_stay, previous_address, messenger_account, preferred_contact_method, preferred_contact_time_from, preferred_contact_time_to, contact_notes, business_type, business_name, business_employees, permit_date_issued, permit_place_issued, permit_no, id_place_of_issue, tin_number, sss_number, id_notes, photo_id_front, photo_id_back, photo_business_proof, photo_client, req.params.id];
    
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
    
    await dbRun(`UPDATE tblCustomer SET status='RELAX', updated_at=datetime('now') WHERE id=?`, [req.params.id]);
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RELAX', 'CUSTOMER', req.params.id, `Relaxed client account`]);
    res.json({ message: 'Customer relaxed successfully' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/:id/penalty', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    requireOperationDate(today, 'Penalty date');
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
  let transactionStarted = false;
  try {
    const { principal, loan_period, interest_rate, date_released, loan_type, source_loan_id, previous_balance, penalty, passbook, remarks } = req.body;
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const releaseDate = date_released || new Date().toISOString().split('T')[0];
    requireOperationDate(releaseDate, 'Release date');
    const amount = Number(principal) || 0;
    const period = Number(loan_period) || 45;
    const interestRate = Number(interest_rate) || 0;
    const normalizedLoanType = normalizeLoanType(loan_type);
    if (!normalizedLoanType) return res.status(400).json({ error: 'Loan Type is required and must be NEW, RELOAN, or RECON.' });
    if (amount <= 0) return res.status(400).json({ error: 'Invalid loan amount.' });
    if (!Number.isInteger(period) || period <= 0) return res.status(400).json({ error: 'Number of Days must be greater than zero.' });
    const loanStatus = 'active';
    const actionName = normalizedLoanType === 'RECON' ? 'RECON_APP' : normalizedLoanType === 'NEW' ? 'NEW_LOAN_APP' : 'RELOAN_APP';
    const defaultRemarks = `Auto-created via ${normalizedLoanType} loan input`;
    const storedLoanType = normalizedLoanType === 'RELOAN' ? 'Re-Loan' : normalizedLoanType === 'NEW' ? 'New' : 'RECON';
    const interestAmount = amount * (interestRate / 100);
    const totalAmortization = Math.ceil(amount + interestAmount);
    const workingDays = getWorkingDays(period);
    const amortization = amount > 0 && workingDays > 0 ? Math.ceil(totalAmortization / workingDays) : 0;
    const dateMaturity = computeMaturityDate(releaseDate, period);
    const balanceAmount = Number(previous_balance || 0);
    const penaltyAmount = Number(penalty || 0);
    const passbookAmount = passbook === undefined || passbook === null || passbook === ''
      ? (normalizedLoanType === 'NEW' ? 50 : 0)
      : Number(passbook || 0);
    const shouldPostPriorBalance = ['RECON', 'RELOAN'].includes(normalizedLoanType);
    const newLoanPreviousBalance = shouldPostPriorBalance ? 0 : balanceAmount;
    const totalCharges = balanceAmount + penaltyAmount + passbookAmount;
    const netProceeds = amount;

    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;

    const latestLoan = await dbGet(
      `SELECT * FROM tblLoan WHERE customer_id = ? ORDER BY COALESCE(date_released, created_at) DESC, id DESC LIMIT 1`,
      [customer.id]
    );
    const activeLoan = await dbGet(
      `SELECT id, loan_code, balance FROM tblLoan
       WHERE customer_id = ?
         AND LOWER(status) IN ('active', 'pastdue', 'approved', 'for_approval', 'pending', 'reloan_pending')
         AND COALESCE(balance, 0) > 0
       ORDER BY id DESC LIMIT 1`,
      [customer.id]
    );
    const customerStatus = String(customer.status || '').trim().toUpperCase();
    if (normalizedLoanType === 'NEW' && activeLoan) {
      const err = new Error('This client already has an active loan and cannot be processed as NEW.');
      err.statusCode = 400;
      throw err;
    }
    if (normalizedLoanType === 'NEW' && customerStatus === 'HOLD') {
      const err = new Error(`This client is ${customerStatus} and cannot be processed as NEW.`);
      err.statusCode = 400;
      throw err;
    }
    if (normalizedLoanType === 'RELOAN') {
      if (!latestLoan) {
        const err = new Error('This client is not eligible for RELOAN. No previous loan record found. Use NEW loan type.');
        err.statusCode = 400;
        throw err;
      }
      if (customerStatus === 'HOLD') {
        const err = new Error(`This client is not eligible for RELOAN. Client is on ${customerStatus} status.`);
        err.statusCode = 400;
        throw err;
      }
      if (Number(activeLoan?.balance || 0) > 0 && balanceAmount <= 0) {
        const err = new Error('This client is not eligible for RELOAN. Existing unpaid balance must be reviewed through SOA.');
        err.statusCode = 400;
        throw err;
      }
    }
    if (normalizedLoanType === 'RECON' && !latestLoan) {
      const err = new Error('This client is not eligible for RECON. Please review the account status and required approval.');
      err.statusCode = 400;
      throw err;
    }

    const duplicateActiveLoan = await dbGet(
      `SELECT id, loan_code FROM tblLoan
       WHERE customer_id = ?
         AND date_released = ?
         AND UPPER(REPLACE(REPLACE(loan_type, '-', ''), ' ', '')) = ?
         AND LOWER(status) IN ('active', 'pending', 'approved', 'for_approval', 'reloan_pending')
       ORDER BY id DESC LIMIT 1`,
      [customer.id, releaseDate, normalizedLoanType]
    );
    if (duplicateActiveLoan) {
      const err = new Error(`${normalizedLoanType} already exists for this client on ${releaseDate}: ${duplicateActiveLoan.loan_code}`);
      err.statusCode = 409;
      throw err;
    }
    const loan_code = await generateLoanReference(releaseDate);

    const priorBalancePayment = shouldPostPriorBalance
      ? await postPriorLoanBalancePayment({
        customerId: customer.id,
        sourceLoanId: source_loan_id,
        amount: balanceAmount,
        user: req.user,
        date_released: releaseDate,
        loanType: normalizedLoanType
      })
      : null;
    
    const result = await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, interest_amount, loan_period, date_released, date_maturity, amortization, total_amortization, net_proceeds, balance, previous_balance, penalty, passbook, status, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, customer.id, customer.collector_id, customer.branch_id, storedLoanType, amount, interestRate, interestAmount, period, releaseDate, dateMaturity, amortization, totalAmortization, netProceeds, totalAmortization, newLoanPreviousBalance, penaltyAmount, passbookAmount, loanStatus, remarks || defaultRemarks, req.user.id]
    );
    const penaltyEntry = await postLoanPenaltyEntry({
      loan: { id: result.lastID, loan_code, collector_id: customer.collector_id, balance: totalAmortization },
      customer,
      amount: penaltyAmount,
      datePaid: releaseDate,
      user: req.user
    });
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
    await dbRun('COMMIT');
    transactionStarted = false;
    res.json({
      message: loanStatus === 'active' ? `${normalizedLoanType} saved to Active Loans successfully` : `${normalizedLoanType} application submitted successfully`,
      loan_code,
      status: loanStatus,
      prior_balance_payment: priorBalancePayment,
      penalty_entry: penaltyEntry
    });
  } catch (err) {
    if (transactionStarted) {
      try { await dbRun('ROLLBACK'); } catch (rollbackErr) { console.error('Rollback failed:', rollbackErr); }
    }
    console.error(err);
    sendRouteError(res, err);
  }
});

router.post('/:id/reci', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    const maxLoan = await dbGet("SELECT MAX(CAST(REPLACE(loan_code, 'LN-', '') AS INTEGER)) as c FROM tblLoan");
    const loan_code = `LN-${String((maxLoan?.c || 0) + 1).padStart(6, '0')}`;
    const date_released = new Date().toISOString().split('T')[0];
    requireOperationDate(date_released, 'Release date');
    
    await dbRun(`INSERT INTO tblLoan (loan_code, customer_id, collector_id, branch_id, loan_type, principal, interest_rate, loan_period, date_released, amortization, status, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [loan_code, customer.id, customer.collector_id, customer.branch_id, 'Re-CI', 0, 15, 45, date_released, 0, 'pending', 'Auto-created via Re-CI action', req.user.id]
    );
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, reference_id, details) VALUES (?,?,?,?,?,?)`, [req.user.id, req.user.username, 'RECI', 'CUSTOMER', customer.id, `Re-CI application created: ${loan_code}`]);
    res.json({ message: 'Re-CI application created successfully', loan_code });
  } catch (err) { console.error(err); sendRouteError(res, err); }
});

router.post('/:id/status', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    await dbRun(`UPDATE tblCustomer SET status=?, updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
    await dbRun(`INSERT INTO tblCustomerStatusHistory (customer_id, previous_status, new_status, changed_by, remarks) VALUES (?, ?, ?, ?, ?)`, 
      [req.params.id, customer.status, status, req.user.id, remarks || `Manually changed to ${status}`]);
    
    res.json({ message: `Customer status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.put('/:id/status-note', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { note, status } = req.body;
    const latest = await dbGet(`SELECT id FROM tblCustomerStatusHistory WHERE customer_id = ? AND LOWER(new_status) = LOWER(?) ORDER BY id DESC LIMIT 1`, [req.params.id, status]);
    if (latest) {
       await dbRun(`UPDATE tblCustomerStatusHistory SET remarks = ? WHERE id = ?`, [note, latest.id]);
       res.json({ message: 'Note updated' });
    } else {
       res.status(404).json({ error: 'Status history not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
      ORDER BY date_released DESC LIMIT 1`, [id]);

    let totalPaymentCount = 0;
    const sched = await dbGet(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status='paid' AND date_paid <= due_date THEN 1 ELSE 0 END) as on_time,
        SUM(CASE WHEN status='paid' AND date_paid > due_date THEN 1 ELSE 0 END) as late
      FROM tblAmortizationSchedule 
      WHERE loan_id IN (SELECT id FROM tblLoan WHERE customer_id = ?)`, [id]);

    if (sched && sched.total) totalPaymentCount = sched.total;

    const pd = await dbGet(`SELECT COUNT(*) as past_due_occurrences FROM tblLoan WHERE customer_id = ? AND status='pastdue'`, [id]);
    const recon = await dbGet(`SELECT COUNT(*) as recon_history FROM tblCustomerStatusHistory WHERE customer_id = ? AND new_status='RECON'`, [id]);

    let payments = [];
    let consistency = { score: 100, on_time_rate: 0, days_between_payments: 0, score_adjustment: 0 };
    if (lastLoan) {
      payments = await dbAll(`SELECT * FROM tblPayment WHERE loan_id = ? ORDER BY date_paid ASC`, [lastLoan.id]);
      if (payments && payments.length > 0) {
        let onTimeCount = 0;
        let totalDays = 0;
        for (let i=0; i<payments.length; i++) {
          if (payments[i].penalty_amount <= 0) onTimeCount++;
          if (i > 0) {
            const d1 = new Date(payments[i-1].date_paid);
            const d2 = new Date(payments[i].date_paid);
            totalDays += (d2-d1) / (1000*60*60*24);
          }
        }
        consistency.on_time_rate = (onTimeCount / payments.length) * 100;
        consistency.days_between_payments = payments.length > 1 ? (totalDays / (payments.length-1)) : 0;
        if (consistency.days_between_payments <= 2 && consistency.on_time_rate > 90) {
           consistency.score_adjustment = 10;
        } else if (consistency.days_between_payments > 7) {
           consistency.score_adjustment = -20;
        }
      }
    }

    let daysOverdue = 0;
    if (lastLoan && (String(lastLoan.status).toLowerCase() === 'active' || String(lastLoan.status).toLowerCase() === 'pastdue')) {
       if (lastLoan.date_maturity) {
          const maturityDate = new Date(lastLoan.date_maturity);
          const currentDate = new Date(today);
          const diffTime = currentDate - maturityDate;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays > 0) daysOverdue = diffDays;
       }
    }

    let penaltyRate = 0;
    if (daysOverdue > 30) penaltyRate = 5;
    else if (daysOverdue > 15) penaltyRate = 3;
    else if (daysOverdue > 7) penaltyRate = 1;
    
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

module.exports = router;
