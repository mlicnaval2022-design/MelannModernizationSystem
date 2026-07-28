const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');
const { requireOperationDate, sqlNotSunday } = require('../services/operationDays');
const router = express.Router();
const sendRouteError = (res, err) => res.status(err.statusCode || 500).json({ error: err.message });

const reconLoanTypesSql = `('recon', 'reconstruct', 'reconstructed')`;

const getDcrLoanCondition = () => `
  l.date_released = ?
  AND l.status IN ('active', 'fully_paid')
  AND ${sqlNotSunday('l.date_released')}
  AND NOT EXISTS (
    SELECT 1 FROM tblLoan dup
    WHERE dup.customer_id = l.customer_id
      AND dup.date_released = l.date_released
      AND LOWER(COALESCE(dup.loan_type, '')) = LOWER(COALESCE(l.loan_type, ''))
      AND COALESCE(dup.principal, 0) = COALESCE(l.principal, 0)
      AND LOWER(COALESCE(dup.status, '')) NOT IN ('reversed', 'rejected')
      AND dup.id < l.id
  )
`;

const sumAmount = rows => rows.reduce((acc, row) => acc + Number(row.amount || row.amount_paid || 0), 0);

const getCollectionBreakdown = (collections, passbooks, penalties, collectorsOver) => {
  const breakdown = {
    regular: 0,
    balance: 0,
    penalty: 0,
    passbook: sumAmount(passbooks),
    collectors_over: sumAmount(collectorsOver)
  };

  collections.forEach(payment => {
    const status = String(payment.status || '').toLowerCase();
    const paymentType = String(payment.payment_type || '').toLowerCase();
    const remarks = String(payment.remarks || '').toLowerCase();
    const amount = Number(payment.amount_paid || 0);

    if (status === 'penalty' || paymentType === 'penalty') breakdown.penalty += amount;
    else if (remarks.includes('old balance') || remarks.includes('recon balance')) breakdown.balance += amount;
    else breakdown.regular += amount;
  });

  breakdown.penalty += sumAmount(penalties);
  return breakdown;
};

const isReleaseChargePayment = payment => {
  const status = String(payment.status || '').toLowerCase();
  const paymentType = String(payment.payment_type || '').toLowerCase();
  const remarks = String(payment.remarks || '').toLowerCase();
  return status === 'penalty' || paymentType === 'penalty' || remarks.includes('old balance') || remarks.includes('recon balance');
};

const getReleaseChargeBreakdown = releases => releases.reduce((acc, release) => {
  acc.balance += Number(release.previous_balance || 0);
  acc.penalty += Number(release.penalty_payment_count || 0) > 0 ? 0 : Number(release.penalty || 0);
  acc.passbook += Number(release.today_passbook ?? (release.passbook || 0));
  return acc;
}, { balance: 0, penalty: 0, passbook: 0 });

// Get summary for a specific date (combines collections, releases, expenses)
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { date, branch_id } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    requireOperationDate(date, 'DCR date');

    let pCond = `p.date_paid = ? AND p.status IN ('active', 'penalty') AND ${sqlNotSunday('p.date_paid')}`;
    let lCond = getDcrLoanCondition();
    let eCond = `e.transaction_date = ? AND e.status = 'active'`;
    let cbCond = `entry_date = ?`;

    const pParams = [date];
    const lParams = [date];
    const eParams = [date];
    const cbParams = [date];

    if (branch_id) {
      pCond += ` AND c.branch_id = ?`;
      pParams.push(branch_id);
      lCond += ` AND l.branch_id = ?`;
      lParams.push(branch_id);
      eCond += ` AND (e.branch_id = ? OR e.branch_id = '' OR e.branch_id IS NULL)`;
      eParams.push(branch_id);
      cbCond += ` AND branch_id = ?`;
      cbParams.push(branch_id);
    }

    // 1. Collections
    const collections = await dbAll(`
      SELECT p.id, p.or_number, p.amount_paid, p.payment_type, p.status, p.remarks, p.date_paid, p.created_at, p.dcr_id,
             c.customer_code, c.first_name, c.last_name, u.full_name as encoded_by,
             co.first_name || ' ' || co.last_name as collector_name
      FROM tblPayment p
      JOIN tblCustomer c ON p.customer_id = c.id
      LEFT JOIN tblUser u ON p.encoded_by = u.id
      LEFT JOIN tblCollector co ON p.collector_id = co.id
      WHERE ${pCond}
    `, pParams);

    // 2. Loan Releases
    const releases = await dbAll(`
      SELECT l.id, l.customer_id, l.loan_code, l.principal, l.net_proceeds, l.loan_type, l.date_released, l.created_at, l.dcr_id, l.service_fee, l.insurance, l.balance, l.previous_balance, l.penalty, l.passbook,
             c.customer_code, c.first_name, c.last_name, u.full_name as encoded_by,
             co.first_name || ' ' || co.last_name as collector_name,
             (SELECT COUNT(*) FROM tblPayment pp WHERE pp.loan_id = l.id AND pp.status = 'penalty') as penalty_payment_count,
             COALESCE(l.penalty, 0) + COALESCE((SELECT SUM(amount) FROM tblTransaction WHERE category = CAST(l.customer_id AS TEXT) AND transaction_type = 'Penalty' AND transaction_date = l.date_released AND status = 'active'), 0) as today_penalty,
             COALESCE(l.passbook, 0) + COALESCE((SELECT SUM(amount) FROM tblTransaction WHERE category = CAST(l.customer_id AS TEXT) AND transaction_type = 'Passbook' AND transaction_date = l.date_released AND status = 'active'), 0) as today_passbook
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblUser u ON l.created_by = u.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE ${lCond}
    `, lParams);

    // 3. Transactions
    const transactions = await dbAll(`
      SELECT t.id, t.amount, t.transaction_type, t.category, t.description, t.payee, t.transaction_date as expense_date, t.created_at, t.dcr_id,
             u.full_name as encoded_by
      FROM tblTransaction t
      LEFT JOIN tblUser u ON t.created_by = u.id
      WHERE ${eCond.replace(/e\./g, 't.')}
    `, eParams);

    const expenses = transactions.filter(t => t.transaction_type === 'Expense' || t.transaction_type === 'expense' || !t.transaction_type || t.transaction_type === 'Other Transactions');
    const passbooks = transactions.filter(t => t.transaction_type === 'Passbook');
    const penalties = transactions.filter(t => t.transaction_type === 'Penalty');
    const collectorsOver = transactions.filter(t => t.transaction_type === 'Collectors Over');

    // 4. Bank Transactions
    const bankTx = await dbAll(`SELECT * FROM tblCashOnBank WHERE ${cbCond}`, cbParams);
    
    const deposits = bankTx.filter(b => b.transaction_type === 'deposit');
    const withdrawals = bankTx.filter(b => b.transaction_type === 'withdrawal');
    const bankCharges = bankTx.filter(b => b.transaction_type === 'bank_charge');
    const interest = bankTx.filter(b => b.transaction_type === 'interest');

    // Check if a DCR already exists for this date and branch
    let dcrQuery = `SELECT * FROM tblDailyCashReport WHERE report_date = ?`;
    let dcrParams = [date];
    if (branch_id) {
      dcrQuery += ` AND branch_id = ?`;
      dcrParams.push(branch_id);
    }
    const existingDcr = await dbGet(dcrQuery, dcrParams);

    // Compute totals
    const regularCollections = collections.filter(payment => !isReleaseChargePayment(payment) || String(payment.status || '').toLowerCase() === 'penalty');
    const collection_breakdown = getCollectionBreakdown(regularCollections, passbooks, penalties, collectorsOver);
    const releaseChargeBreakdown = getReleaseChargeBreakdown(releases);
    collection_breakdown.balance += releaseChargeBreakdown.balance;
    collection_breakdown.penalty += releaseChargeBreakdown.penalty;
    collection_breakdown.passbook += releaseChargeBreakdown.passbook;
    const total_collections = Object.values(collection_breakdown).reduce((acc, amount) => acc + amount, 0);
    // Use principal for display, net_proceeds for actual cash out
    const display_total_releases = releases.reduce((acc, r) => acc + (r.principal || 0), 0);
    const cash_out_releases = releases.reduce((acc, r) => acc + (r.net_proceeds || 0), 0);
    const total_reconstruct_amount = releases
      .filter(r => ['recon', 'reconstruct', 'reconstructed'].includes(String(r.loan_type || '').toLowerCase()))
      .reduce((acc, r) => acc + Number(r.principal || 0), 0);
    const total_expenses = expenses.reduce((acc, e) => acc + e.amount, 0);
    const total_adjustments = 0; // Future
    const total_deposits = deposits.reduce((acc, b) => acc + b.amount, 0);
    const total_withdrawals = withdrawals.reduce((acc, b) => acc + b.amount, 0);
    const total_bank_charges = bankCharges.reduce((acc, b) => acc + b.amount, 0);
    const total_bank_interest = interest.reduce((acc, b) => acc + b.amount, 0);

    // Beginning Cash
    let prevDcrQuery = `SELECT actual_cash_count, ending_cash_on_bank, ytd_beg_releases, ytd_beg_collections, ytd_beg_expenses, total_releases, total_collections, total_expenses FROM tblDailyCashReport WHERE report_date < ?`;
    let prevDcrParams = [date];
    if (branch_id) {
      prevDcrQuery += ` AND branch_id = ?`;
      prevDcrParams.push(branch_id);
    }
    prevDcrQuery += ` ORDER BY report_date DESC LIMIT 1`;
    const prevDcr = await dbGet(prevDcrQuery, prevDcrParams);
    
    const beginning_cash = prevDcr ? prevDcr.actual_cash_count : 0;
    const beginning_cash_on_bank = prevDcr ? prevDcr.ending_cash_on_bank : 0;
    
    let ytdOverrideQuery = `SELECT * FROM tblDcrYtdOverride WHERE report_date = ?`;
    let ytdOverrideParams = [date];
    if (branch_id) { ytdOverrideQuery += ` AND branch_id = ?`; ytdOverrideParams.push(branch_id); }
    else { ytdOverrideQuery += ` AND branch_id IS NULL`; }
    ytdOverrideQuery += ` ORDER BY id DESC LIMIT 1`;
    // Cash in Bank formula
    const ending_cash_on_bank = beginning_cash_on_bank + total_deposits + total_bank_interest - total_withdrawals - total_bank_charges;

    // Overall Position
    const total_cash_position = expected_ending_cash + ending_cash_on_bank;

    // Combine transactions for ledger
    const ledger = [
      ...collections.map(c => ({ type: 'Collection', ref: c.or_number, code: c.customer_code, name: `${c.first_name} ${c.last_name}`, amount: c.amount_paid, user: c.encoded_by, time: c.created_at, dcr_id: c.dcr_id })),
      ...releases.map(r => ({ type: 'Loan Release', ref: r.loan_code, code: r.customer_code, name: `${r.first_name} ${r.last_name}`, amount: r.principal, user: r.encoded_by, time: r.created_at, dcr_id: r.dcr_id })),
      ...expenses.map(e => ({ type: 'Expense', ref: e.category, code: '—', name: e.payee || '—', amount: e.amount, user: e.encoded_by, time: e.created_at, remarks: e.description, dcr_id: e.dcr_id })),
      ...passbooks.map(p => ({ type: 'Passbook', ref: '—', code: '—', name: p.description, amount: p.amount, user: p.encoded_by, time: p.created_at, remarks: 'Passbook Collection', dcr_id: p.dcr_id })),
      ...penalties.map(p => ({ type: 'Penalty', ref: '—', code: '—', name: p.description, amount: p.amount, user: p.encoded_by, time: p.created_at, remarks: 'Penalty Collection', dcr_id: p.dcr_id })),
      ...collectorsOver.map(c => ({ type: 'Collectors Over', ref: '—', code: '—', name: c.description || 'Unassigned', amount: c.amount, user: c.encoded_by, time: c.created_at, remarks: 'Collectors Over', dcr_id: c.dcr_id }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json({
      date,
      dcr: existingDcr,
      beginning_cash,
      beginning_cash_on_bank,
      ytd_beg_releases_default,
      ytd_beg_collections_default,
      ytd_beg_expenses_default,
      total_collections,
      collection_breakdown,
      display_total_releases,
      cash_out_releases,
      total_reconstruct_amount,
      total_expenses,
      total_adjustments,
      total_deposits,
      total_withdrawals,
      total_bank_charges,
      total_bank_interest,
      expected_ending_cash,
      ending_cash_on_bank,
      total_cash_position,
      collections: regularCollections,
      releases,
      transactions,
      expenses,
      passbooks,
      penalties,
      collectorsOver,
      deposits,
      withdrawals,
      bankCharges,
      interest,
      ledger
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message, stack: err.statusCode ? undefined : err.stack });
  }
});

// Get loan releases for BIR Checklist
router.get('/loan-releases', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });
    requireOperationDate(date, 'Release date');

    const releases = await dbAll(`
      SELECT l.id as loan_id, l.customer_id, l.principal as loan_amount, l.loan_type, l.date_released, l.status,
             c.customer_code, c.last_name || ', ' || c.first_name as customer_name,
             co.first_name || ' ' || co.last_name as collector_name,
             b.branch_name
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      LEFT JOIN tblBranch b ON l.branch_id = b.id
      WHERE l.date_released = ? AND l.status IN ('active', 'fully_paid') AND ${sqlNotSunday('l.date_released')}
      ORDER BY c.last_name ASC, c.first_name ASC
    `, [date]);

    res.json(releases);
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Server error fetching loan releases' });
  }
});

// Save YTD Overrides
router.post('/save-ytd', authenticateToken, async (req, res) => {
  try {
    const { date, branch_id, ytd_beg_releases, ytd_beg_collections, ytd_beg_expenses } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    let existingQuery = `SELECT id FROM tblDcrYtdOverride WHERE report_date = ?`;
    let existingParams = [date];
    if (branch_id) {
      existingQuery += ` AND branch_id = ?`;
      existingParams.push(branch_id);
    } else {
      existingQuery += ` AND branch_id IS NULL`;
    }

    const existing = await dbGet(existingQuery, existingParams).catch(() => null);

    if (existing) {
      await dbRun(`UPDATE tblDcrYtdOverride SET ytd_beg_releases = ?, ytd_beg_collections = ?, ytd_beg_expenses = ? WHERE id = ?`, [ytd_beg_releases || 0, ytd_beg_collections || 0, ytd_beg_expenses || 0, existing.id]);
    } else {
      await dbRun(`INSERT INTO tblDcrYtdOverride (report_date, branch_id, ytd_beg_releases, ytd_beg_collections, ytd_beg_expenses) VALUES (?, ?, ?, ?, ?)`, [date, branch_id || null, ytd_beg_releases || 0, ytd_beg_collections || 0, ytd_beg_expenses || 0]);
    }

    res.json({ success: true, message: 'YTD balances saved successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error saving YTD balances' });
  }
});

// Close Day
router.post('/close', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { date, branch_id, denom, ytd_beg_releases, ytd_beg_collections, ytd_beg_expenses } = req.body;
    requireOperationDate(date, 'DCR date');
    
    // Check if already closed
    let existingQuery = `SELECT * FROM tblDailyCashReport WHERE report_date = ?`;
    let existingParams = [date];
    if (branch_id) {
      existingQuery += ` AND branch_id = ?`;
      existingParams.push(branch_id);
    }
    const existing = await dbGet(existingQuery, existingParams);
    if (existing) return res.status(400).json({ error: 'This date is already closed for this branch.' });

    // Generate DCR Number
    const countRow = await dbGet(`SELECT COUNT(*) as c FROM tblDailyCashReport WHERE report_date LIKE ?`, [`${date.substring(0,7)}%`]);
    const nextNum = (countRow.c + 1).toString().padStart(6, '0');
    const dcr_number = `DCR-${date.replace(/-/g, '')}-${nextNum}`;

    // Recalculate totals server-side
    let pCond = `p.date_paid = ? AND p.status IN ('active', 'penalty') AND ${sqlNotSunday('p.date_paid')}`;
    let lCond = getDcrLoanCondition();
    let eCond = `e.transaction_date = ? AND e.status = 'active'`;
    let cbCond = `entry_date = ?`;

    const pParams = [date];
    const lParams = [date];
    const eParams = [date];
    const cbParams = [date];

    if (branch_id) {
      pCond += ` AND c.branch_id = ?`; pParams.push(branch_id);
      lCond += ` AND l.branch_id = ?`; lParams.push(branch_id);
      eCond += ` AND e.branch_id = ?`; eParams.push(branch_id);
      cbCond += ` AND branch_id = ?`; cbParams.push(branch_id);
    }

    const collections = await dbAll(`SELECT p.amount_paid, p.payment_type, p.status, p.remarks FROM tblPayment p JOIN tblCustomer c ON p.customer_id = c.id WHERE ${pCond}`, pParams);
    const releases = await dbAll(`SELECT l.net_proceeds, l.principal, l.previous_balance, l.penalty, l.passbook,
      (SELECT COUNT(*) FROM tblPayment pp WHERE pp.loan_id = l.id AND pp.status = 'penalty') as penalty_payment_count
      FROM tblLoan l JOIN tblCustomer c ON l.customer_id = c.id WHERE ${lCond}`, lParams);
    const transactions = await dbAll(`SELECT t.amount, t.transaction_type FROM tblTransaction t WHERE ${eCond.replace(/e\./g, 't.')}`, eParams);
    const bankTx = await dbAll(`SELECT * FROM tblCashOnBank WHERE ${cbCond}`, cbParams);

    const passbooks = transactions.filter(t => t.transaction_type === 'Passbook');
    const penalties = transactions.filter(t => t.transaction_type === 'Penalty');
    const collectorsOver = transactions.filter(t => t.transaction_type === 'Collectors Over');
    const regularCollections = collections.filter(payment => !isReleaseChargePayment(payment) || String(payment.status || '').toLowerCase() === 'penalty');
    const collection_breakdown = getCollectionBreakdown(regularCollections, passbooks, penalties, collectorsOver);
    const releaseChargeBreakdown = getReleaseChargeBreakdown(releases);
    collection_breakdown.balance += releaseChargeBreakdown.balance;
    collection_breakdown.penalty += releaseChargeBreakdown.penalty;
    collection_breakdown.passbook += releaseChargeBreakdown.passbook;
    let total_collections = Object.values(collection_breakdown).reduce((acc, amount) => acc + amount, 0);
    const cash_out_releases = releases.reduce((acc, r) => acc + (r.net_proceeds || 0), 0);
    let total_expenses = 0;
    let other_income = 0;
    let other_disbursements = 0;
    
    transactions.forEach(t => {
      if (t.transaction_type === 'Expense' || t.transaction_type === 'Other Transactions') total_expenses += t.amount;
      else if (t.transaction_type === 'Short Overage') total_expenses += t.amount;
    });
    
    const deposits = bankTx.filter(b => b.transaction_type === 'deposit');
    const withdrawals = bankTx.filter(b => b.transaction_type === 'withdrawal');
    const bankCharges = bankTx.filter(b => b.transaction_type === 'bank_charge');
    const interest = bankTx.filter(b => b.transaction_type === 'interest');

    const total_deposits = deposits.reduce((acc, b) => acc + b.amount, 0);
    const total_withdrawals = withdrawals.reduce((acc, b) => acc + b.amount, 0);
    const total_bank_charges = bankCharges.reduce((acc, b) => acc + b.amount, 0);
    const total_bank_interest = interest.reduce((acc, b) => acc + b.amount, 0);

    let prevDcrQuery = `SELECT actual_cash_count, ending_cash_on_bank FROM tblDailyCashReport WHERE report_date < ?`;
    let prevDcrParams = [date];
    if (branch_id) {
      prevDcrQuery += ` AND branch_id = ?`;
      prevDcrParams.push(branch_id);
    }
    prevDcrQuery += ` ORDER BY report_date DESC LIMIT 1`;
    const prevDcr = await dbGet(prevDcrQuery, prevDcrParams);
    
    const beginning_cash = prevDcr ? prevDcr.actual_cash_count : 0;
    const beginning_cash_on_bank = prevDcr ? prevDcr.ending_cash_on_bank : 0;

    const cash_available = beginning_cash + total_collections + total_withdrawals + other_income;
    const expected_ending_cash = cash_available - cash_out_releases - total_expenses - total_deposits - other_disbursements;
    const ending_cash_on_bank = beginning_cash_on_bank + total_deposits + total_bank_interest - total_withdrawals - total_bank_charges;
    const total_cash_position = expected_ending_cash + ending_cash_on_bank;

    const actual_cash_count = 
      (denom.count_1000 * 1000) + (denom.count_500 * 500) + (denom.count_200 * 200) + 
      (denom.count_100 * 100) + (denom.count_50 * 50) + (denom.count_20 * 20) + denom.count_coins;
    
    const variance = actual_cash_count - expected_ending_cash;

    // Insert DCR
    const result = await dbRun(`
      INSERT INTO tblDailyCashReport (
        dcr_number, branch_id, report_date, beginning_cash, total_collections, total_releases, total_expenses,
        other_income, other_disbursements,
        expected_ending_cash, ending_cash_on_bank, total_cash_position,
        total_deposits, total_withdrawals, total_bank_charges, total_bank_interest,
        count_1000, count_500, count_200, count_100, count_50, count_20, count_coins,
        actual_cash_count, variance, status, closed_by, ytd_beg_releases, ytd_beg_collections, ytd_beg_expenses
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      dcr_number, branch_id, date, beginning_cash, total_collections, cash_out_releases, total_expenses,
      other_income, other_disbursements,
      expected_ending_cash, ending_cash_on_bank, total_cash_position,
      total_deposits, total_withdrawals, total_bank_charges, total_bank_interest,
      denom.count_1000, denom.count_500, denom.count_200, denom.count_100, denom.count_50, denom.count_20, denom.count_coins,
      actual_cash_count, variance, 'CLOSED', req.user.id, ytd_beg_releases || 0, ytd_beg_collections || 0, ytd_beg_expenses || 0
    ]);

    const dcrId = result.lastID;

    // Lock transactions
    if (branch_id) {
      await dbRun(`UPDATE tblPayment SET dcr_id = ? WHERE id IN (SELECT p.id FROM tblPayment p JOIN tblCustomer c ON p.customer_id = c.id WHERE ${pCond}) AND dcr_id IS NULL`, [dcrId, ...pParams]);
      await dbRun(`UPDATE tblLoan SET dcr_id = ? WHERE id IN (SELECT l.id FROM tblLoan l JOIN tblCustomer c ON l.customer_id = c.id WHERE ${lCond}) AND dcr_id IS NULL`, [dcrId, ...lParams]);
      await dbRun(`UPDATE tblTransaction SET dcr_id = ? WHERE id IN (SELECT t.id FROM tblTransaction t WHERE ${eCond.replace(/e\./g, 't.')}) AND dcr_id IS NULL`, [dcrId, ...eParams]);
    } else {
      await dbRun(`UPDATE tblPayment SET dcr_id = ? WHERE date_paid = ? AND status IN ('active', 'penalty') AND ${sqlNotSunday('date_paid')} AND dcr_id IS NULL`, [dcrId, date]);
      await dbRun(`UPDATE tblLoan SET dcr_id = ? WHERE id IN (SELECT l.id FROM tblLoan l WHERE ${lCond}) AND dcr_id IS NULL`, [dcrId, ...lParams]);
      await dbRun(`UPDATE tblTransaction SET dcr_id = ? WHERE transaction_date = ? AND status = 'active' AND dcr_id IS NULL`, [dcrId, date]);
    }

    await dbRun(`INSERT INTO tblLogtime (user_id, action, module) VALUES (?, ?, 'DCR')`, [req.user.id, `CLOSED DAY: ${dcr_number} for ${date}`]);

    res.json({ message: 'Day successfully closed', dcr_number, variance, expected_ending_cash, actual_cash_count });
  } catch (err) {
    sendRouteError(res, err);
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
