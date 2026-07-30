const express = require('express');
const dayjs = require('dayjs');
const { dbAll } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { sqlNotSunday } = require('../services/operationDays');

const router = express.Router();

const toAmount = value => Number(value || 0);
const toDate = value => dayjs(value).format('YYYY-MM-DD');

function resolveDateRange(query) {
  const today = dayjs();
  const defaultTo = today.day() === 0 ? today.subtract(1, 'day') : today;
  const selectedDate = dayjs(query.date || query.date_to || defaultTo).format('YYYY-MM-DD');
  const pastdueCutoff = dayjs(query.pastdue_cutoff || `${dayjs(selectedDate).year()}-05-15`).format('YYYY-MM-DD');

  return {
    from: selectedDate,
    to: selectedDate,
    targetDate: selectedDate,
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
          AND ${sqlNotSunday('p.date_paid')}
      ), 0) as collected_today,
      COALESCE((
        SELECT COUNT(*)
        FROM tblPayment p
        WHERE p.loan_id = l.id
          AND date(p.date_paid) = date(?)
          AND p.status IN ('active', 'penalty')
          AND ${sqlNotSunday('p.date_paid')}
      ), 0) as payment_count_today
      ,
      COALESCE((
        SELECT SUM(p.amount_paid)
        FROM tblPayment p
        WHERE p.loan_id = l.id
          AND date(p.date_paid) = date(?)
          AND p.status = 'active'
          AND LOWER(COALESCE(p.remarks, '')) LIKE '%old balance%'
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
      AND (
        (LOWER(l.status) IN ('active', 'pastdue') AND COALESCE(l.balance, 0) > 0)
        OR EXISTS (
          SELECT 1
          FROM tblPayment p
          WHERE p.loan_id = l.id
            AND date(p.date_paid) = date(?)
            AND p.status IN ('active', 'penalty')
            AND ${sqlNotSunday('p.date_paid')}
        )
      )
  `, [targetDate, targetDate, targetDate, targetDate, collectorId, targetDate]);

  const stats = {
    target: 0,
    collected: 0,
    payment_count: 0,
    paying_clients: 0,
    gross_collected: 0,
    pastdue_deducted: 0,
    active_clients: 0,
    recon_clients: 0,
    overdue_clients: 0,
    pastdue_clients: 0
  };

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

    const priorCollections = customerLoans
      .filter(loan => loan.id !== activeTransferLoan.id && String(loan.status || '').toLowerCase() === 'fullpaid')
      .reduce((totals, loan) => {
        totals.balance += toAmount(loan.balance_collected_today);
        totals.penalty += toAmount(loan.penalty_collected_today);
        return totals;
      }, { balance: 0, penalty: 0 });

    activeTransferLoan.collected_today = toAmount(activeTransferLoan.collected_today) + priorCollections.balance + priorCollections.penalty;
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
    if (shouldDeductFromActual) stats.pastdue_deducted += collectedToday;
    stats.payment_count += toAmount(loan.payment_count_today);
    if (collectedToday > 0) stats.paying_clients += 1;

    if (group === 'pastdue') {
      stats.pastdue_clients += 1;
    } else {
      if (group === 'recon') {
        stats.recon_clients += 1;
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
    const trendMap = new Map(dates.map(date => [date, 0]));
    const collectorRows = [];

    for (const collector of collectors) {
      const sheetStats = await getCollectorSheetStats(collector.id, targetDate, pastdueCutoff);
      const row = {
        ...collector,
        target: sheetStats.target,
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
        active_loans: sheetStats.active_clients + sheetStats.overdue_clients
      };

      for (const date of dates) {
        const dailyStats = date === targetDate ? sheetStats : await getCollectorSheetStats(collector.id, date, pastdueCutoff);
        row.collected += dailyStats.collected;
        row.actual_collection += dailyStats.collected;
        row.gross_collection += dailyStats.gross_collected;
        row.pastdue_deducted += dailyStats.pastdue_deducted;
        row.paying_clients += dailyStats.paying_clients;
        row.payment_count += dailyStats.payment_count;
        trendMap.set(date, (trendMap.get(date) || 0) + dailyStats.collected);
      }

      row.achievement_rate = row.target > 0 ? Math.round((row.collected / row.target) * 100) : 0;
      collectorRows.push(row);
    }

    collectorRows.sort((a, b) => b.collected - a.collected || a.name.localeCompare(b.name));

    const trend = Array.from(trendMap.entries()).map(([date, collected]) => ({ date, collected }));

    const totals = collectorRows.reduce((acc, row) => {
      acc.target += toAmount(row.target);
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
      return acc;
    }, {
      target: 0,
      collected: 0,
      paying_clients: 0,
      active_loans: 0,
      gross_collection: 0,
      pastdue_deducted: 0,
      active_clients: 0,
      recon_clients: 0,
      overdue_clients: 0,
      pastdue_clients: 0,
      payment_count: 0
    });

    const topCollector = collectorRows[0] || null;

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
