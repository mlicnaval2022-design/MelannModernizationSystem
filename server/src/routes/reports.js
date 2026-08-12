const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { runPastDueUpdate } = require('../services/pastDueUpdater');
const { requireOperationDate, sqlNotSunday, isSundayDate } = require('../services/operationDays');
const router = express.Router();
const sendRouteError = (res, err) => res.status(err.statusCode || 500).json({ error: err.message });

const toLocalDateString = (date = new Date()) => {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().split('T')[0];
};

const toDateKey = value => String(value || '').slice(0, 10);

const buildMonitoringEligibilityCondition = () => `
  LOWER(c.status) IN ('active', 'recon')
  AND LOWER(c.status) NOT LIKE '%pastdue%'
  AND LOWER(c.status) NOT LIKE '%past due%'
  AND LOWER(l.status) = 'active'
  AND LOWER(l.status) NOT LIKE '%pastdue%'
  AND LOWER(l.status) NOT LIKE '%past due%'
  AND COALESCE(l.balance, 0) > 0
  AND (
    l.date_maturity IS NULL
    OR date(l.date_maturity) >= date(?)
  )
`;

const buildClientAddress = (loan) => [
  loan.customer_address_line || loan.address,
  loan.customer_sitio,
  loan.customer_purok,
  loan.customer_brgy,
  loan.customer_city,
  loan.customer_province,
  loan.customer_zip_code
].map(part => String(part || '').trim()).filter(Boolean).join(', ');

const normalizeLoanTypeKey = type => String(type || '').toUpperCase().replace(/[-\s]/g, '');

const resolvePrintablePreviousBalance = async (loan, findPriorBalancePayment = ({ customerId, dateReleased }) => dbGet(`
  SELECT amount_paid
  FROM tblPayment
  WHERE customer_id = ?
    AND date_paid = ?
    AND status = 'active'
    AND LOWER(COALESCE(remarks, '')) LIKE '%old balance during%'
  ORDER BY id DESC
  LIMIT 1
`, [customerId, dateReleased])) => {
  const normalizedLoanType = normalizeLoanTypeKey(loan.loan_type);
  if (!['RECON', 'RELOAN'].includes(normalizedLoanType) || Number(loan.previous_balance || 0) > 0) {
    return loan.previous_balance;
  }

  const priorBalancePayment = await findPriorBalancePayment({
    customerId: loan.customer_id,
    dateReleased: loan.date_released,
  });

  if (priorBalancePayment) loan.previous_balance = Number(priorBalancePayment.amount_paid || 0);
  return loan.previous_balance;
};

const ensureCollectionFieldReleaseTable = () => dbRun(`
  CREATE TABLE IF NOT EXISTS tblCollectionFieldRelease (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collector_id INTEGER NOT NULL,
    report_date TEXT NOT NULL,
    amount REAL DEFAULT 0,
    created_by INTEGER,
    updated_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(collector_id, report_date)
  )
`);

const getPreviousOperationDate = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00`);

  do {
    date.setDate(date.getDate() - 1);
  } while (isSundayDate(toLocalDateString(date)));

  return toLocalDateString(date);
};

router.get('/collection-sheet/field-releases', authenticateToken, async (req, res) => {
  try {
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];
    requireOperationDate(targetDate, 'Field release date');
    await ensureCollectionFieldReleaseTable();

    const rows = await dbAll(`
      SELECT co.id as collector_id,
             co.collector_code,
             co.first_name,
             co.last_name,
             COALESCE(fr.amount, 0) as amount
      FROM tblCollector co
      LEFT JOIN tblCollectionFieldRelease fr
        ON fr.collector_id = co.id
       AND fr.report_date = ?
      WHERE co.is_active = 1
        AND (
          (LOWER(co.last_name) = 'torreta' AND LOWER(co.first_name) = 'angelito')
          OR (LOWER(co.last_name) IN ('domingono', 'dominggono') AND LOWER(co.first_name) = 'renato')
          OR (LOWER(co.last_name) = 'jugar' AND LOWER(co.first_name) = 'noel')
          OR (LOWER(co.last_name) = 'caballes' AND LOWER(co.first_name) = 'eddie')
          OR (LOWER(co.last_name) = 'rosal' AND LOWER(co.first_name) = 'aldie')
          OR (LOWER(co.last_name) = 'laude' AND LOWER(co.first_name) = 'reynaldo')
        )
      ORDER BY CASE
        WHEN LOWER(co.last_name) = 'torreta' AND LOWER(co.first_name) = 'angelito' THEN 1
        WHEN LOWER(co.last_name) IN ('domingono', 'dominggono') AND LOWER(co.first_name) = 'renato' THEN 2
        WHEN LOWER(co.last_name) = 'jugar' AND LOWER(co.first_name) = 'noel' THEN 3
        WHEN LOWER(co.last_name) = 'caballes' AND LOWER(co.first_name) = 'eddie' THEN 4
        WHEN LOWER(co.last_name) = 'rosal' AND LOWER(co.first_name) = 'aldie' THEN 5
        WHEN LOWER(co.last_name) = 'laude' AND LOWER(co.first_name) = 'reynaldo' THEN 6
        ELSE 99
      END
    `, [targetDate]);

    res.json({ date: targetDate, releases: rows });
  } catch (err) { sendRouteError(res, err); }
});

router.post('/collection-sheet/field-releases', authenticateToken, async (req, res) => {
  try {
    const targetDate = req.body.date || new Date().toISOString().split('T')[0];
    const releases = Array.isArray(req.body.releases) ? req.body.releases : [];
    requireOperationDate(targetDate, 'Field release date');
    await ensureCollectionFieldReleaseTable();

    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    try {
      for (const release of releases) {
        const collectorId = Number(release.collector_id);
        const amount = Number(release.amount || 0);
        if (!collectorId || amount < 0) continue;

        await dbRun(`
          INSERT INTO tblCollectionFieldRelease (collector_id, report_date, amount, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(collector_id, report_date)
          DO UPDATE SET amount = excluded.amount, updated_by = excluded.updated_by, updated_at = datetime('now')
        `, [collectorId, targetDate, amount, req.user.id, req.user.id]);
      }
      await dbRun('COMMIT');
    } catch (err) {
      await dbRun('ROLLBACK').catch(() => {});
      throw err;
    }

    res.json({ message: 'Field release amounts saved', date: targetDate });
  } catch (err) { sendRouteError(res, err); }
});

// Manual past-due updater trigger (admin/manager)
router.post('/run-pastdue', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    await runPastDueUpdate();
    res.json({ message: 'Past-due update completed' });
  } catch (err) { sendRouteError(res, err); }
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
  } catch (err) { sendRouteError(res, err); }
});

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const today = toLocalDateString();
    const now = new Date();
    
    // Find the most recent date before today that has active collections
    const latestPaymentDateRes = await dbGet(`SELECT MAX(date_paid) as max_date FROM tblPayment WHERE status IN ('active', 'penalty') AND date_paid < ? AND ${sqlNotSunday('date_paid')}`, [today]);
    const latestPaymentDate = req.query.date || latestPaymentDateRes?.max_date || getPreviousOperationDate(today);

    const epoch = new Date('2026-01-01T00:00:00Z');
    const diffDays = Math.floor((now - epoch) / (1000 * 60 * 60 * 24));
    const cycleIndex = Math.floor(diffDays / 45);
    const cycleStart = new Date(epoch.getTime() + cycleIndex * 45 * 24 * 60 * 60 * 1000);
    const cycleEnd = new Date(cycleStart.getTime() + 44 * 24 * 60 * 60 * 1000);
    const cycleStartStr = cycleStart.toISOString().split('T')[0];
    const cycleEndStr = cycleEnd.toISOString().split('T')[0];

    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    res.json({
      weekly_collection_trend: await dbAll(`
        SELECT date_paid as date, SUM(amount_paid) as total 
        FROM tblPayment 
        WHERE date_paid >= ? AND date_paid <= ? AND status IN ('active', 'penalty') 
        GROUP BY date_paid 
        ORDER BY date_paid
      `, [weekAgoStr, today]),
      cycle_start: cycleStartStr,
      cycle_end: cycleEndStr,
      total_customers: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='active'`)).c,
      new_customers_this_month: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='active' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`)).c,
      expected_collections_today: (await dbGet(`SELECT COALESCE(SUM(amortization), 0) as total FROM tblLoan WHERE status='active'`)).total,
      collections_this_month: (await dbGet(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM tblPayment WHERE status IN ('active', 'penalty') AND strftime('%Y-%m', date_paid) = strftime('%Y-%m', 'now') AND ${sqlNotSunday('date_paid')}`)).total,
      collections_last_month: (await dbGet(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM tblPayment WHERE status IN ('active', 'penalty') AND strftime('%Y-%m', date_paid) = strftime('%Y-%m', 'now', '-1 month') AND ${sqlNotSunday('date_paid')}`)).total,
      demand_letters_sent: 0,
      total_active_loans: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='active'`)).c,
      total_pastdue: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE date_maturity < ? AND status NOT IN ('fullpaid','reversed')`, [today])).c,
      total_pastdue_amount: (await dbGet(`SELECT COALESCE(SUM(balance), 0) as total FROM tblLoan WHERE date_maturity < ? AND status NOT IN ('fullpaid','reversed')`, [today])).total,
      total_fullpaid: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='fullpaid'`)).c,
      collections_today: (await dbGet(`SELECT COALESCE(SUM(amount_paid),0) as total FROM tblPayment WHERE date_paid=? AND status IN ('active', 'penalty') AND ${sqlNotSunday('date_paid')}`, [today])).total,
      collections_yesterday: (await dbGet(`SELECT COALESCE(SUM(amount_paid),0) as total FROM tblPayment WHERE date_paid=? AND status IN ('active', 'penalty') AND ${sqlNotSunday('date_paid')}`, [latestPaymentDate])).total,
      yesterday_str: latestPaymentDate,
      releases_today: (await dbGet(`SELECT COALESCE(SUM(principal),0) as total FROM tblLoan WHERE date_released = ? AND status IN ('active', 'fully_paid') AND ${sqlNotSunday('date_released')}`, [today])).total,
      loans_released_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE date_released = ? AND status IN ('active', 'fully_paid') AND ${sqlNotSunday('date_released')}`, [today])).c,
      total_portfolio: (await dbGet(`SELECT COALESCE(SUM(balance),0) as total FROM tblLoan WHERE status IN ('active','pastdue')`)).total,
      fully_paid_today: (await dbGet(`SELECT COUNT(DISTINCT customer_id) as c FROM tblCustomerStatusHistory WHERE new_status='FULLY PAID' AND date(created_at) = date('now', 'localtime')`)).c,
      eligible_for_reloan: (await dbGet(`
        SELECT COUNT(*) as c
        FROM tblCustomer c
        WHERE UPPER(c.status) IN ('FULLY PAID', 'RELAX')
          AND NOT EXISTS (
            SELECT 1
            FROM tblLoan l
            WHERE l.customer_id = c.id
              AND LOWER(l.status) IN ('active', 'pastdue')
              AND COALESCE(l.balance, 0) > 0
          )
      `)).c,
      recon_count: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='RECON'`)).c,
      relax_count: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='RELAX'`)).c,
      hold_count: (await dbGet(`SELECT COUNT(*) as c FROM tblCustomer WHERE status='hold'`)).c,
      collector_performance: await dbAll(`
        SELECT 
          co.id, 
          co.first_name || ' ' || co.last_name as name,
          COALESCE((
            SELECT SUM(target_loans.amortization)
            FROM (
              SELECT DISTINCT l.id, l.amortization
              FROM tblLoan l
              WHERE l.collector_id = co.id
                AND (l.date_released IS NULL OR l.date_released <= ?)
                AND LOWER(l.status) IN ('active', 'pastdue')
                AND COALESCE(l.balance, 0) > 0
                AND LOWER(COALESCE(l.loan_type, '')) NOT LIKE '%recon%'
                AND (
                  l.date_maturity IS NULL
                  OR CAST(ROUND(JULIANDAY(?) - JULIANDAY(l.date_maturity)) AS INTEGER) < 45
                )
            ) target_loans
          ), 0) as target,
          COALESCE((
            SELECT SUM(amount_paid)
            FROM tblPayment
            WHERE collector_id = co.id
              AND date_paid = ?
              AND status IN ('active', 'penalty')
              AND ${sqlNotSunday('date_paid')}
          ), 0) as collected
        FROM tblCollector co
        WHERE co.is_active = 1
        AND LOWER(co.first_name || ' ' || co.last_name) NOT LIKE '%pastdue%'
        ORDER BY collected DESC
      `, [latestPaymentDate, latestPaymentDate, latestPaymentDate]),
      recent_activities: await dbAll(`SELECT * FROM tblLogtime ORDER BY created_at DESC LIMIT 10`),
      pending_ci: await dbAll(`SELECT l.id, c.full_name, l.principal, l.created_at FROM tblLoan l JOIN tblCustomer c ON l.customer_id = c.id WHERE l.status = 'pending' ORDER BY l.created_at DESC LIMIT 5`),
      pending_ci_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='pending'`)).c,
      for_approval_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='for_approval'`)).c,
      pending_reloan_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='reloan_pending'`)).c,
      approved_reloan_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='approved' AND loan_type='Re-Loan'`)).c,
      rejected_reloan_count: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='rejected' AND loan_type='Re-Loan'`)).c,
      approved_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='approved' AND DATE(updated_at)=?`, [today])).c,
      rejected_today: (await dbGet(`SELECT COUNT(*) as c FROM tblLoan WHERE status='rejected' AND DATE(updated_at)=?`, [today])).c,
      monitoring_alerts_active: (await dbGet(`
        SELECT COUNT(*) as c
        FROM tblMonitoringAlert m
        JOIN tblCustomer c ON m.customer_id = c.id
        JOIN tblLoan l ON m.loan_id = l.id
        WHERE m.status = 'Active'
          AND ${buildMonitoringEligibilityCondition()}
      `, [today])).c,
      monitoring_alerts_escalated: (await dbGet(`
        SELECT COUNT(*) as c
        FROM tblMonitoringAlert m
        JOIN tblCustomer c ON m.customer_id = c.id
        JOIN tblLoan l ON m.loan_id = l.id
        WHERE m.status = 'Active'
          AND m.alert_level = 'Day 4+'
          AND ${buildMonitoringEligibilityCondition()}
      `, [today])).c,
      monitoring_alerts_resolved_today: (await dbGet(`
        SELECT COUNT(*) as c
        FROM tblMonitoringAlert m
        JOIN tblCustomer c ON m.customer_id = c.id
        JOIN tblLoan l ON m.loan_id = l.id
        WHERE m.status = 'Resolved'
          AND DATE(m.resolved_at) = ?
          AND ${buildMonitoringEligibilityCondition()}
      `, [today, today])).c,
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
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/daily-collection', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const payments = await dbAll(`
      SELECT p.*,
             l.loan_code,
             l.loan_type,
             l.date_maturity,
             CAST(MAX(0, ROUND(JULIANDAY(p.date_paid) - JULIANDAY(l.date_maturity))) AS INTEGER) as days_past_due,
             c.full_name as customer_name,
             c.customer_code,
             co.first_name || ' ' || co.last_name as collector_name
      FROM tblPayment p
      LEFT JOIN tblLoan l ON p.loan_id = l.id
      LEFT JOIN tblCustomer c ON p.customer_id = c.id
      JOIN tblCollector co ON p.collector_id = co.id AND co.is_active = 1
      WHERE p.date_paid BETWEEN ? AND ?
        AND p.status IN ('active', 'penalty')
        AND ${sqlNotSunday('p.date_paid')}
      ORDER BY p.date_paid, co.last_name
    `, [from, to]);
    res.json({ payments, total: payments.reduce((s, p) => s + p.amount_paid, 0), date_from: from, date_to: to });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/monthly-releases', authenticateToken, async (req, res) => {
  try {
    const y = String(req.query.year || new Date().getFullYear());
    const m = String(req.query.month || (new Date().getMonth() + 1)).padStart(2, '0');
    const loans = await dbAll(`SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE strftime('%Y',l.date_released)=? AND strftime('%m',l.date_released)=? AND l.status != 'reversed' AND ${sqlNotSunday('l.date_released')} ORDER BY l.date_released`, [y, m]);
    res.json({ loans, total_principal: loans.reduce((s, l) => s + l.principal, 0), year: y, month: m });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/release-report', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const loans = await dbAll(`
      SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE l.date_released BETWEEN ? AND ?
        AND l.status != 'reversed'
        AND ${sqlNotSunday('l.date_released')}
      ORDER BY l.date_released, co.last_name, c.full_name
    `, [from, to]);
    res.json({ loans, total_principal: loans.reduce((s, l) => s + Number(l.principal || 0), 0), date_from: from, date_to: to });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/past-due', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const loans = await dbAll(`
      SELECT l.*, c.full_name as customer_name, c.customer_code, c.address, c.contact,
             co.first_name || ' ' || co.last_name as collector_name,
             CAST(ROUND(JULIANDAY('now') - JULIANDAY(l.date_maturity)) AS INTEGER) as days_overdue
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE l.date_maturity BETWEEN ? AND ?
        AND l.status IN ('active','pastdue')
        AND COALESCE(l.balance, 0) > 0
      ORDER BY co.last_name, c.full_name, l.date_maturity ASC
    `, [from, to]);
    res.json({
      loans,
      date_from: from,
      date_to: to,
      total_balance: loans.reduce((s, l) => s + Number(l.balance || 0), 0),
      total_principal: loans.reduce((s, l) => s + Number(l.principal || 0), 0),
      total_interest: loans.reduce((s, l) => s + Number(l.interest_amount || 0), 0)
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/payments-encoded', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const data = await dbAll(`SELECT p.*, l.loan_code, c.full_name as customer_name, u.full_name as encoded_by_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblUser u ON p.encoded_by = u.id WHERE p.date_paid BETWEEN ? AND ? AND p.status IN ('active', 'penalty') AND ${sqlNotSunday('p.date_paid')} ORDER BY p.created_at`, [from, to]);
    res.json({ data, total: data.reduce((s, p) => s + p.amount_paid, 0) });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/payments-reversed', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const data = await dbAll(`
      SELECT p.*, l.loan_code, l.loan_type,
             c.full_name as customer_name, c.customer_code,
             co.first_name || ' ' || co.last_name as collector_name,
             u.full_name as reversed_by_name,
             p.reversal_reason
      FROM tblPayment p
      LEFT JOIN tblLoan l ON p.loan_id = l.id
      LEFT JOIN tblCustomer c ON p.customer_id = c.id
      LEFT JOIN tblCollector co ON p.collector_id = co.id
      LEFT JOIN tblUser u ON p.reversed_by = u.id
      WHERE p.status = 'reversed' AND DATE(p.reversed_at) BETWEEN ? AND ?
      ORDER BY co.last_name, p.reversed_at DESC
    `, [from, to]);
    res.json({
      payments: data,
      total: data.reduce((s, p) => s + Number(p.amount_paid || 0), 0),
      date_from: from,
      date_to: to
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/maturity-check', authenticateToken, async (req, res) => {
  try {
    const days = req.query.days_ahead || 30;
    const loans = await dbAll(`SELECT l.*, c.full_name as customer_name, c.contact, co.first_name || ' ' || co.last_name as collector_name, CAST(ROUND(JULIANDAY(l.date_maturity) - JULIANDAY('now')) AS INTEGER) as days_to_maturity FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.status = 'active' AND JULIANDAY(l.date_maturity) - JULIANDAY('now') BETWEEN 0 AND ? ORDER BY l.date_maturity ASC`, [days]);
    res.json({ loans, days_ahead: days });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/full-paid', authenticateToken, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let q = `SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblLoan l LEFT JOIN tblCustomer c ON l.customer_id = c.id LEFT JOIN tblCollector co ON l.collector_id = co.id WHERE l.status = 'fullpaid'`;
    const p = [];
    if (date_from) { q += ` AND DATE(l.updated_at) >= ?`; p.push(date_from); }
    if (date_to) { q += ` AND DATE(l.updated_at) <= ?`; p.push(date_to); }
    q += ` ORDER BY l.updated_at DESC`;
    const loans = await dbAll(q, p);
    res.json({
      loans,
      total_principal: loans.reduce((s, l) => s + Number(l.principal || 0), 0),
      date_from,
      date_to
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/loan-type', authenticateToken, async (req, res) => {
  try {
    const from = req.query.date_from || new Date().toISOString().split('T')[0];
    const to = req.query.date_to || from;
    const loans = await dbAll(`
      SELECT l.*, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE l.date_released BETWEEN ? AND ?
        AND l.status != 'reversed'
        AND ${sqlNotSunday('l.date_released')}
      ORDER BY l.date_released, co.last_name, c.full_name
    `, [from, to]);
    res.json({ loans, date_from: from, date_to: to });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/collection-sheet', authenticateToken, async (req, res) => {
  try {
    const { collector_id, date } = req.query;
    if (!collector_id) return res.status(400).json({ error: 'Please select a collector' });
    const targetDate = date || new Date().toISOString().split('T')[0];
    requireOperationDate(targetDate, 'Collection sheet date');
    await ensureCollectionFieldReleaseTable();

    // Get collector info
    const collector = await dbGet(`SELECT id, collector_code, first_name, last_name FROM tblCollector WHERE id = ?`, [collector_id]);
    const collectorName = collector ? `${collector.last_name}, ${collector.first_name}`.toUpperCase() : 'UNASSIGNED';

    // Get active/pastdue loans with collected amounts for the date
    const loans = await dbAll(`
      SELECT l.id, l.loan_code, l.customer_id, l.loan_type, l.principal, l.amortization,
        l.date_released, l.date_maturity, l.balance, l.total_paid, l.status, l.insurance,
        COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown') as customer_name,
        c.first_name,
        c.last_name,
        c.middle_name,
        c.customer_code,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date(date_paid) = date(?) AND status IN ('active', 'penalty') AND ${sqlNotSunday('date_paid')}) as collected_today,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date(date_paid) = date(?) AND status = 'active' AND LOWER(COALESCE(remarks, '')) LIKE '%old balance%' AND ${sqlNotSunday('date_paid')}) as balance_collected_today,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date(date_paid) = date(?) AND status = 'penalty' AND ${sqlNotSunday('date_paid')}) as penalty_collected_today
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      WHERE l.collector_id = ?
        AND (
          (LOWER(l.status) IN ('active', 'pastdue') AND COALESCE(l.balance, 0) > 0)
          OR EXISTS (
            SELECT 1 FROM tblPayment p
            WHERE p.loan_id = l.id
              AND date(p.date_paid) = date(?)
              AND p.status IN ('active', 'penalty')
              AND ${sqlNotSunday('p.date_paid')}
          )
        )
      ORDER BY c.full_name ASC
    `, [targetDate, targetDate, targetDate, collector_id, targetDate]);

    // Compute days past due for each loan
    const refDate = new Date(targetDate + 'T00:00:00');
    loans.forEach(l => {
      let dpd = 0;
      if (l.date_maturity) {
        const mat = new Date(l.date_maturity + 'T00:00:00');
        if (refDate > mat) {
          dpd = Math.floor((refDate - mat) / (1000 * 60 * 60 * 24));
        }
      }
      l.days_past_due = Math.max(0, dpd);
    });

    const loansByCustomer = loans.reduce((acc, loan) => {
      if (!acc.has(loan.customer_id)) acc.set(loan.customer_id, []);
      acc.get(loan.customer_id).push(loan);
      return acc;
    }, new Map());

    const collectionLoans = [];
    loansByCustomer.forEach(customerLoans => {
      const activeTransferLoan = customerLoans.find(loan =>
        String(loan.status || '').toLowerCase() === 'active' &&
        ['reloan', 'recon'].includes(String(loan.loan_type || '').toLowerCase().replace(/[^a-z0-9]/g, '')) &&
        toDateKey(loan.date_released) === targetDate
      );

      if (!activeTransferLoan) {
        collectionLoans.push(...customerLoans);
        return;
      }

      const priorCollections = customerLoans
        .filter(loan => loan.id !== activeTransferLoan.id && String(loan.status || '').toLowerCase() === 'fullpaid')
        .reduce((totals, loan) => {
          totals.balance += Number(loan.balance_collected_today || 0);
          totals.penalty += Number(loan.penalty_collected_today || 0);
          return totals;
        }, { balance: 0, penalty: 0 });

      activeTransferLoan.reloan_balance_note = priorCollections.balance;
      activeTransferLoan.reloan_penalty_note = priorCollections.penalty;
      collectionLoans.push(activeTransferLoan);
      collectionLoans.push(...customerLoans.filter(loan =>
        loan.id !== activeTransferLoan.id &&
        String(loan.status || '').toLowerCase() !== 'fullpaid'
      ));
    });

    const pbInsDst = await dbGet(`
      SELECT COALESCE(SUM(passbook), 0) as total
      FROM tblLoan
      WHERE collector_id = ?
        AND date(date_released) = date(?)
        AND LOWER(COALESCE(status, '')) != 'reversed'
        AND COALESCE(passbook, 0) > 0
        AND ${sqlNotSunday('date_released')}
    `, [collector_id, targetDate]);
    const pbInsDstTotal = Number(pbInsDst?.total || 0);
    const fieldRelease = await dbGet(`
      SELECT COALESCE(amount, 0) as amount
      FROM tblCollectionFieldRelease
      WHERE collector_id = ?
        AND report_date = ?
    `, [collector_id, targetDate]);
    const fieldReleaseTotal = Number(fieldRelease?.amount || 0);

    // Calculate summary totals
    const totalCollection = collectionLoans.reduce((s, l) => s + Number(l.collected_today || 0), 0);

    res.json({
      loans: collectionLoans,
      collector_id,
      date: targetDate,
      collector: { id: collector?.id, name: collectorName },
      summary: {
        totalCollection,
        pbInsDst: pbInsDstTotal,
        passbookTotal: pbInsDstTotal,
        fieldRelease: fieldReleaseTotal,
        totalExpense: 0,
        grandTotal: totalCollection + pbInsDstTotal - fieldReleaseTotal
      },
      signatures: {
        checkedBy: 'MARILYN O. RELOBA',
        encodedBy: 'IT/ACCOUNTING CLERK',
        approvedBy: 'VICTORIO L. RELOBA JR.'
      }
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/disclosure-statement', authenticateToken, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const selectedLoanId = req.query.loan_id ? Number(req.query.loan_id) : null;

    if (!search && !selectedLoanId) {
      return res.status(400).json({ error: 'Search client code or name first' });
    }

    const baseSelect = `
      SELECT
        l.*,
        c.customer_code,
        c.first_name,
        c.last_name,
        c.middle_name,
        c.full_name as customer_name,
        c.address,
        c.address as customer_address_line,
        c.sitio as customer_sitio,
        c.purok as customer_purok,
        c.brgy as customer_brgy,
        c.city as customer_city,
        c.province as customer_province,
        c.zip_code as customer_zip_code,
        c.contact,
        c.secondary_contact,
        c.birth_date,
        c.gender,
        c.occupation,
        c.business_type,
        c.business_name,
        c.loan_purpose,
        c.email,
        c.fb_account,
        c.messenger_account,
        c.id_type,
        c.id_number,
        c.nationality,
        c.collateral,
        b.branch_name,
        co.first_name || ' ' || co.last_name as collector_name
      FROM tblLoan l
      JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblBranch b ON l.branch_id = b.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
    `;

    const loans = selectedLoanId
      ? await dbAll(`${baseSelect} WHERE l.id = ?`, [selectedLoanId])
      : await dbAll(`
          ${baseSelect}
          WHERE c.customer_code LIKE ?
             OR c.full_name LIKE ?
             OR c.first_name LIKE ?
             OR c.last_name LIKE ?
          ORDER BY
            CASE WHEN LOWER(l.loan_type) LIKE '%re%loan%' THEN 0 ELSE 1 END,
            DATE(l.date_released) DESC,
            l.id DESC
          LIMIT 12
        `, [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]);

    if (loans.length === 0) {
      return res.status(404).json({ error: 'No client or loan found for disclosure statement' });
    }

    const loan = loans[0];
    await resolvePrintablePreviousBalance(loan);
    const clientAddress = buildClientAddress(loan);
    loan.address = clientAddress || loan.address;
    loan.customer_address = loan.address;
    loan.full_address = loan.address;
    const schedule = await dbAll(`
      SELECT period_number, due_date, amount_due, amount_paid, status
      FROM tblAmortizationSchedule
      WHERE loan_id = ?
      ORDER BY period_number ASC
    `, [loan.id]);

    res.json({
      loan,
      schedule,
      loan_options: loans.map(item => ({
        id: item.id,
        loan_code: item.loan_code,
        loan_type: item.loan_type,
        date_released: item.date_released,
        principal: item.principal,
        total_amortization: item.total_amortization,
        status: item.status,
      })),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/aging-report', authenticateToken, async (req, res) => {
  try {
    const dateFrom = req.query.date_from ? toDateKey(req.query.date_from) : '';
    const dateTo = req.query.date_to ? toDateKey(req.query.date_to) : toLocalDateString();
    if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      return res.status(400).json({ error: 'Invalid Date From. Use YYYY-MM-DD format.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return res.status(400).json({ error: 'Invalid Date To. Use YYYY-MM-DD format.' });
    }
    if (dateFrom && dateFrom > dateTo) {
      return res.status(400).json({ error: 'Date From cannot be later than Date To.' });
    }
    const asOf = dateTo;
    const buckets = [
      { key: '1-30', label: '1-30 Days', min: 1, max: 30 },
      { key: '31-60', label: '31-60 Days', min: 31, max: 60 },
      { key: '61-90', label: '61-90 Days', min: 61, max: 90 },
      { key: '91-120', label: '91-120 Days', min: 91, max: 120 },
      { key: '121+', label: '121+ Days', min: 121, max: Infinity },
    ];

    const makeBucketRow = bucket => ({
      bucket_key: bucket.key,
      bucket_label: bucket.label,
      total_clients: 0,
      total_principal: 0,
      total_interest: 0,
      total_loan_amount: 0,
      total_collectibles: 0,
    });

    const maturityDateFilter = dateFrom ? 'AND date(l.date_maturity) >= date(?)' : '';
    const agingLoans = await dbAll(`
      SELECT
        l.id,
        l.customer_id,
        l.loan_code,
        l.principal,
        l.interest_amount,
        COALESCE(l.principal, 0) + COALESCE(l.interest_amount, 0) as total_loan_amount,
        l.balance,
        l.date_maturity,
        c.customer_code,
        c.full_name as customer_name,
        COALESCE(NULLIF(TRIM(co.first_name || ' ' || co.last_name), ''), 'Unassigned') as collector_name,
        CAST(julianday(date(?)) - julianday(date(l.date_maturity)) AS INTEGER) as aging_days
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      LEFT JOIN tblCollector co ON l.collector_id = co.id
      WHERE COALESCE(l.balance, 0) > 0
        AND l.date_maturity IS NOT NULL
        ${maturityDateFilter}
        AND date(l.date_maturity) < date(?)
        AND LOWER(REPLACE(COALESCE(l.status, ''), '_', ' ')) IN ('active', 'pastdue', 'past due', 'recon', 'reconstruct')
      ORDER BY co.first_name, co.last_name, l.date_maturity ASC
    `, dateFrom ? [asOf, dateFrom, asOf] : [asOf, asOf]);

    const overallMap = Object.fromEntries(buckets.map(bucket => [bucket.key, {
      ...makeBucketRow(bucket),
      client_ids: new Set(),
    }]));
    const collectorMaps = {};

    agingLoans.forEach(loan => {
      const days = Number(loan.aging_days || 0);
      const bucket = buckets.find(item => days >= item.min && days <= item.max);
      if (!bucket) return;

      const collector = loan.collector_name || 'Unassigned';
      if (!collectorMaps[collector]) {
        collectorMaps[collector] = Object.fromEntries(buckets.map(item => [item.key, {
          collector,
          ...makeBucketRow(item),
          client_ids: new Set(),
        }]));
      }

      const rows = [overallMap[bucket.key], collectorMaps[collector][bucket.key]];
      rows.forEach(row => {
        if (loan.customer_id) row.client_ids.add(loan.customer_id);
        row.total_principal += Number(loan.principal || 0);
        row.total_interest += Number(loan.interest_amount || 0);
        row.total_loan_amount += Number(loan.total_loan_amount || 0);
        row.total_collectibles += Number(loan.balance || 0);
      });
    });

    const finalizeRow = row => {
      const { client_ids, ...rest } = row;
      return {
        ...rest,
        total_clients: client_ids.size,
      };
    };

    const overall = buckets.map(bucket => finalizeRow(overallMap[bucket.key]));
    const byCollector = Object.keys(collectorMaps)
      .sort((a, b) => a.localeCompare(b))
      .map(collector => ({
        collector,
        buckets: buckets.map(bucket => finalizeRow(collectorMaps[collector][bucket.key])),
      }));

    res.json({
      as_of: asOf,
      date_from: dateFrom,
      date_to: dateTo,
      buckets: overall,
      collectors: byCollector,
      loans: agingLoans,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.__private = {
  normalizeLoanTypeKey,
  resolvePrintablePreviousBalance,
};

module.exports = router;
