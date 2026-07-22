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

const buildClientAddress = (loan) => [
  loan.customer_address_line || loan.address,
  loan.customer_sitio,
  loan.customer_purok,
  loan.customer_brgy,
  loan.customer_city,
  loan.customer_province,
  loan.customer_zip_code
].map(part => String(part || '').trim()).filter(Boolean).join(', ');

const getPreviousOperationDate = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00`);

  do {
    date.setDate(date.getDate() - 1);
  } while (isSundayDate(toLocalDateString(date)));

  return toLocalDateString(date);
};

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
    const latestPaymentDate = latestPaymentDateRes?.max_date || getPreviousOperationDate(today);

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
          1000000 as target,
          COALESCE((SELECT SUM(amount_paid) FROM tblPayment WHERE collector_id = co.id AND date_paid BETWEEN ? AND ? AND status IN ('active', 'penalty') AND ${sqlNotSunday('date_paid')}), 0) as collected
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
      monitoring_alerts_active: (await dbGet(`SELECT COUNT(*) as c FROM tblMonitoringAlert m JOIN tblCustomer c ON m.customer_id = c.id JOIN tblLoan l ON m.loan_id = l.id WHERE m.status='Active' AND LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct')`)).c,
      monitoring_alerts_escalated: (await dbGet(`SELECT COUNT(*) as c FROM tblMonitoringAlert m JOIN tblCustomer c ON m.customer_id = c.id JOIN tblLoan l ON m.loan_id = l.id WHERE m.status='Active' AND m.alert_level='Day 4+' AND LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct')`)).c,
      monitoring_alerts_resolved_today: (await dbGet(`SELECT COUNT(*) as c FROM tblMonitoringAlert m JOIN tblCustomer c ON m.customer_id = c.id JOIN tblLoan l ON m.loan_id = l.id WHERE m.status='Resolved' AND DATE(m.resolved_at)=? AND LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct')`, [today])).c,
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
    const payments = await dbAll(`SELECT p.*, l.loan_code, l.loan_type, c.full_name as customer_name, c.customer_code, co.first_name || ' ' || co.last_name as collector_name FROM tblPayment p LEFT JOIN tblLoan l ON p.loan_id = l.id LEFT JOIN tblCustomer c ON p.customer_id = c.id LEFT JOIN tblCollector co ON p.collector_id = co.id WHERE p.date_paid BETWEEN ? AND ? AND p.status IN ('active', 'penalty') AND ${sqlNotSunday('p.date_paid')} ORDER BY p.date_paid, co.last_name`, [from, to]);
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

    // Get collector info
    const collector = await dbGet(`SELECT id, collector_code, first_name, last_name FROM tblCollector WHERE id = ?`, [collector_id]);
    const collectorName = collector ? `${collector.last_name}, ${collector.first_name}`.toUpperCase() : 'UNASSIGNED';

    // Get active/pastdue loans with collected amounts for the date
    const loans = await dbAll(`
      SELECT l.id, l.loan_code, l.customer_id, l.loan_type, l.principal, l.amortization,
        l.date_released, l.date_maturity, l.balance, l.total_paid, l.status, l.insurance,
        COALESCE(NULLIF(c.full_name, ''), c.last_name || ', ' || c.first_name, 'Unknown') as customer_name,
        c.customer_code,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date_paid = ? AND status IN ('active', 'penalty') AND ${sqlNotSunday('date_paid')}) as collected_today,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date_paid = ? AND status = 'active' AND LOWER(COALESCE(remarks, '')) LIKE '%old balance%' AND ${sqlNotSunday('date_paid')}) as balance_collected_today,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM tblPayment WHERE loan_id = l.id AND date_paid = ? AND status = 'penalty' AND ${sqlNotSunday('date_paid')}) as penalty_collected_today
      FROM tblLoan l
      LEFT JOIN tblCustomer c ON l.customer_id = c.id
      WHERE l.collector_id = ?
        AND (
          (LOWER(l.status) IN ('active', 'pastdue') AND COALESCE(l.balance, 0) > 0)
          OR EXISTS (
            SELECT 1 FROM tblPayment p
            WHERE p.loan_id = l.id
              AND p.date_paid = ?
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
        loan.date_released === targetDate
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
        AND date_released = ?
        AND LOWER(COALESCE(status, '')) != 'reversed'
        AND COALESCE(passbook, 0) > 0
        AND ${sqlNotSunday('date_released')}
    `, [collector_id, targetDate]);
    const pbInsDstTotal = Number(pbInsDst?.total || 0);

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
        fieldRelease: 0,
        totalExpense: 0,
        grandTotal: totalCollection
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

router.get('/monitoring-summary', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // 10 Reports required
    const activeClientsMonitoredToday = (await dbGet(`SELECT COUNT(*) as c FROM tblMonitoringAlert a JOIN tblCustomer c ON a.customer_id = c.id JOIN tblLoan l ON a.loan_id = l.id WHERE a.status='Active' AND LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct')`)).c;
    const escalatedAccounts = (await dbGet(`SELECT COUNT(*) as c FROM tblMonitoringAlert a JOIN tblCustomer c ON a.customer_id = c.id JOIN tblLoan l ON a.loan_id = l.id WHERE a.alert_level='Day 4+' AND a.status='Active' AND LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct')`)).c;
    const resolvedAccounts = (await dbGet(`SELECT COUNT(*) as c FROM tblMonitoringAlert a JOIN tblCustomer c ON a.customer_id = c.id JOIN tblLoan l ON a.loan_id = l.id WHERE a.status='Resolved' AND LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct')`)).c;
    
    // Follow-up success rate
    const totalFollowUps = (await dbGet(`SELECT COUNT(*) as c FROM tblFollowUp`)).c;
    const successfulFollowUps = (await dbGet(`SELECT COUNT(*) as c FROM tblFollowUp WHERE contact_result='Promised to Pay'`)).c;
    const collectorPerformance = totalFollowUps > 0 ? Math.round((successfulFollowUps / totalFollowUps) * 100) + '%' : '0%';
    
    const summaryPTP = (await dbGet(`SELECT COUNT(*) as c, COALESCE(SUM(promised_amount),0) as total FROM tblPromiseToPay WHERE status='Pending'`));
    
    const followUpLogs = await dbAll(`SELECT f.*, a.loan_id FROM tblFollowUp f JOIN tblMonitoringAlert a ON f.alert_id = a.id JOIN tblCustomer c ON a.customer_id = c.id JOIN tblLoan l ON a.loan_id = l.id WHERE LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct') ORDER BY f.created_at DESC LIMIT 5`);
    
    const alertsByBranch = await dbAll(`SELECT u.branch_id, COUNT(*) as count FROM tblMonitoringAlert a JOIN tblCustomer c ON a.customer_id = c.id JOIN tblLoan l ON a.loan_id = l.id JOIN tblUser u ON c.encoded_by = u.id WHERE a.status='Active' AND LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct') GROUP BY u.branch_id`);
    
    const clientsApproachingDay3 = (await dbGet(`SELECT COUNT(*) as c FROM tblMonitoringAlert a JOIN tblCustomer c ON a.customer_id = c.id JOIN tblLoan l ON a.loan_id = l.id WHERE a.status='Active' AND a.consecutive_days = 2 AND LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct')`)).c;
    
    const chronicMissedPayments = (await dbGet(`SELECT COUNT(*) as c FROM tblMonitoringAlert a JOIN tblCustomer c ON a.customer_id = c.id JOIN tblLoan l ON a.loan_id = l.id WHERE a.sequence_number >= 3 AND LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct')`)).c;
    
    const unresolvedOver7Days = (await dbGet(`SELECT COUNT(*) as c FROM tblMonitoringAlert a JOIN tblCustomer c ON a.customer_id = c.id JOIN tblLoan l ON a.loan_id = l.id WHERE a.status='Active' AND a.consecutive_days >= 7 AND LOWER(c.status) IN ('active', 'recon') AND LOWER(l.status) IN ('active', 'recon', 'reconstruct')`)).c;
    
    res.json({
      activeClientsMonitoredToday,
      escalatedAccounts,
      resolvedAccounts,
      collectorPerformance,
      summaryPTP,
      followUpLogs,
      alertsByBranch,
      clientsApproachingDay3,
      chronicMissedPayments,
      unresolvedOver7Days
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
