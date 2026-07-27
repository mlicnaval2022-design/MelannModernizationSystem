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
  const defaultFrom = defaultTo.subtract(6, 'day');

  return {
    from: dayjs(query.date_from || defaultFrom).format('YYYY-MM-DD'),
    to: dayjs(query.date_to || defaultTo).format('YYYY-MM-DD')
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
  if (dpd >= 1) return 'overdue';
  if (String(loan.loan_type || '').toLowerCase().includes('recon')) return 'recon';
  return 'active';
}

async function getCollectorSheetStats(collectorId, targetDate) {
  const loans = await dbAll(`
    SELECT
      l.id,
      l.loan_type,
      l.amortization,
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
  `, [targetDate, targetDate, collectorId, targetDate]);

  const stats = {
    target: 0,
    collected: 0,
    payment_count: 0,
    paying_clients: 0,
    active_clients: 0,
    recon_clients: 0,
    pastdue_clients: 0
  };

  loans.forEach(loan => {
    const maturity = loan.date_maturity ? dayjs(toDate(loan.date_maturity)) : null;
    loan.days_past_due = maturity && dayjs(targetDate).isAfter(maturity, 'day')
      ? dayjs(targetDate).diff(maturity, 'day')
      : 0;

    const group = classifyCollectionLoan(loan);
    const collectedToday = toAmount(loan.collected_today);

    if (group === 'pastdue') {
      stats.pastdue_clients += 1;
    } else {
      stats.collected += collectedToday;
      stats.payment_count += toAmount(loan.payment_count_today);
      if (collectedToday > 0) stats.paying_clients += 1;

      if (group === 'recon') {
        stats.recon_clients += 1;
      } else {
        stats.active_clients += 1;
        stats.target += toAmount(loan.amortization);
      }
    }
  });

  return stats;
}

router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const { from, to } = resolveDateRange(req.query);

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
      const sheetStats = await getCollectorSheetStats(collector.id, to);
      const row = {
        ...collector,
        target: sheetStats.target,
        collected: 0,
        paying_clients: 0,
        payment_count: 0,
        active_clients: sheetStats.active_clients,
        recon_clients: sheetStats.recon_clients,
        pastdue_clients: sheetStats.pastdue_clients,
        active_loans: sheetStats.active_clients
      };

      for (const date of dates) {
        const dailyStats = date === to ? sheetStats : await getCollectorSheetStats(collector.id, date);
        row.collected += dailyStats.collected;
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
      acc.active_clients += toAmount(row.active_clients);
      acc.recon_clients += toAmount(row.recon_clients);
      acc.pastdue_clients += toAmount(row.pastdue_clients);
      acc.payment_count += toAmount(row.payment_count);
      return acc;
    }, {
      target: 0,
      collected: 0,
      paying_clients: 0,
      active_loans: 0,
      active_clients: 0,
      recon_clients: 0,
      pastdue_clients: 0,
      payment_count: 0
    });

    const topCollector = collectorRows[0] || null;

    res.json({
      date_from: from,
      date_to: to,
      totals: {
        ...totals,
        achievement_rate: totals.target > 0 ? Math.round((totals.collected / totals.target) * 100) : 0
      },
      top_collector: topCollector,
      collectors: collectorRows.map(row => ({
        ...row,
        target: toAmount(row.target),
        collected: toAmount(row.collected),
        paying_clients: toAmount(row.paying_clients),
        active_loans: toAmount(row.active_loans),
        active_clients: toAmount(row.active_clients),
        recon_clients: toAmount(row.recon_clients),
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
