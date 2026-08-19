const express = require('express');
const dayjs = require('dayjs');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sqlNotSunday } = require('../services/operationDays');

const router = express.Router();

const toAmount = value => Number(value || 0);
const toDate = value => dayjs(value).format('YYYY-MM-DD');

const validWeekStart = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && dayjs(value).isValid() && dayjs(value).day() === 1;

router.get('/week-lock', authenticateToken, async (req, res) => {
  try {
    const weekStart = String(req.query.week_start || '');
    if (!validWeekStart(weekStart)) return res.status(400).json({ error: 'week_start must be a Monday.' });
    const lock = await dbGet(`SELECT l.*, u.full_name as locked_by_name FROM tblCollectorPerformanceWeekLock l LEFT JOIN tblUser u ON u.id = l.locked_by WHERE l.week_start = ?`, [weekStart]);
    if (!lock || lock.status !== 'Locked') return res.json({ locked: false });
    res.json({ locked: true, lock: { ...lock, snapshot: JSON.parse(lock.snapshot_json) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/week-lock', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { week_start: weekStart, week_end: weekEnd, snapshot } = req.body || {};
    if (!validWeekStart(weekStart) || !dayjs(weekEnd).isSame(dayjs(weekStart).add(5, 'day'), 'day') || !snapshot?.collectors?.length) {
      return res.status(400).json({ error: 'A complete Monday-to-Saturday weekly snapshot is required.' });
    }
    const existing = await dbGet(`SELECT id, status FROM tblCollectorPerformanceWeekLock WHERE week_start = ?`, [weekStart]);
    if (existing?.status === 'Locked') return res.status(409).json({ error: 'This week is already locked.' });
    const snapshotJson = JSON.stringify({ dateFrom: weekStart, dateTo: weekEnd, collectors: snapshot.collectors });
    let lockId = existing?.id;
    if (existing) {
      await dbRun(`UPDATE tblCollectorPerformanceWeekLock SET week_end=?, snapshot_json=?, status='Locked', locked_by=?, locked_at=datetime('now'), unlocked_by=NULL, unlocked_at=NULL, unlock_reason=NULL WHERE id=?`, [weekEnd, snapshotJson, req.user.id, existing.id]);
    } else {
      const result = await dbRun(`INSERT INTO tblCollectorPerformanceWeekLock (week_start, week_end, snapshot_json, locked_by) VALUES (?, ?, ?, ?)`, [weekStart, weekEnd, snapshotJson, req.user.id]);
      lockId = result.lastID;
    }
    await dbRun(`INSERT INTO tblCollectorPerformanceWeekLockAudit (week_lock_id, action, changed_by) VALUES (?, 'Lock', ?)`, [lockId, req.user.id]);
    res.status(201).json({ locked: true, snapshot: JSON.parse(snapshotJson) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/week-lock/:weekStart/unlock', authenticateToken, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'An unlock reason is required.' });
    const lock = await dbGet(`SELECT id FROM tblCollectorPerformanceWeekLock WHERE week_start=? AND status='Locked'`, [req.params.weekStart]);
    if (!lock) return res.status(404).json({ error: 'Locked week not found.' });
    await dbRun(`UPDATE tblCollectorPerformanceWeekLock SET status='Unlocked', unlocked_by=?, unlocked_at=datetime('now'), unlock_reason=? WHERE id=?`, [req.user.id, reason, lock.id]);
    await dbRun(`INSERT INTO tblCollectorPerformanceWeekLockAudit (week_lock_id, action, reason, changed_by) VALUES (?, 'Unlock', ?, ?)`, [lock.id, reason, req.user.id]);
    res.json({ locked: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function resolveDateRange(query) {
  const today = dayjs();
  const defaultTo = today.day() === 0 ? today.subtract(1, 'day') : today;
  const selectedDate = dayjs(query.date || query.date_to || defaultTo).format('YYYY-MM-DD');
  const requestedFrom = dayjs(query.date_from || selectedDate);
  const requestedTo = dayjs(selectedDate);
  const from = requestedFrom.isAfter(requestedTo, 'day') ? requestedTo : requestedFrom;
  const pastdueCutoff = dayjs(query.pastdue_cutoff || `${requestedTo.year()}-05-15`).format('YYYY-MM-DD');

  return {
    from: from.format('YYYY-MM-DD'),
    to: requestedTo.format('YYYY-MM-DD'),
    targetDate: requestedTo.format('YYYY-MM-DD'),
    pastdueCutoff
  };
}

function eachOperationDate(from, to) {
  const dates = [];
  let current = dayjs(from);
  const end = dayjs(to);
  while (!current.isAfter(end, 'day')) {
    if (current.day() !== 0) dates.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
  }
  return dates;
}

function classifyCollectionLoan(loan) {
  const dpd = Math.max(0, Number.parseInt(loan.days_past_due, 10) || 0);
  if (dpd >= 45) return 'pastdue';
  if (String(loan.loan_type || '').toLowerCase().includes('recon')) return 'recon';
  if (dpd >= 1) return 'overdue';
  return 'active';
}

// This is intentionally calculated from dated loan/payment records instead of
// the loan's current status.  A weekly report must keep the active-client base
// that existed when the week opened, even after a client pays in full later in
// that same week.
async function getBeginningActiveClientCount(collectorId, weekStart) {
  const rows = await dbAll(`
    SELECT l.id, l.customer_id, l.loan_type, l.date_maturity
    FROM tblLoan l
    WHERE l.collector_id = ?
      AND date(l.date_released) < date(?)
      AND LOWER(COALESCE(l.status, '')) NOT IN ('rejected', 'cancelled', 'reversed', 'closed')
      AND NOT EXISTS (
        SELECT 1
        FROM tblPayment p
        WHERE p.loan_id = l.id
          AND date(p.date_paid) < date(?)
          AND p.status != 'reversed'
          AND COALESCE(p.balance_after, 0) <= 0
      )
  `, [collectorId, weekStart, weekStart]);

  const activeCustomers = new Set();
  for (const loan of rows) {
    const maturityDate = loan.date_maturity ? dayjs(toDate(loan.date_maturity)) : null;
    const isPastDue = maturityDate && dayjs(weekStart).diff(maturityDate, 'day') >= 45;
    const isRecon = String(loan.loan_type || '').toLowerCase().includes('recon');

    if (!isPastDue && !isRecon) activeCustomers.add(loan.customer_id);
  }

  return activeCustomers.size;
}

async function getCollectorSheetStats(collectorId, targetDate, pastdueCutoff) {
  const loans = await dbAll(`
    SELECT
      l.id,
      l.customer_id,
      l.loan_type,
      l.amortization,
      l.date_released,
      l.date_maturity,
      l.balance,
      l.status,
      COALESCE((
        SELECT SUM(p.amount_paid)
        FROM tblPayment p
        WHERE p.loan_id = l.id
          AND date(p.date_paid) = date(?)
          AND p.status IN ('active', 'penalty')
          AND p.status != 'recon'
          AND LOWER(COALESCE(p.payment_type, '')) != 'recon'
          AND ${sqlNotSunday('p.date_paid')}
      ), 0) as collected_today,
      COALESCE((
        SELECT COUNT(*)
        FROM tblPayment p
        WHERE p.loan_id = l.id
          AND date(p.date_paid) = date(?)
          AND p.status IN ('active', 'penalty')
          AND p.status != 'recon'
          AND LOWER(COALESCE(p.payment_type, '')) != 'recon'
          AND ${sqlNotSunday('p.date_paid')}
      ), 0) as payment_count_today
      ,
      COALESCE((
        SELECT SUM(p.amount_paid)
        FROM tblPayment p
        WHERE p.loan_id = l.id
          AND date(p.date_paid) = date(?)
          AND p.status = 'active'
          AND p.status != 'recon'
          AND LOWER(COALESCE(p.payment_type, '')) != 'recon'
          AND (
            LOWER(COALESCE(p.remarks, '')) LIKE '%old balance%'
            OR LOWER(COALESCE(p.payment_type, '')) IN ('balance', 'old_balance')
          )
          AND ${sqlNotSunday('p.date_paid')}
      ), 0) as balance_collected_today,
      COALESCE((
        SELECT SUM(p.amount_paid)
        FROM tblPayment p
        WHERE p.loan_id = l.id
          AND date(p.date_paid) = date(?)
          AND p.status = 'penalty'
          AND ${sqlNotSunday('p.date_paid')}
      ), 0) as penalty_collected_today
    FROM tblLoan l
    WHERE l.collector_id = ?
      AND date(l.date_released) <= date(?)
      AND (
        (LOWER(l.status) IN ('active', 'pastdue') AND COALESCE(l.balance, 0) > 0)
        OR EXISTS (
          SELECT 1
          FROM tblPayment p
          WHERE p.loan_id = l.id
            AND date(p.date_paid) >= date(?)
            AND p.status IN ('active', 'penalty')
            AND p.status != 'recon'
            AND LOWER(COALESCE(p.payment_type, '')) != 'recon'
        )
      )
  `, [targetDate, targetDate, targetDate, targetDate, collectorId, targetDate, targetDate]);

  const stats = {
    target: 0,
    recon_target: 0,
    collected: 0,
    payment_count: 0,
    paying_clients: 0,
    gross_collected: 0,
    pastdue_deducted: 0,
    active_clients: 0,
    recon_clients: 0,
    overdue_clients: 0,
    pastdue_clients: 0,
    new_clients: 0,
    new_client_principal: 0
  };

  const newClientStats = await dbAll(`
    SELECT
      COUNT(DISTINCT l.customer_id) as new_clients,
      COALESCE(SUM(l.principal), 0) as new_client_principal
    FROM tblLoan l
    WHERE l.collector_id = ?
      AND date(l.date_released) = date(?)
      AND LOWER(COALESCE(l.loan_type, 'new')) LIKE '%new%'
      AND LOWER(COALESCE(l.status, '')) != 'reversed'
      AND ${sqlNotSunday('l.date_released')}
  `, [collectorId, targetDate]);

  stats.new_clients = toAmount(newClientStats[0]?.new_clients);
  stats.new_client_principal = toAmount(newClientStats[0]?.new_client_principal);

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
      toDate(loan.date_released) === targetDate
    );

    if (!activeTransferLoan) {
      collectionLoans.push(...customerLoans);
      return;
    }

    const isReconReleaseToday = String(activeTransferLoan.loan_type || '').toLowerCase().includes('recon');

    const priorCollections = customerLoans
      .filter(loan => loan.id !== activeTransferLoan.id && String(loan.status || '').toLowerCase() === 'fullpaid')
      .reduce((totals, loan) => {
        totals.collected += toAmount(loan.collected_today);
        totals.payment_count += toAmount(loan.payment_count_today);
        totals.balance += toAmount(loan.balance_collected_today);
        totals.penalty += toAmount(loan.penalty_collected_today);
        return totals;
      }, { collected: 0, payment_count: 0, balance: 0, penalty: 0 });

    if (!isReconReleaseToday) {
      activeTransferLoan.collected_today = toAmount(activeTransferLoan.collected_today) + priorCollections.collected;
      activeTransferLoan.payment_count_today = toAmount(activeTransferLoan.payment_count_today) + priorCollections.payment_count;
    } else {
      activeTransferLoan.collected_today = toAmount(activeTransferLoan.collected_today) + priorCollections.balance;
      if (priorCollections.balance > 0) {
        activeTransferLoan.payment_count_today = toAmount(activeTransferLoan.payment_count_today) + 1;
      }
    }

    collectionLoans.push(activeTransferLoan);
    collectionLoans.push(...customerLoans.filter(loan =>
      loan.id !== activeTransferLoan.id &&
      String(loan.status || '').toLowerCase() !== 'fullpaid'
    ));
  });

  collectionLoans.forEach(loan => {
    const maturityDate = loan.date_maturity ? dayjs(toDate(loan.date_maturity)) : null;
    loan.days_past_due = maturityDate && dayjs(targetDate).isAfter(maturityDate, 'day')
      ? dayjs(targetDate).diff(maturityDate, 'day')
      : 0;

    let group = classifyCollectionLoan(loan);

    if (String(loan.status || '').toLowerCase() === 'pastdue') {
      group = 'pastdue';
    }

    if (maturityDate && !maturityDate.isAfter(dayjs(pastdueCutoff), 'day')) {
      group = 'pastdue';
    }

    const collectedToday = toAmount(loan.collected_today);
    
    // Only deduct if it's pastdue AND the maturity date is on or before the cutoff date
    const shouldDeductFromActual = group === 'pastdue' && 
      (!maturityDate || !maturityDate.isAfter(dayjs(pastdueCutoff), 'day'));

    stats.gross_collected += collectedToday;
    if (shouldDeductFromActual) {
      stats.pastdue_deducted += collectedToday;
    }
    stats.payment_count += toAmount(loan.payment_count_today);
    if (collectedToday > 0) stats.paying_clients += 1;

    if (group === 'pastdue') {
      stats.pastdue_clients += 1;
    } else {
      if (group === 'recon') {
        stats.recon_clients += 1;
        stats.recon_target += toAmount(loan.amortization);
      } else if (group === 'overdue') {
        stats.overdue_clients += 1;
        if (!String(loan.loan_type || '').toLowerCase().includes('recon')) {
          stats.target += toAmount(loan.amortization);
        }
      } else {
        stats.active_clients += 1;
        stats.target += toAmount(loan.amortization);
      }
    }
  });

  stats.collected = Math.max(0, stats.gross_collected - stats.pastdue_deducted);
  return stats;
}

router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { from, to, targetDate, pastdueCutoff } = resolveDateRange(req.query);

    const collectors = await dbAll(`
      SELECT
        co.id,
        co.collector_code,
        co.first_name || ' ' || co.last_name as name
      FROM tblCollector co
      WHERE co.is_active = 1
        AND LOWER(co.first_name || ' ' || co.last_name) NOT LIKE '%pastdue%'
        AND LOWER(co.first_name || ' ' || co.last_name) NOT LIKE '%melann office%'
      ORDER BY co.last_name ASC, co.first_name ASC
    `);

    const dates = eachOperationDate(from, to);
    const targetDay = dayjs(targetDate);
    const weekStart = (targetDay.day() === 0 ? targetDay.subtract(6, 'day') : targetDay.startOf('week').add(1, 'day'))
      .format('YYYY-MM-DD');
    const trendMap = new Map(dates.map(date => [date, 0]));
    const collectorRows = [];

    for (const collector of collectors) {
      const sheetStats = await getCollectorSheetStats(collector.id, targetDate, pastdueCutoff);
      const beginningActiveClients = await getBeginningActiveClientCount(collector.id, weekStart);
      const row = {
        ...collector,
        target: 0,
        recon_target: 0,
        collected: 0,
        actual_collection: 0,
        gross_collection: 0,
        pastdue_deducted: 0,
        paying_clients: 0,
        payment_count: 0,
        active_clients: sheetStats.active_clients,
        recon_clients: sheetStats.recon_clients,
        overdue_clients: sheetStats.overdue_clients,
        pastdue_clients: sheetStats.pastdue_clients,
        new_clients: 0,
        new_client_principal: 0,
        beginning_active_clients: beginningActiveClients,
        active_loans: sheetStats.active_clients + sheetStats.overdue_clients
      };

      for (const date of dates) {
        const dailyStats = date === targetDate ? sheetStats : await getCollectorSheetStats(collector.id, date, pastdueCutoff);
        row.target += dailyStats.target;
        row.recon_target += dailyStats.recon_target;
        row.collected += dailyStats.collected;
        row.actual_collection += dailyStats.collected;
        row.gross_collection += dailyStats.gross_collected;
        row.pastdue_deducted += dailyStats.pastdue_deducted;
        row.paying_clients += dailyStats.paying_clients;
        row.payment_count += dailyStats.payment_count;
        row.new_clients += dailyStats.new_clients;
        row.new_client_principal += dailyStats.new_client_principal;
        trendMap.set(date, (trendMap.get(date) || 0) + dailyStats.collected);
      }

      row.regular_target = row.target;
      row.with_recon_target = row.target + row.recon_target;

      row.achievement_rate = row.target > 0 ? Math.round((row.collected / row.target) * 100) : 0;
      collectorRows.push(row);
    }

    const trend = Array.from(trendMap.entries()).map(([date, collected]) => ({ date, collected }));

    const totals = collectorRows.reduce((acc, row) => {
      acc.target += toAmount(row.target);
      acc.recon_target += toAmount(row.recon_target);
      acc.collected += toAmount(row.collected);
      acc.paying_clients += toAmount(row.paying_clients);
      acc.active_loans += toAmount(row.active_loans);
      acc.gross_collection += toAmount(row.gross_collection);
      acc.pastdue_deducted += toAmount(row.pastdue_deducted);
      acc.active_clients += toAmount(row.active_clients);
      acc.recon_clients += toAmount(row.recon_clients);
      acc.overdue_clients += toAmount(row.overdue_clients);
      acc.pastdue_clients += toAmount(row.pastdue_clients);
      acc.payment_count += toAmount(row.payment_count);
      acc.new_clients += toAmount(row.new_clients);
      acc.new_client_principal += toAmount(row.new_client_principal);
      return acc;
    }, {
      target: 0,
      recon_target: 0,
      collected: 0,
      paying_clients: 0,
      active_loans: 0,
      gross_collection: 0,
      pastdue_deducted: 0,
      active_clients: 0,
      recon_clients: 0,
      overdue_clients: 0,
      pastdue_clients: 0,
      payment_count: 0,
      new_clients: 0,
      new_client_principal: 0
    });

    const targetOrder = [
      'torreta',
      'domingono',
      'caballes',
      'jugar',
      'rosal',
      'laude'
    ];
    const getSortOrder = (name) => {
      const lowerName = String(name || '').toLowerCase().trim();
      const index = targetOrder.findIndex(target => lowerName.includes(target));
      return index !== -1 ? index : targetOrder.length;
    };

    const topCollector = [...collectorRows].sort((a, b) => b.collected - a.collected)[0] || null;
    collectorRows.sort((a, b) => getSortOrder(a.name) - getSortOrder(b.name) || String(a.name || '').localeCompare(String(b.name || '')));

    res.json({
      date_from: from,
      date_to: to,
      target_date: targetDate,
      actual_date: targetDate,
      pastdue_cutoff: pastdueCutoff,
      totals: {
        ...totals,
        achievement_rate: totals.target > 0 ? Math.round((totals.collected / totals.target) * 100) : 0
      },
      top_collector: topCollector,
      collectors: collectorRows.map(row => ({
        ...row,
        target: toAmount(row.target),
        regular_target: toAmount(row.regular_target),
        recon_target: toAmount(row.recon_target),
        with_recon_target: toAmount(row.with_recon_target),
        collected: toAmount(row.collected),
        actual_collection: toAmount(row.actual_collection),
        gross_collection: toAmount(row.gross_collection),
        pastdue_deducted: toAmount(row.pastdue_deducted),
        paying_clients: toAmount(row.paying_clients),
        active_loans: toAmount(row.active_loans),
        active_clients: toAmount(row.active_clients),
        recon_clients: toAmount(row.recon_clients),
        overdue_clients: toAmount(row.overdue_clients),
        pastdue_clients: toAmount(row.pastdue_clients),
        new_clients: toAmount(row.new_clients),
        new_client_principal: toAmount(row.new_client_principal),
        beginning_active_clients: toAmount(row.beginning_active_clients),
        payment_count: toAmount(row.payment_count),
        achievement_rate: toAmount(row.target) > 0 ? Math.round((toAmount(row.collected) / toAmount(row.target)) * 100) : 0
      })),
      trend
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
